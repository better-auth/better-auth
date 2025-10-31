import { APIError } from "../../api";
import type { GenericEndpointContext } from "@better-auth/core";
import type { Session, User } from "../../types";
import type {
	SchemaClient,
	OAuthOptions,
	VerificationValue,
	OAuthRefreshToken,
} from "./types";
import { generateRandomString } from "../../crypto";
import {
	basicToClientCredentials,
	decryptStoredClientSecret,
	getStoredToken,
	getJwtPlugin,
	storeToken,
	validateClientCredentials,
} from "./utils";
import { userNormalClaims } from "./userinfo";
import type { GrantType } from "../../oauth-2.1/types";
import { SignJWT, type JWTPayload } from "jose";
import { signJWT } from "../jwt/sign";
import { toExpJWT } from "../jwt/utils";
import { generateCodeChallenge } from "../../oauth2";

/**
 * Handles the /oauth2/token endpoint by delegating
 * the grant types
 */
export async function tokenEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	const grantType: GrantType | undefined = ctx.body?.grant_type;

	if (opts.grantTypes && grantType && !opts.grantTypes.includes(grantType)) {
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
		case undefined:
			throw new APIError("BAD_REQUEST", {
				error_description: "missing required grant_type",
				error: "unsupported_grant_type",
			});
		default:
			throw new APIError("BAD_REQUEST", {
				error_description: `unsupported grant_type ${grantType}`,
				error: "unsupported_grant_type",
			});
	}
}

// User Jwt SHALL follow oAuth 2
// NOTE: Requires jwt plugin (assert !opts.disableJwtPlugin)
async function createJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	user: User,
	client: SchemaClient,
	audience: string | string[],
	scopes: string[],
	overrides?: {
		iat?: number;
		exp?: number;
		sid?: string;
	},
) {
	const iat = overrides?.iat ?? Math.floor(Date.now() / 1000);
	const expiresIn = opts.accessTokenExpiresIn ?? 3600;
	const exp = overrides?.exp ?? iat + expiresIn;
	const customClaims = opts.customAccessTokenClaims
		? await opts.customAccessTokenClaims({
				user,
				scopes,
				resource: ctx.body.resource,
				referenceId: client.referenceId,
				metadata: client.metadata ? JSON.parse(client.metadata) : undefined,
			})
		: {};

	const jwtPluginOptions = getJwtPlugin(ctx.context).options;

	// Sign token
	return signJWT(ctx, {
		options: jwtPluginOptions,
		payload: {
			...customClaims,
			sub: user.id.toString(),
			aud:
				typeof audience === "string"
					? audience
					: audience?.length === 1
						? audience.at(0)
						: audience,
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
 * Creates a user id token in code_authorization with scope of 'openid'
 * and hybrid/implicit (not yet implemented) flows
 */
async function createIdToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	user: User,
	client: SchemaClient,
	scopes: string[],
	nonce?: string,
) {
	const iat = Math.floor(Date.now() / 1000);
	const expiresIn = 60 * 60 * 10; // 10 hour id token lifetime
	const exp = iat + expiresIn;
	const userClaims = userNormalClaims(user, scopes);
	const authTime = Math.floor(
		(ctx.context.session?.session.createdAt ?? new Date(iat * 1000)).getTime() /
			1000,
	);
	// TODO: this should be validated against the login process
	// - bronze : password only
	// - silver : mfa
	const acr = "urn:mace:incommon:iap:bronze";

	const customClaims = opts.customIdTokenClaims
		? await opts.customIdTokenClaims({
				user,
				scopes,
				referenceId: client.referenceId,
				metadata: client.metadata ? JSON.parse(client.metadata) : undefined,
			})
		: {};

	const jwtPluginOptions = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context).options;

	const payload: JWTPayload = {
		...customClaims,
		...userClaims,
		auth_time: authTime,
		acr,
		iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		sub: user.id,
		aud: client.clientId,
		nonce,
		iat,
		exp,
	};

	// Public clients without a client secret cannot receive an idToken as it can't be verified
	// Confidential clients would still receive an idToken signed by the clientSecret
	if (opts.disableJwtPlugin && !client.clientSecret) {
		return undefined;
	}

	return opts.disableJwtPlugin
		? new SignJWT(payload)
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
		: signJWT(ctx, {
				options: jwtPluginOptions,
				payload,
			});
}

/**
 * Encodes a refresh token for a client
 */
async function encodeRefreshToken(
	opts: OAuthOptions,
	token: string,
	sessionId?: string,
) {
	if (opts.encodeRefreshToken && !opts.decodeRefreshToken) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "decodeRefreshToken should be defined",
		});
	}

	return (
		(opts.refreshTokenPrefix ?? "") +
		(opts.encodeRefreshToken
			? opts.encodeRefreshToken(token, sessionId)
			: token)
	);
}

