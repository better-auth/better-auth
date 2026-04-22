import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import { resolveSigningKey, signJWT, toExpJWT } from "better-auth/plugins";
import type { Session, User } from "better-auth/types";
import type { JWTPayload } from "jose";
import { base64url, decodeProtectedHeader, SignJWT } from "jose";
import type {
	OAuthOptions,
	OAuthRefreshToken,
	SchemaClient,
	Scope,
	VerificationValue,
} from "./types";
import type { GrantType } from "./types/oauth";
import { verificationValueSchema } from "./types/zod";
import { userNormalClaims } from "./userinfo";
import {
	decryptStoredClientSecret,
	destructureCredentials,
	extractClientCredentials,
	getJwtPlugin,
	getStoredToken,
	isPKCERequired,
	normalizeTimestampValue,
	parseClientMetadata,
	resolveSessionAuthTime,
	resolveSubjectIdentifier,
	storeToken,
	toAudienceClaim,
	toResourceList,
	validateClientCredentials,
} from "./utils";

/**
 * Handles the /oauth2/token endpoint by delegating
 * the grant types
 */
export async function tokenEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const grantType: GrantType = ctx.body.grant_type;

	if (opts.grantTypes && !opts.grantTypes.includes(grantType)) {
		throw new APIError("BAD_REQUEST", {
			error_description: `unsupported grant_type ${grantType}`,
			error: "unsupported_grant_type",
		});
	}

	switch (grantType) {
		case "authorization_code":
			return handleAuthorizationCodeGrant(ctx, opts);
		case "client_credentials":
			return handleClientCredentialsGrant(ctx, opts);
		case "refresh_token":
			return handleRefreshTokenGrant(ctx, opts);
	}
}

// User Jwt SHALL follow oAuth 2
// NOTE: Requires jwt plugin (assert !opts.disableJwtPlugin)
async function createJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	user: User | undefined,
	client: SchemaClient<Scope[]>,
	audience: string | string[],
	scopes: string[],
	resources?: string[],
	referenceId?: string,
	overrides?: {
		iat?: number;
		exp?: number;
		sid?: string;
	},
) {
	const iat = overrides?.iat ?? Math.floor(Date.now() / 1000);
	const exp = overrides?.exp ?? iat + (opts.accessTokenExpiresIn ?? 3600);
	const customClaims = opts.customAccessTokenClaims
		? await opts.customAccessTokenClaims({
				user,
				scopes,
				resources,
				resource: ctx.body.resource,
				referenceId,
				metadata: parseClientMetadata(client.metadata),
			})
		: {};

	const jwtPluginOptions = getJwtPlugin(ctx.context).options;

	// Sign token
	return signJWT(ctx, {
		options: jwtPluginOptions,
		payload: {
			...customClaims,
			sub: user?.id,
			aud: toAudienceClaim(audience),
			azp: client.clientId,
			scope: scopes.join(" "),
			sid: overrides?.sid,
			iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
			iat,
			exp,
		},
	});
}

/**
 * Computes an OIDC hash (at_hash, c_hash) per OIDC Core §3.1.3.6.
 * Hashes the token, takes the left half, and base64url-encodes it.
 */
async function computeOidcHash(
	token: string,
	signingAlg: string,
): Promise<string> {
	let hashAlg: string;
	if (signingAlg === "EdDSA") {
		hashAlg = "SHA-512";
	} else if (signingAlg.endsWith("384")) {
		hashAlg = "SHA-384";
	} else if (signingAlg.endsWith("512")) {
		hashAlg = "SHA-512";
	} else {
		hashAlg = "SHA-256";
	}

	const digest = new Uint8Array(
		await crypto.subtle.digest(hashAlg, new TextEncoder().encode(token)),
	);
	return base64url.encode(digest.slice(0, digest.length / 2));
}

/**
 * Creates a user id token in code_authorization with scope of 'openid'
 * and hybrid/implicit (not yet implemented) flows
 */
async function createIdToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	user: User,
	client: SchemaClient<Scope[]>,
	scopes: string[],
	nonce?: string,
	sessionId?: string,
	authTime?: Date,
	accessToken?: string,
) {
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + (opts.idTokenExpiresIn ?? 36000);
	const userClaims = userNormalClaims(user, scopes);
	const resolvedSub = await resolveSubjectIdentifier(user.id, client, opts);
	const authTimeSec =
		authTime != null ? Math.floor(authTime.getTime() / 1000) : undefined;
	// TODO: this should be validated against the login process
	// - bronze : password only
	// - silver : mfa
	const acr = "urn:mace:incommon:iap:bronze";

	const customClaims = opts.customIdTokenClaims
		? await opts.customIdTokenClaims({
				user,
				scopes,
				metadata: parseClientMetadata(client.metadata),
			})
		: {};

	const jwtPluginOptions = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context).options;

	// Resolve the signing key once: used for both at_hash and signing
	const resolvedKey =
		!opts.disableJwtPlugin && !jwtPluginOptions?.jwt?.sign
			? await resolveSigningKey(ctx, jwtPluginOptions)
			: undefined;

	// For custom signer, alg is guaranteed set by JWT plugin init validation
	const signingAlg = opts.disableJwtPlugin
		? "HS256"
		: (resolvedKey?.alg ?? jwtPluginOptions?.jwks?.keyPairConfig?.alg!);
	const atHash = accessToken
		? await computeOidcHash(accessToken, signingAlg)
		: undefined;

	const payload: JWTPayload = {
		...userClaims,
		auth_time: authTimeSec,
		acr,
		...customClaims,
		at_hash: atHash,
		iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		sub: resolvedSub,
		aud: client.clientId,
		nonce,
		iat,
		exp,
		sid: client.enableEndSession ? sessionId : undefined,
	};

	// Public clients without a client secret cannot receive an idToken as it can't be verified
	// Confidential clients would still receive an idToken signed by the clientSecret
	if (opts.disableJwtPlugin && !client.clientSecret) {
		return undefined;
	}

	const idToken = opts.disableJwtPlugin
		? await new SignJWT(payload)
				.setProtectedHeader({ alg: "HS256" })
				.sign(
					new TextEncoder().encode(
						await decryptStoredClientSecret(
							ctx,
							opts.storeClientSecret,
							client.clientSecret!,
						),
					),
				)
		: await signJWT(ctx, {
				options: jwtPluginOptions,
				payload,
				resolvedKey: resolvedKey ?? undefined,
			});

	// When using a custom jwt.sign callback, validate that the actual
	// signing algorithm matches what was used for at_hash (OIDC Core §3.1.3.6)
	if (idToken && atHash && jwtPluginOptions?.jwt?.sign) {
		const header = decodeProtectedHeader(idToken);
		if (header.alg !== signingAlg) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				error_description:
					`ID token signed with "${header.alg}" but at_hash was computed ` +
					`for "${signingAlg}". Ensure jwt.sign uses the algorithm ` +
					`declared in keyPairConfig.alg.`,
				error: "server_error",
			});
		}
	}

	return idToken;
}

/**
 * Encodes a refresh token for a client
 */
async function encodeRefreshToken(
	opts: OAuthOptions<Scope[]>,
	token: string,
	sessionId?: string,
) {
	return (
		(opts.prefix?.refreshToken ?? "") +
		(opts.formatRefreshToken?.encrypt
			? opts.formatRefreshToken.encrypt(token, sessionId)
			: token)
	);
}

/**
 * Decodes a refresh token for a client
 *
 * @internal
 */
export async function decodeRefreshToken(
	opts: OAuthOptions<Scope[]>,
	token: string,
) {
	if (opts.prefix?.refreshToken) {
		if (token.startsWith(opts.prefix.refreshToken)) {
			token = token.replace(opts.prefix.refreshToken, "");
		} else {
			throw new APIError("BAD_REQUEST", {
				error_description: "refresh token not found",
				error: "invalid_token",
			});
		}
	}

	return opts.formatRefreshToken?.decrypt
		? opts.formatRefreshToken?.decrypt(token)
		: { token };
}