/**
 * Decodes a refresh token for a client
 *
 * @internal
 */
export async function decodeRefreshToken(opts: OAuthOptions, token: string) {
	if (opts.refreshTokenPrefix) {
		if (token.startsWith(opts.refreshTokenPrefix)) {
			token = token.replace(opts.refreshTokenPrefix, "");
		} else {
			throw new APIError("BAD_REQUEST", {
				error_description: "refresh token not found",
				error: "invalid_token",
			});
		}
	}

	if (opts.decodeRefreshToken && !opts.encodeRefreshToken) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "encodeRefreshToken should be defined",
		});
	}

	return opts.decodeRefreshToken ? opts.decodeRefreshToken(token) : { token };
}

async function createOpaqueAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	user: User | undefined,
	client: SchemaClient,
	scopes: string[],
	payload: JWTPayload,
	refreshId?: string,
) {
	const iat = payload.iat ?? Math.floor(Date.now() / 1000);
	const expiresIn = opts.accessTokenExpiresIn ?? 3600;
	const exp = payload?.exp ?? iat + expiresIn;
	const token = opts.generateOpaqueAccessToken
		? await opts.generateOpaqueAccessToken()
		: generateRandomString(32, "A-Z", "a-z");
	await ctx.context.adapter.create({
		model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
		data: {
			token: await storeToken(opts.storeTokens, token, "access_token"),
			clientId: client.clientId,
			sessionId: payload?.sid,
			userId: user?.id,
			refreshId,
			scopes: scopes.join(" "), // TODO: remove join when native arrays supported
			createdAt: new Date(iat * 1000),
			expiresAt: new Date(exp * 1000),
		},
	});
	return (opts.opaqueAccessTokenPrefix ?? "") + token;
}