async function createOpaqueAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	user: User | undefined,
	client: SchemaClient<Scope[]>,
	scopes: string[],
	payload: JWTPayload,
	resources?: string[],
	referenceId?: string,
	refreshId?: string,
) {
	const iat = payload.iat ?? Math.floor(Date.now() / 1000);
	const exp = payload?.exp ?? iat + (opts.accessTokenExpiresIn ?? 3600);
	const token = opts.generateOpaqueAccessToken
		? await opts.generateOpaqueAccessToken()
		: generateRandomString(32, "A-Z", "a-z");
	await ctx.context.adapter.create({
		model: "oauthAccessToken",
		data: {
			token: await storeToken(opts.storeTokens, token, "access_token"),
			clientId: client.clientId,
			sessionId: payload?.sid,
			userId: user?.id,
			referenceId,
			resources,
			refreshId,
			scopes,
			createdAt: new Date(iat * 1000),
			expiresAt: new Date(exp * 1000),
		},
	});
	return (opts.prefix?.opaqueAccessToken ?? "") + token;
}

async function createRefreshToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	user: User,
	referenceId: string | undefined,
	client: SchemaClient<Scope[]>,
	scopes: string[],
	payload: JWTPayload,
	originalRefresh?: OAuthRefreshToken<Scope[]> & { id: string },
	authTime?: Date,
	resources?: string[],
) {
	const iat = payload.iat ?? Math.floor(Date.now() / 1000);
	const exp = payload?.exp ?? iat + (opts.refreshTokenExpiresIn ?? 2592000);
	const token = opts.generateRefreshToken
		? await opts.generateRefreshToken()
		: generateRandomString(32, "A-Z", "a-z");
	const sessionId = payload?.sid as string | undefined;
	// Mark old refresh as stale
	if (originalRefresh?.id) {
		await ctx.context.adapter.update({
			model: "oauthRefreshToken",
			where: [
				{
					field: "id",
					value: originalRefresh.id,
				},
			],
			update: {
				revoked: new Date(iat * 1000),
			},
		});
	}

	// Issue new refresh token
	const refreshToken = await ctx.context.adapter.create({
		model: "oauthRefreshToken",
		data: {
			token: await storeToken(opts.storeTokens, token, "refresh_token"),
			clientId: client.clientId,
			sessionId,
			userId: user.id,
			referenceId,
			authTime,
			resources,
			scopes,
			createdAt: new Date(iat * 1000),
			expiresAt: new Date(exp * 1000),
		},
	});
	return {
		id: refreshToken.id,
		token: await encodeRefreshToken(opts, token, sessionId),
	};
}

/**
 * Checks the resource parameter, if provided,
 * and returns either a valid audience or a tagged validation error.
 */
export async function checkResource(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	resource: string | string[] | undefined,
	scopes: string[],
) {
	const normalizedResource = toResourceList(resource);
	const audience = normalizedResource ? [...normalizedResource] : undefined;
	if (audience) {
		// Adds /userinfo to audience
		if (scopes.includes("openid")) {
			audience.push(`${ctx.context.baseURL}/oauth2/userinfo`);
		}
		// Check valid audiences
		const validAudiences = new Set(
			[
				...(opts.validAudiences ?? [ctx.context.baseURL]),
				scopes?.includes("openid")
					? `${ctx.context.baseURL}/oauth2/userinfo`
					: undefined,
			]
				.flat()
				.filter((v) => v?.length),
		);
		for (const aud of audience) {
			if (!validAudiences.has(aud)) {
				return {
					success: false,
					error: "invalid_resource",
				};
			}
		}
	}
	return {
		success: true,
		audience: toAudienceClaim(audience),
	};
}

interface CreateUserTokensParams {
	client: SchemaClient<Scope[]>;
	scopes: string[];
	grantType: GrantType;
	user?: User;
	referenceId?: string;
	sessionId?: string;
	nonce?: string;
	refreshToken?: OAuthRefreshToken<Scope[]> & { id: string };
	authTime?: Date;
	verificationValue?: VerificationValue;
	resources?: string[];
}