async function createRefreshToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	user: User,
	client: SchemaClient,
	scopes: string[],
	payload: JWTPayload,
	originalRefresh?: OAuthRefreshToken & { id: string },
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
			model: opts.schema?.oauthRefreshToken?.modelName ?? "oauthRefreshToken",
			where: [
				{
					field: "id",
					value: originalRefresh.id,
				},
			],
			update: {
				used: new Date(iat * 1000),
			},
		});
	}

	// Issue new refresh token
	const refreshToken = await ctx.context.adapter.create({
		model: opts.schema?.oauthRefreshToken?.modelName ?? "oauthRefreshToken",
		data: {
			token: await storeToken(opts.storeTokens, token, "refresh_token"),
			clientId: client.clientId,
			sessionId,
			userId: user.id,
			scopes: scopes.join(" "), // TODO: remove join when native arrays supported
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
 * and returns a valid audience based on the request
 *
 */
async function checkResource(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	scopes: string[],
) {
	let _aud: string | string[] | undefined = ctx.body.resource;
	const audience = typeof _aud === "string" ? [_aud] : _aud;
	if (audience) {
		// Adds /userinfo to audience
		if (scopes.includes("openid")) {
			audience.push(`${ctx.context.baseURL}/oauth2/userinfo`);
		}
		// Check valid audiences
		const jwtPluginOptions = opts.disableJwtPlugin
			? undefined
			: getJwtPlugin(ctx.context).options;
		const validAudiences = [
			jwtPluginOptions?.jwt?.audience ?? ctx.context.baseURL,
			scopes?.includes("openid")
				? `${ctx.context.baseURL}/oauth2/userinfo`
				: undefined,
		]
			.flat()
			.filter((v) => v?.length);
		for (const aud of audience) {
			if (!validAudiences.includes(aud)) {
				throw new APIError("BAD_REQUEST", {
					error_description: "requested resource invalid",
					error: "invalid_request",
				});
			}
		}
	}
	return audience?.length === 1 ? audience.at(0) : audience;
}

async function createUserTokens(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	client: SchemaClient,
	scopes: string[],
	user: User,
	sessionId?: string,
	nonce?: string,
	additional?: {
		refreshToken?: OAuthRefreshToken & { id: string };
	},
) {
	const iat = Math.floor(Date.now() / 1000);
	const defaultExp = iat + (opts.accessTokenExpiresIn ?? 3600);
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
	const audience = await checkResource(ctx, opts, scopes);
	const isRefreshToken =
		additional?.refreshToken?.scopes?.includes("offline_access") ||
		scopes.includes("offline_access");
	const isJwtAccessToken = audience && !opts.disableJwtPlugin;
	const isIdToken = scopes.includes("openid");

	// Refresh token may need to be created beforehand for id field
	const earlyRefreshToken =
		isRefreshToken && !isJwtAccessToken
			? await createRefreshToken(
					ctx,
					opts,
					user,
					client,
					scopes,
					{
						iat,
						exp: iat + (opts.refreshTokenExpiresIn ?? 2592000),
						sid: sessionId,
					},
					additional?.refreshToken,
				)
			: undefined;

	// Sign jwt and refresh tokens in parallel
	const [accessToken, refreshToken, idToken] = await Promise.all([
		isJwtAccessToken
			? createJwtAccessToken(ctx, opts, user, client, audience, scopes, {
					iat,
					exp,
					sid: sessionId,
				})
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
					earlyRefreshToken?.id,
				),
		earlyRefreshToken
			? earlyRefreshToken
			: isRefreshToken
				? createRefreshToken(
						ctx,
						opts,
						user,
						client,
						scopes,
						{
							iat,
							exp: iat + (opts.refreshTokenExpiresIn ?? 2592000),
							sid: sessionId,
						},
						additional?.refreshToken,
					)
				: undefined,
		isIdToken
			? createIdToken(ctx, opts, user, client, scopes, nonce)
			: undefined,
	]);

	return ctx.json(
		{
			access_token: accessToken,
			expires_in: exp - iat,
			expires_at: exp,
			token_type: "Bearer",
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
	opts: OAuthOptions,
	code: string,
	client_id: string,
	redirect_uri?: string,
) {
	const verification = await ctx.context.internalAdapter.findVerificationValue(
		await storeToken(opts.storeTokens, code, "authorization_code"),
	);
	const verificationValue: VerificationValue = verification
		? JSON.parse(verification?.value)
		: undefined;

	if (!verification) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "Invalid code",
			error: "invalid_verification",
		});
	}

	// Delete used code
	if (verification?.id) {
		await ctx.context.internalAdapter.deleteVerificationValue(verification.id);
	}

	// Check verification
	if (!verification.expiresAt || verification.expiresAt < new Date()) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "code expired",
			error: "invalid_verification",
		});
	}

	// Check verification value
	if (!verificationValue) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "missing verification value content",
			error: "invalid_verification",
		});
	}
	if (verificationValue.type !== "authorization_code") {
		throw new APIError("UNAUTHORIZED", {
			error_description: "incorrect verification type",
			error: "invalid_verification",
		});
	}
	if (verificationValue.query.client_id !== client_id) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "invalid client_id",
			error: "invalid_client",
		});
	}
	if (!verificationValue.userId) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing user_id on challenge",
			error: "invalid_user",
		});
	}
	if (
		verificationValue.query?.redirect_uri &&
		verificationValue.query?.redirect_uri !== redirect_uri
	) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing verification redirect_uri",
			error: "invalid_request",
		});
	}

	return verificationValue;
}