async function createUserTokens(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	params: CreateUserTokensParams,
) {
	const {
		client,
		scopes,
		user,
		grantType,
		referenceId,
		sessionId,
		nonce,
		refreshToken: existingRefreshToken,
		authTime,
		verificationValue,
	} = params;

	const iat = Math.floor(Date.now() / 1000);
	const baseExpiry = user
		? (opts.accessTokenExpiresIn ?? 3600)
		: (opts.m2mAccessTokenExpiresIn ?? 3600);
	const defaultExp = iat + baseExpiry;
	const exp = opts.scopeExpirations
		? scopes
				.map((sc) =>
					opts.scopeExpirations?.[sc]
						? toExpJWT(opts.scopeExpirations[sc], iat)
						: defaultExp,
				)
				.reduce((prev, curr) => {
					return prev < curr ? prev : curr;
				}, defaultExp)
		: defaultExp;

	// Check requested audience if sent as the resource parameter
	const resourceResult = await checkResource(
		ctx,
		opts,
		params?.resources,
		scopes,
	);
	if (!resourceResult.success) {
		throw new APIError("BAD_REQUEST", {
			error_description: "requested resource invalid",
			error: "invalid_target",
		});
	}
	const audience = resourceResult.audience;
	const isRefreshToken =
		user &&
		(existingRefreshToken?.scopes?.includes("offline_access") ||
			scopes.includes("offline_access"));
	const isJwtAccessToken = audience && !opts.disableJwtPlugin;
	const isIdToken = user && scopes.includes("openid");

	// Resolve custom fields before any token side effects (refresh rotation, DB writes)
	const customFields = opts.customTokenResponseFields
		? await opts.customTokenResponseFields({
				grantType,
				user,
				scopes,
				metadata: parseClientMetadata(client.metadata),
				verificationValue,
			})
		: undefined;

	// Refresh token MUST retain the full original set of resources from the previous refresh token per RFC 8707 section 2.2
	const refreshResources = params?.refreshToken?.resources ?? params?.resources;

	// Refresh token may need to be created beforehand for id field
	const earlyRefreshToken =
		isRefreshToken && user && !isJwtAccessToken
			? await createRefreshToken(
					ctx,
					opts,
					user,
					referenceId,
					client,
					scopes,
					{
						iat,
						exp: iat + (opts.refreshTokenExpiresIn ?? 2592000),
						sid: sessionId,
					},
					existingRefreshToken,
					authTime,
					refreshResources,
				)
			: undefined;

	// Create access token and refresh token in parallel
	const [accessToken, refreshToken] = await Promise.all([
		isJwtAccessToken
			? createJwtAccessToken(
					ctx,
					opts,
					user,
					client,
					audience,
					scopes,
					params?.resources,
					referenceId,
					{
						iat,
						exp,
						sid: sessionId,
					},
				)
			: createOpaqueAccessToken(
					ctx,
					opts,
					user,
					client,
					scopes,
					{
						iat,
						exp,
						sid: sessionId,
					},
					params?.resources,
					referenceId,
					earlyRefreshToken?.id,
				),
		earlyRefreshToken
			? earlyRefreshToken
			: isRefreshToken && user
				? createRefreshToken(
						ctx,
						opts,
						user,
						referenceId,
						client,
						scopes,
						{
							iat,
							exp: iat + (opts.refreshTokenExpiresIn ?? 2592000),
							sid: sessionId,
						},
						existingRefreshToken,
						authTime,
						refreshResources,
					)
				: undefined,
	]);

	// ID token created after access token so at_hash can be computed
	const idToken = isIdToken
		? await createIdToken(
				ctx,
				opts,
				user,
				client,
				scopes,
				nonce,
				sessionId,
				authTime,
				accessToken,
			)
		: undefined;

	return ctx.json(
		{
			...customFields,
			access_token: accessToken,
			expires_in: exp - iat,
			expires_at: exp,
			token_type: "Bearer" as const,
			refresh_token: refreshToken?.token,
			scope: scopes.join(" "),
			id_token: idToken,
		},
		{
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		},
	);
}