/**
 * Obtains new Session Jwt and Refresh Tokens using a code
 */
async function handleAuthorizationCodeGrant(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	let {
		client_id,
		client_secret,
		code,
		code_verifier,
		redirect_uri,
	}: {
		client_id?: string;
		client_secret?: string;
		code?: string;
		code_verifier?: string;
		redirect_uri?: string;
	} = ctx.body;
	const authorization = ctx.request?.headers.get("authorization") || null;

	// Convert basic authorization
	if (authorization?.startsWith("Basic ")) {
		const res = basicToClientCredentials(authorization);
		client_id = res?.client_id;
		client_secret = res?.client_secret;
	}

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

	if (!(isAuthCodeWithPkce || isAuthCodeWithSecret)) {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"Missing a required credential value for authorization_code grant",
			error: "invalid_request",
		});
	}

	/** Get and check Verification Value */
	const verificationValue = await checkVerificationValue(
		ctx,
		opts,
		code,
		client_id,
		redirect_uri,
	);
	const scopes = verificationValue.query.scope?.split(" ");

	/** Verify Client */
	const client = await validateClientCredentials(
		ctx,
		opts,
		client_id,
		client_secret,
		scopes,
	);

	/** Check challenge */
	const challenge =
		code_verifier && verificationValue.query?.code_challenge_method === "S256"
			? await generateCodeChallenge(code_verifier)
			: undefined;
	if (
		// AuthCodeWithSecret - Required if sent
		isAuthCodeWithSecret &&
		(challenge || verificationValue?.query?.code_challenge) &&
		challenge !== verificationValue.query?.code_challenge
	) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "code verification failed",
			error: "invalid_request",
		});
	}
	if (
		// AuthCodeWithPkce - Always required
		isAuthCodeWithPkce &&
		challenge !== verificationValue.query?.code_challenge
	) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "code verification failed",
			error: "invalid_request",
		});
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

	return createUserTokens(
		ctx,
		opts,
		client,
		verificationValue.query.scope?.split(" ") ?? [],
		user,
		session.id,
		verificationValue.query?.nonce,
	);
}

/**
 * Grant that allows direct access to an API using the application's credentials
 * This grant is for M2M so the concept of a user id does not exist on the token.
 *
 * MUST follow https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
 */
async function handleClientCredentialsGrant(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	let {
		client_id,
		client_secret,
		scope,
	}: {
		client_id?: string;
		client_secret?: string;
		scope?: string;
	} = ctx.body;
	const authorization = ctx.request?.headers.get("authorization") || null;

	// Convert basic authorization
	if (authorization?.startsWith("Basic ")) {
		const res = basicToClientCredentials(authorization);
		client_id = res?.client_id;
		client_secret = res?.client_secret;
	}

	if (!client_id) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing required client_id",
			error: "invalid_grant",
		});
	}
	if (!client_secret) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing a required client_secret",
			error: "invalid_grant",
		});
	}
	if (!scope) scope = opts.clientCredentialGrantDefaultScopes?.join(" ");
	if (!scope) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing required scope",
			error: "invalid_scope",
		});
	}

	// OIDC scopes should not be requestable (code authorization grant should be used)
	const requestedScopes = scope.split(" ");
	const invalidScopes = ["openid", "profile", "email", "offline_access"];
	for (const sc of requestedScopes) {
		if (invalidScopes.includes(sc)) {
			throw new APIError("BAD_REQUEST", {
				error_description: `unable to satisfy scope ${sc}`,
				error: "invalid_scope",
			});
		}
		if (opts.scopes && !opts.scopes.includes(sc)) {
			throw new APIError("BAD_REQUEST", {
				error_description: `invalid scope ${sc}`,
				error: "invalid_scope",
			});
		}
	}

	// Check requested audience if sent as the resource parameter
	const jwtPluginOptions = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context).options;
	const audience = await checkResource(ctx, opts, requestedScopes);

	const client = await validateClientCredentials(
		ctx,
		opts,
		client_id,
		client_secret,
		requestedScopes,
	);

	const iat = Math.floor(Date.now() / 1000);
	const defaultExp = iat + (opts.m2mAccessTokenExpiresIn ?? 3600);
	const exp = opts.scopeExpirations
		? requestedScopes
				.map((sc) =>
					opts.scopeExpirations?.[sc]
						? toExpJWT(opts.scopeExpirations[sc], iat)
						: defaultExp,
				)
				.reduce((prev, curr) => {
					return prev < curr ? prev : curr;
				}, defaultExp)
		: defaultExp;

	const accessToken =
		audience && !opts.disableJwtPlugin
			? await signJWT(ctx, {
					options: jwtPluginOptions,
					payload: {
						aud: audience,
						azp: client.clientId,
						scope: requestedScopes.join(" "),
						iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
						iat,
						exp,
					},
				})
			: await createOpaqueAccessToken(
					ctx,
					opts,
					undefined,
					client,
					requestedScopes,
					{
						iat,
						exp,
					},
				);

	return ctx.json(
		{
			access_token: accessToken,
			expires_in: exp - iat,
			expires_at: exp,
			token_type: "Bearer",
			scope: requestedScopes.join(" "),
		},
		{
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		},
	);
}

/**
 * Obtains new Session Jwt and Refresh Tokens using a refresh token
 *
 * Refresh tokens will only allow the same or lesser scopes as the initial authorize request.
 * To add scopes, you must restart the authorize process again.
 */
async function handleRefreshTokenGrant(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	let {
		client_id,
		client_secret,
		refresh_token,
		scope,
	}: {
		client_id?: string;
		client_secret?: string;
		refresh_token?: string;
		scope?: string;
	} = ctx.body;

	const authorization = ctx.request?.headers.get("authorization") || null;

	// Convert basic authorization
	if (authorization?.startsWith("Basic ")) {
		const res = basicToClientCredentials(authorization);
		client_id = res?.client_id;
		client_secret = res?.client_secret;
	}

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

	const refreshToken = await ctx.context.adapter
		.findOne<OAuthRefreshToken & { id: string }>({
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
		})
		.then((res) => {
			// TODO: remove when native arrays supported
			if (!res) return res;
			return {
				...res,
				scopes: (res?.scopes as unknown as string)?.split(" "),
			} as OAuthRefreshToken & { id: string };
		});

	// Check refresh
	if (!refreshToken) {
		throw new APIError("BAD_REQUEST", {
			error_description: "session not found",
			error: "invalid_request",
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
			error: "invalid_request",
		});
	}
	// Replay revoke (delete all tokens for that user-client)
	if (refreshToken.used || refreshToken.revoked) {
		await ctx.context.adapter.deleteMany({
			model: opts.schema?.oauthRefreshToken?.modelName ?? "oauthRefreshToken",
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
			error: "invalid_request",
		});
	}

	// Check session scopes
	const scopes = refreshToken?.scopes ?? [];
	const requestedScopes = scope?.split(" ");
	if (requestedScopes) {
		for (const requestedScope of requestedScopes) {
			if (!scopes?.includes(requestedScope)) {
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

	// Generate new tokens
	return createUserTokens(
		ctx,
		opts,
		client,
		requestedScopes ?? scopes,
		user,
		refreshToken.sessionId,
		undefined,
		{
			refreshToken,
		},
	);
}