/** Checks verification value */
async function checkVerificationValue(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	code: string,
	client_id: string,
	redirect_uri?: string,
	resource?: string[],
) {
	const verification = await ctx.context.internalAdapter.findVerificationValue(
		await storeToken(opts.storeTokens, code, "authorization_code"),
	);

	if (!verification) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "Invalid code",
			error: "invalid_verification",
		});
	}

	// Delete used code (single-use per RFC 6749 §4.1.2)
	await ctx.context.internalAdapter.deleteVerificationByIdentifier(
		await storeToken(opts.storeTokens, code, "authorization_code"),
	);

	if (!verification.expiresAt || verification.expiresAt < new Date()) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "code expired",
			error: "invalid_verification",
		});
	}

	let rawValue: unknown;
	try {
		rawValue = JSON.parse(verification.value);
	} catch {
		throw new APIError("UNAUTHORIZED", {
			error_description: "malformed verification value",
			error: "invalid_verification",
		});
	}
	const parsed = verificationValueSchema.safeParse(rawValue);
	if (!parsed.success) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "malformed verification value",
			error: "invalid_verification",
		});
	}
	// Zod's passthrough adds index signature; the schema already validates the structure
	const verificationValue = parsed.data as VerificationValue;

	if (verificationValue.query.client_id !== client_id) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "invalid client_id",
			error: "invalid_client",
		});
	}
	if (
		verificationValue.query?.redirect_uri &&
		verificationValue.query?.redirect_uri !== redirect_uri
	) {
		throw new APIError("BAD_REQUEST", {
			error_description: "redirect_uri mismatch",
			error: "invalid_request",
		});
	}
	// Prefer the new top-level field, but keep compatibility with legacy values in query.resource.
	const storedResources =
		toResourceList(verificationValue.resource) ??
		toResourceList(verificationValue.query.resource);
	const effectiveResources = resource ?? storedResources;

	if (resource && storedResources) {
		const requestedSet = new Set(resource);
		const authorizedSet = new Set(storedResources);
		for (const r of requestedSet) {
			if (!authorizedSet.has(r)) {
				throw new APIError("BAD_REQUEST", {
					error_description: "requested resource not authorized",
					error: "invalid_target",
				});
			}
		}
	}

	return {
		verificationValue,
		effectiveResources,
	};
}

/**
 * Obtains new Session Jwt and Refresh Tokens using a code
 */
async function handleAuthorizationCodeGrant(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const credentials = await extractClientCredentials(
		ctx,
		opts,
		`${ctx.context.baseURL}/oauth2/token`,
	);
	const {
		clientId: client_id,
		clientSecret: client_secret,
		preVerifiedClient,
	} = destructureCredentials(credentials);

	const {
		code,
		code_verifier,
		redirect_uri,
		resource,
	}: {
		code?: string;
		code_verifier?: string;
		redirect_uri?: string;
		resource?: string | string[];
	} = ctx.body;
	const resources = toResourceList(resource);

	if (!client_id) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client_id is required",
			error: "invalid_request",
		});
	}
	if (!code) {
		throw new APIError("BAD_REQUEST", {
			error_description: "code is required",
			error: "invalid_request",
		});
	}
	if (!redirect_uri) {
		throw new APIError("BAD_REQUEST", {
			error_description: "redirect_uri is required",
			error: "invalid_request",
		});
	}

	const isAuthCodeWithSecret = client_id && client_secret;
	const isAuthCodeWithPkce = client_id && code && code_verifier;

	if (!isAuthCodeWithSecret && !isAuthCodeWithPkce && !preVerifiedClient) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Either code_verifier or client_secret is required",
			error: "invalid_request",
		});
	}

	/** Get and check Verification Value */
	const { verificationValue, effectiveResources } =
		await checkVerificationValue(
			ctx,
			opts,
			code,
			client_id,
			redirect_uri,
			resources,
		);
	const scopes = verificationValue.query.scope?.split(" ");
	if (!scopes) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "verification scope unset",
			error: "invalid_scope",
		});
	}

	/** Verify Client */
	const client = await validateClientCredentials(
		ctx,
		opts,
		client_id,
		client_secret,
		scopes,
		preVerifiedClient,
	);

	// Parse scopes from the authorization request
	const requestedScopes =
		(verificationValue.query?.scope as string)?.split(" ") || [];

	// Check if PKCE is required for this client
	const pkceRequired = isPKCERequired(client, requestedScopes);

	// Validate credentials based on requirements
	if (pkceRequired) {
		// PKCE is required - must have code_verifier
		if (!isAuthCodeWithPkce) {
			throw new APIError("BAD_REQUEST", {
				error_description: "PKCE is required for this client",
				error: "invalid_request",
			});
		}
	} else {
		// PKCE is optional - must have either PKCE, client_secret, or client_assertion
		if (!(isAuthCodeWithPkce || isAuthCodeWithSecret || preVerifiedClient)) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"Either PKCE (code_verifier) or client authentication (client_secret or client_assertion) is required",
				error: "invalid_request",
			});
		}
	}

	/** Check PKCE challenge if verifier is provided */
	const pkceUsedInAuth = !!verificationValue.query?.code_challenge;
	const pkceUsedInToken = !!code_verifier;

	if (pkceUsedInAuth || pkceUsedInToken) {
		// PKCE was used - must verify consistency

		if (pkceUsedInAuth && !pkceUsedInToken) {
			// PKCE was used in authorization but not in token exchange
			throw new APIError("UNAUTHORIZED", {
				error_description:
					"code_verifier required because PKCE was used in authorization",
				error: "invalid_request",
			});
		}

		if (!pkceUsedInAuth && pkceUsedInToken) {
			// PKCE was not used in authorization but verifier provided
			throw new APIError("UNAUTHORIZED", {
				error_description:
					"code_verifier provided but PKCE was not used in authorization",
				error: "invalid_request",
			});
		}

		// Both sides used PKCE - verify the challenge
		const challenge =
			verificationValue.query?.code_challenge_method === "S256"
				? await generateCodeChallenge(code_verifier!)
				: undefined;

		if (challenge !== verificationValue.query?.code_challenge) {
			throw new APIError("UNAUTHORIZED", {
				error_description: "code verification failed",
				error: "invalid_request",
			});
		}
	}

	/** Get user */
	if (!verificationValue.userId) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing user, user may have been deleted",
			error: "invalid_user",
		});
	}
	const user = await ctx.context.internalAdapter.findUserById(
		verificationValue.userId,
	);
	if (!user) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing user, user may have been deleted",
			error: "invalid_user",
		});
	}

	// Check if session used is still active
	const session = await ctx.context.adapter.findOne<Session>({
		model: "session",
		where: [
			{
				field: "id",
				value: verificationValue.sessionId,
			},
		],
	});
	if (!session || session.expiresAt < new Date()) {
		throw new APIError("BAD_REQUEST", {
			error_description: "session no longer exists",
			error: "invalid_request",
		});
	}

	const authTime =
		verificationValue.authTime != null
			? normalizeTimestampValue(verificationValue.authTime)
			: resolveSessionAuthTime(session);

	return createUserTokens(ctx, opts, {
		client,
		scopes: verificationValue.query.scope?.split(" ") ?? [],
		user,
		grantType: "authorization_code",
		referenceId: verificationValue.referenceId,
		sessionId: session.id,
		nonce: verificationValue.query?.nonce,
		authTime,
		verificationValue,
		resources: effectiveResources,
	});
}

/**
 * Grant that allows direct access to an API using the application's credentials
 * This grant is for M2M so the concept of a user id does not exist on the token.
 *
 * MUST follow https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
 */
async function handleClientCredentialsGrant(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const credentials = await extractClientCredentials(
		ctx,
		opts,
		`${ctx.context.baseURL}/oauth2/token`,
	);
	const {
		clientId: client_id,
		clientSecret: client_secret,
		preVerifiedClient,
	} = destructureCredentials(credentials);
	const { scope, resource }: { scope?: string; resource?: string } = ctx.body;
	const resources = toResourceList(resource);

	if (!client_id) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing required client_id",
			error: "invalid_grant",
		});
	}
	if (!client_secret && !preVerifiedClient) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing a required client_secret",
			error: "invalid_grant",
		});
	}

	// Note: Scope check is done below instead of through the function since different requirements
	const client = await validateClientCredentials(
		ctx,
		opts,
		client_id,
		client_secret,
		undefined,
		preVerifiedClient,
	);

	// OIDC scopes should not be requestable (code authorization grant should be used)
	let requestedScopes = scope?.split(" ");
	if (requestedScopes) {
		const validScopes = new Set(client.scopes ?? opts.scopes);
		const oidcScopes = new Set([
			"openid",
			"profile",
			"email",
			"offline_access",
		]);
		const invalidScopes = requestedScopes.filter((scope) => {
			return !validScopes?.has(scope) || oidcScopes.has(scope);
		});
		if (invalidScopes.length) {
			throw new APIError("BAD_REQUEST", {
				error_description: `The following scopes are invalid: ${invalidScopes.join(", ")}`,
				error: "invalid_scope",
			});
		}
	}
	// Set default scopes to all those available for that client or all provided scopes.
	if (!requestedScopes) {
		requestedScopes =
			client.scopes ??
			opts.clientCredentialGrantDefaultScopes ??
			opts.scopes ??
			[];
	}

	return createUserTokens(ctx, opts, {
		client,
		scopes: requestedScopes,
		grantType: "client_credentials",
		resources,
	});
}

/**
 * Obtains new Session Jwt and Refresh Tokens using a refresh token
 *
 * Refresh tokens will only allow the same or lesser scopes as the initial authorize request.
 * To add scopes, you must restart the authorize process again.
 */
async function handleRefreshTokenGrant(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const credentials = await extractClientCredentials(
		ctx,
		opts,
		`${ctx.context.baseURL}/oauth2/token`,
	);
	const {
		clientId: client_id,
		clientSecret: client_secret,
		preVerifiedClient,
	} = destructureCredentials(credentials);

	const {
		refresh_token,
		scope,
		resource,
	}: {
		refresh_token?: string;
		scope?: string;
		resource?: string | string[];
	} = ctx.body;
	const resources = toResourceList(resource);

	if (!client_id) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing required client_id",
			error: "invalid_grant",
		});
	}

	if (!refresh_token) {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"Missing a required refresh_token for refresh_token grant",
			error: "invalid_grant",
		});
	}
	const decodedRefresh = await decodeRefreshToken(opts, refresh_token);

	const refreshToken = await ctx.context.adapter.findOne<
		OAuthRefreshToken<Scope[]> & { id: string }
	>({
		model: "oauthRefreshToken",
		where: [
			{
				field: "token",
				value: await getStoredToken(
					opts.storeTokens,
					decodedRefresh.token,
					"refresh_token",
				),
			},
		],
	});

	// Check refresh
	if (!refreshToken) {
		throw new APIError("BAD_REQUEST", {
			error_description: "session not found",
			error: "invalid_grant",
		});
	}
	if (refreshToken.clientId !== client_id) {
		throw new APIError("BAD_REQUEST", {
			error_description: "invalid client_id",
			error: "invalid_client",
		});
	}
	if (refreshToken.expiresAt < new Date()) {
		throw new APIError("BAD_REQUEST", {
			error_description: "invalid refresh token",
			error: "invalid_grant",
		});
	}
	// Replay revoke (delete all tokens for that user-client)
	if (refreshToken.revoked) {
		await ctx.context.adapter.deleteMany({
			model: "oauthRefreshToken",
			where: [
				{
					field: "clientId",
					value: client_id,
				},
				{
					field: "userId",
					value: refreshToken.userId,
				},
			],
		});
		throw new APIError("BAD_REQUEST", {
			error_description: "invalid refresh token",
			error: "invalid_grant",
		});
	}

	// Check body resources against refresh token resources
	if (
		resources &&
		refreshToken.resources &&
		!resources.every((v) => refreshToken.resources?.includes(v))
	) {
		throw new APIError("BAD_REQUEST", {
			error_description: "requested resource invalid",
			error: "invalid_target",
		});
	}

	// Check session scopes
	const scopes = refreshToken?.scopes;
	const requestedScopes = scope?.split(" ");
	if (requestedScopes) {
		const validScopes = new Set(scopes);
		for (const requestedScope of requestedScopes) {
			if (!validScopes.has(requestedScope)) {
				throw new APIError("BAD_REQUEST", {
					error_description: `unable to issue scope ${requestedScope}`,
					error: "invalid_scope",
				});
			}
		}
	}

	const client = await validateClientCredentials(
		ctx,
		opts,
		client_id,
		client_secret, // Optional for refresh_grant but required on confidential clients
		requestedScopes ?? scopes,
		preVerifiedClient,
	);

	const user = await ctx.context.internalAdapter.findUserById(
		refreshToken.userId,
	);
	if (!user) {
		throw new APIError("BAD_REQUEST", {
			error_description: "user not found",
			error: "invalid_request",
		});
	}

	const authTime =
		refreshToken.authTime != null
			? normalizeTimestampValue(refreshToken.authTime)
			: undefined;

	// Generate new tokens
	return createUserTokens(ctx, opts, {
		client,
		scopes: requestedScopes ?? scopes,
		user,
		grantType: "refresh_token",
		referenceId: refreshToken.referenceId,
		sessionId: refreshToken.sessionId,
		refreshToken,
		resources: resources ?? refreshToken.resources,
		authTime,
	});
}
