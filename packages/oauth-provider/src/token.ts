import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import {
	createDpopReplayStore,
	generateCodeChallenge,
	getConfirmationJkt,
	isDpopProofError,
	verifyDpopProof,
} from "better-auth/oauth2";
import { resolveSigningKey, signJWT, toExpJWT } from "better-auth/plugins";
import type { Session, User } from "better-auth/types";
import type { JWTPayload } from "jose";
import { base64url, decodeProtectedHeader, SignJWT } from "jose";
import {
	stripReservedIdTokenClaims,
	UNSPECIFIED_ACR,
} from "./authentication-context";
import { resolveAccessTokenClaims } from "./claims";
import { getDpopProofJwt, getEndpointUrl } from "./dpop";
import {
	collectExtensionIdTokenClaims,
	getExtensionGrantHandler,
	getSupportedGrantTypes,
} from "./extensions";
import type { ResolvedResourcePolicy } from "./resources";
import { resolveResourcePolicy } from "./resources";
import type {
	Confirmation,
	OAuthAuthenticatedClient,
	OAuthClientAuthenticationRequest,
	OAuthOptions,
	OAuthProviderApi,
	OAuthRefreshToken,
	OAuthTokenIssueParams,
	OAuthTokenResponse,
	SchemaClient,
	Scope,
	StoreTokenType,
	TokenType,
	VerificationValue,
} from "./types";
import type { GrantType } from "./types/oauth";
import { verificationValueSchema } from "./types/zod";
import { pickClaims } from "./userinfo";
import {
	clientAllowsGrant,
	decryptStoredClientSecret,
	destructureCredentials,
	extractClientCredentials,
	getClient,
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

const ID_TOKEN_SCOPE_CLAIM_GUARDS = {
	name: undefined,
	picture: undefined,
	given_name: undefined,
	family_name: undefined,
	email: undefined,
	email_verified: undefined,
} satisfies Record<string, undefined>;

/**
 * Token presentation scheme implied by a confirmation: a DPoP key thumbprint
 * (`jkt`) yields `"DPoP"`; any other confirmation (including mTLS `x5t#S256`)
 * keeps `"Bearer"`, since that constraint lives at the TLS layer.
 */
export function confirmationTokenType(confirmation?: Confirmation): TokenType {
	return getConfirmationJkt(confirmation) ? "DPoP" : "Bearer";
}

const JWT_ACCESS_TOKEN_TYPE = "at+jwt";

/**
 * Handles the /oauth2/token endpoint by delegating
 * the grant types
 */
export async function tokenEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const grantType: GrantType = ctx.body.grant_type;

	if (!getSupportedGrantTypes(opts).includes(grantType)) {
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
		default: {
			const handler = getExtensionGrantHandler(opts, grantType);
			if (handler) {
				return handler({
					ctx,
					opts,
					grantType,
					provider: getOAuthProviderApi(ctx, opts, grantType),
				});
			}
			throw new APIError("BAD_REQUEST", {
				error_description: `unsupported grant_type ${grantType}`,
				error: "unsupported_grant_type",
			});
		}
	}
}

/**
 * Returns the OAuth Provider's server-side capability surface bound to `ctx`.
 * The token endpoint passes one (pre-bound to the dispatched grant) to each
 * extension grant handler; a companion plugin's own endpoint calls this directly
 * with its grant type. `grantType` is bound here, not per issuance, so a handler
 * cannot mislabel the grant; omit it for capabilities that do not issue tokens
 * (`getClient`, `validateAccessToken`, `requireActiveAccessToken`), and
 * `issueTokens` then throws.
 */
export function getOAuthProviderApi(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	grantType?: GrantType,
): OAuthProviderApi {
	return {
		getClient: (clientId: string) => getClient(ctx, opts, clientId),
		authenticateClient: async (
			request?: OAuthClientAuthenticationRequest,
		): Promise<OAuthAuthenticatedClient> => {
			const credentials = await extractClientCredentials(
				ctx,
				opts,
				// Bind the RFC 7523 assertion audience to the endpoint actually
				// serving this request: the token endpoint for an in-grant handler,
				// or a plugin's own endpoint out-of-grant. A fixed token-endpoint
				// audience would let an assertion be replayed across endpoints, or
				// reject a valid assertion minted for the real endpoint.
				`${ctx.context.baseURL}${ctx.path ?? "/oauth2/token"}`,
			);
			const { clientId, clientSecret, preVerified, authMethod, confirmation } =
				destructureCredentials(credentials);
			if (!clientId) {
				throw new APIError("BAD_REQUEST", {
					error_description: "Missing required client_id",
					error: "invalid_grant",
				});
			}
			if (
				request?.requireCredentials !== false &&
				!clientSecret &&
				!preVerified
			) {
				throw new APIError("BAD_REQUEST", {
					error_description: "Missing required client credentials",
					error: "invalid_grant",
				});
			}
			const client = await validateClientCredentials(
				ctx,
				opts,
				clientId,
				clientSecret,
				request?.scopes,
				preVerified,
				grantType,
				authMethod,
			);
			return {
				clientId,
				client,
				method: authMethod,
				confirmation,
			};
		},
		issueTokens: (params: OAuthTokenIssueParams) => {
			if (!grantType) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					error_description:
						"issueTokens requires a grant type; pass it to getOAuthProviderApi(ctx, opts, grantType).",
					error: "server_error",
				});
			}
			return createUserTokens(ctx, opts, { ...params, grantType });
		},
		hashToken: (token: string, type: StoreTokenType) =>
			storeToken(opts.storeTokens, token, type),
		validateAccessToken: async (token: string, clientId?: string) => {
			const { validateAccessToken } = await import("./introspect");
			return validateAccessToken(ctx, opts, token, clientId);
		},
		requireActiveAccessToken: async (token: string, clientId?: string) => {
			const { requireActiveAccessToken } = await import("./introspect");
			return requireActiveAccessToken(ctx, opts, token, clientId);
		},
	};
}

// User Jwt SHALL follow oAuth 2
// NOTE: Requires jwt plugin (assert !opts.disableJwtPlugin)
async function createJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	user: User | undefined,
	client: SchemaClient<Scope[]>,
	audienceClaim: string | string[],
	scopes: string[],
	overrides?: {
		iat?: number;
		exp?: number;
		sid?: string;
		/**
		 * Per-resource signing config resolved by {@link resolveResourcePolicy}.
		 * `null` falls back to the JWT plugin's primary key.
		 */
		signingAlgorithm?: ResolvedResourcePolicy["signingAlgorithm"];
		signingKeyId?: ResolvedResourcePolicy["signingKeyId"];
		/**
		 * Enriched access-token claims from {@link resolveAccessTokenClaims}
		 * (reserved AS-owned names already stripped). The AS-owned claims below
		 * are stamped after and always win.
		 */
		accessTokenClaims?: Record<string, unknown>;
		/**
		 * Sender-constraint to stamp as the RFC 7800 `cnf` claim. AS-owned: it is
		 * stamped after the enriched claims (which have `cnf` stripped), so a
		 * contributor cannot forge it.
		 */
		confirmation?: Confirmation;
	},
) {
	const iat = overrides?.iat ?? Math.floor(Date.now() / 1000);
	const exp = overrides?.exp ?? iat + (opts.accessTokenExpiresIn ?? 3600);

	const jwtPluginOptions = getJwtPlugin(ctx.context).options;
	const subject = user?.id ?? client.clientId;

	// Sign token — pass per-resource signing config if set; otherwise fall
	// back to the JWT plugin's default.
	return signJWT(ctx, {
		options: jwtPluginOptions,
		header: { typ: JWT_ACCESS_TOKEN_TYPE },
		signingKeyId: overrides?.signingKeyId ?? undefined,
		signingAlgorithm: overrides?.signingAlgorithm ?? undefined,
		payload: {
			...(overrides?.accessTokenClaims ?? {}),
			// RFC 9068 §2.2 requires `sub` on every JWT access token. For
			// client_credentials, no resource owner participates, so the client is
			// the subject represented to the resource server.
			sub: subject,
			aud: toAudienceClaim(audienceClaim),
			// RFC 9068 §2.2.3: `client_id` MUST be present in JWT access tokens.
			// Distinct from `azp` (authorized party — OIDC), kept for back-compat
			// with introspection flows that key on it. The AS owns this value;
			// `resolveAccessTokenClaims` strips reserved names so resource or
			// plugin claims can't override it.
			client_id: client.clientId,
			azp: client.clientId,
			scope: scopes.join(" "),
			sid: overrides?.sid,
			iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
			iat,
			exp,
			// RFC 9068 §2.2.4: `jti` SHOULD be present. Emit a 128-bit random ID
			// so audit trails and (future) revocation lookups can reference
			// individual tokens.
			jti: generateRandomString(32),
			// RFC 7800 sender-constraint, stamped last so the AS owns it.
			...(overrides?.confirmation ? { cnf: overrides.confirmation } : {}),
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
	extraClaims?: Record<string, unknown>,
) {
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + (opts.idTokenExpiresIn ?? 36000);
	const resolvedSub = await resolveSubjectIdentifier(user.id, client, opts);
	const authTimeSec =
		authTime != null ? Math.floor(authTime.getTime() / 1000) : undefined;

	const customClaims = stripReservedIdTokenClaims(
		opts.customIdTokenClaims
			? await opts.customIdTokenClaims({
					user,
					scopes,
					metadata: parseClientMetadata(client.metadata),
				})
			: undefined,
	);

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

	const emitSid = Boolean(
		client.enableEndSession || client.backchannelLogoutUri,
	);
	const payload: JWTPayload = {
		...ID_TOKEN_SCOPE_CLAIM_GUARDS,
		auth_time: authTimeSec,
		acr: UNSPECIFIED_ACR,
		...customClaims,
		at_hash: atHash,
		iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		sub: resolvedSub,
		aud: client.clientId,
		nonce,
		iat,
		exp,
		sid: emitSid ? sessionId : undefined,
	};
	// Extension and grant claims are additive: reserved OIDC/JWT names are
	// stripped, and the remaining claims only fill keys the provider does not
	// already own.
	const additiveClaims = stripReservedIdTokenClaims(extraClaims);
	Object.assign(payload, pickClaims(additiveClaims, payload));

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
	authorizationCodeId?: string,
	refreshId?: string,
	confirmation?: Confirmation,
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
			authorizationCodeId,
			resources,
			refreshId,
			confirmation,
			scopes,
			createdAt: new Date(iat * 1000),
			expiresAt: new Date(exp * 1000),
		},
	});
	return (opts.prefix?.opaqueAccessToken ?? "") + token;
}

/**
 * Tear down the entire refresh-token family for a (client, user) pair, plus
 * any access tokens that reference those refresh rows, per RFC 9700 §4.14.
 * Access tokens are deleted first so the parent rows' foreign-key children
 * do not block the refresh-row delete.
 *
 * TODO(invalidate-family-race): the two `deleteMany` calls are not atomic
 * with respect to each other. Between them, a concurrent rotation in a
 * different worker can `create` a fresh refresh row (and, immediately after,
 * an access-token row referencing it) for the same (client, user) pair,
 * leaving the family partially rebuilt and the new refresh row orphaned of
 * any deletion. Closing this window requires the same transactional adapter
 * contract tracked under FIXME(strict-family-invalidation) in
 * `createRefreshToken`.
 *
 * @internal
 */
export async function invalidateRefreshFamily(
	ctx: GenericEndpointContext,
	clientId: string,
	userId: string,
) {
	const refreshTokens = await ctx.context.adapter.findMany<{ id: string }>({
		model: "oauthRefreshToken",
		where: [
			{ field: "clientId", value: clientId },
			{ field: "userId", value: userId },
		],
	});
	if (refreshTokens.length) {
		await ctx.context.adapter.deleteMany({
			model: "oauthAccessToken",
			where: [
				{
					field: "refreshId",
					operator: "in",
					value: refreshTokens.map((r) => r.id),
				},
			],
		});
	}
	await ctx.context.adapter.deleteMany({
		model: "oauthRefreshToken",
		where: [
			{ field: "clientId", value: clientId },
			{ field: "userId", value: userId },
		],
	});
}

async function revokeTokensIssuedForAuthorizationCode(
	ctx: GenericEndpointContext,
	authorizationCodeId: string,
) {
	const deleteIssuedTokens = async (
		model: "oauthAccessToken" | "oauthRefreshToken",
	) => {
		try {
			await ctx.context.adapter.deleteMany({
				model,
				where: [{ field: "authorizationCodeId", value: authorizationCodeId }],
			});
		} catch (error) {
			ctx.context.logger.error(
				"authorization code replay cleanup failed",
				error,
			);
		}
	};

	await deleteIssuedTokens("oauthAccessToken");
	await deleteIssuedTokens("oauthRefreshToken");
}

async function createRefreshToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	user: User,
	referenceId: string | undefined,
	authorizationCodeId: string | undefined,
	client: SchemaClient<Scope[]>,
	scopes: string[],
	payload: JWTPayload,
	originalRefresh?: OAuthRefreshToken<Scope[]> & { id: string },
	authTime?: Date,
	resources?: string[],
	confirmation?: Confirmation,
) {
	const iat = payload.iat ?? Math.floor(Date.now() / 1000);
	const exp = payload?.exp ?? iat + (opts.refreshTokenExpiresIn ?? 2592000);
	const token = opts.generateRefreshToken
		? await opts.generateRefreshToken()
		: generateRandomString(32, "A-Z", "a-z");
	const sessionId = payload?.sid as string | undefined;
	const storedToken = await storeToken(
		opts.storeTokens,
		token,
		"refresh_token",
	);
	const newRow = {
		token: storedToken,
		clientId: client.clientId,
		sessionId,
		userId: user.id,
		referenceId,
		authorizationCodeId,
		authTime,
		confirmation,
		scopes,
		resources,
		createdAt: new Date(iat * 1000),
		expiresAt: new Date(exp * 1000),
	};

	// Initial issuance (no rotation): single insert.
	if (!originalRefresh?.id) {
		const refreshToken = await ctx.context.adapter.create<
			OAuthRefreshToken<Scope[]> & { id: string }
		>({
			model: "oauthRefreshToken",
			data: newRow,
		});
		return {
			id: refreshToken.id,
			token: await encodeRefreshToken(opts, token, sessionId),
		};
	}

	// Rotation: atomic compare-and-swap on the parent row. Concurrent
	// rotations against the same parent both observe `revoked === null` on
	// the read in `handleRefreshTokenGrant`, but only one wins this update.
	// The loser fails closed with `invalid_grant`; the parent row is now
	// revoked, so any subsequent replay of the original refresh token
	// triggers the existing family-invalidation guard in
	// `handleRefreshTokenGrant`.
	//
	// FIXME(strict-family-invalidation): RFC 9700 §4.14 prescribes
	// immediate family invalidation on detected concurrent redemption.
	// Doing that here requires wrapping the entire mint chain
	// (CAS + create-refresh + create-access) in a real database
	// transaction so the race-loser's family delete cannot interleave
	// with the winner's still-in-flight inserts. Tracked for a follow-up
	// minor once the adapter contract exposes opt-in transactional
	// rotation.
	const won = await ctx.context.adapter.incrementOne<{ id: string }>({
		model: "oauthRefreshToken",
		where: [
			{ field: "id", value: originalRefresh.id },
			{ field: "revoked", operator: "eq", value: null },
		],
		increment: {},
		set: {
			revoked: new Date(iat * 1000),
		},
	});

	if (!won) {
		throw new APIError("BAD_REQUEST", {
			error_description: "invalid refresh token",
			error: "invalid_grant",
		});
	}

	const refreshToken = await ctx.context.adapter.create<
		OAuthRefreshToken<Scope[]> & { id: string }
	>({
		model: "oauthRefreshToken",
		data: newRow,
	});

	return {
		id: refreshToken.id,
		token: await encodeRefreshToken(opts, token, sessionId),
	};
}

type CreateUserTokensParams = OAuthTokenIssueParams & {
	grantType: GrantType;
	authorizationCodeId?: string;
};

interface ResourceGrantIssuance {
	audienceClaim: ResolvedResourcePolicy["audienceClaim"];
	effectiveScopes: string[];
	accessTokenExpiresAtSeconds: number;
	refreshTokenExpiresAtSeconds: number;
	refreshResources?: string[];
	signingAlgorithm: ResolvedResourcePolicy["signingAlgorithm"];
	signingKeyId: ResolvedResourcePolicy["signingKeyId"];
	resourceCustomClaims: Record<string, unknown>;
	dpopBoundAccessTokensRequired: boolean;
}

async function resolveResourceGrantIssuance(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	params: {
		clientId: string;
		requestedScopes: string[];
		resources?: string[];
		originalResources?: string[];
		refreshToken?: OAuthRefreshToken<Scope[]> & { id: string };
		iat: number;
		scopeExpiresAtSeconds: number;
	},
): Promise<ResourceGrantIssuance> {
	const resourcePolicy = await resolveResourcePolicy(ctx, opts, {
		resource: params.resources,
		clientId: params.clientId,
		requestedScopes: params.requestedScopes,
	});
	const resourceExpiresAtSeconds =
		resourcePolicy.accessTokenTtl !== null
			? params.iat + resourcePolicy.accessTokenTtl
			: params.scopeExpiresAtSeconds;
	const refreshTokenDefaultTtl = opts.refreshTokenExpiresIn ?? 2592000;
	const refreshTokenTtl =
		resourcePolicy.refreshTokenTtl !== null
			? Math.min(resourcePolicy.refreshTokenTtl, refreshTokenDefaultTtl)
			: refreshTokenDefaultTtl;

	return {
		audienceClaim: resourcePolicy.audienceClaim,
		effectiveScopes: resourcePolicy.effectiveScopes,
		accessTokenExpiresAtSeconds: Math.min(
			params.scopeExpiresAtSeconds,
			resourceExpiresAtSeconds,
		),
		refreshTokenExpiresAtSeconds: params.iat + refreshTokenTtl,
		refreshResources:
			params.refreshToken?.resources ??
			params.originalResources ??
			params.resources,
		signingAlgorithm: resourcePolicy.signingAlgorithm,
		signingKeyId: resourcePolicy.signingKeyId,
		resourceCustomClaims: resourcePolicy.rawCustomClaims,
		dpopBoundAccessTokensRequired: resourcePolicy.dpopBoundAccessTokensRequired,
	};
}

function throwInvalidDpopProof(errorDescription: string): never {
	throw new APIError("BAD_REQUEST", {
		error: "invalid_dpop_proof",
		error_description: errorDescription,
	});
}

function clientRequiresDpopBoundAccessTokens(client: SchemaClient<Scope[]>) {
	const metadata = (parseClientMetadata(client.metadata) ?? {}) as Record<
		string,
		unknown
	>;
	return (
		client.dpopBoundAccessTokens === true ||
		metadata.dpop_bound_access_tokens === true
	);
}

async function resolveDpopTokenBinding(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	params: {
		client: SchemaClient<Scope[]>;
		grantIssuance: ResourceGrantIssuance;
		verificationValue?: VerificationValue;
		refreshToken?: OAuthRefreshToken<Scope[]> & { id: string };
	},
): Promise<Confirmation | undefined> {
	const authCodeDpopJkt = params.verificationValue?.query.dpop_jkt;
	const refreshJkt = getConfirmationJkt(params.refreshToken?.confirmation);
	const expectedJkt = refreshJkt ?? authCodeDpopJkt;
	const dpopProofJwt = getDpopProofJwt(ctx);
	const dpopRequired =
		clientRequiresDpopBoundAccessTokens(params.client) ||
		params.grantIssuance.dpopBoundAccessTokensRequired ||
		!!authCodeDpopJkt ||
		!!refreshJkt;

	if (!dpopProofJwt) {
		if (dpopRequired) {
			throwInvalidDpopProof("DPoP proof header is required");
		}
		return undefined;
	}

	try {
		const proof = await verifyDpopProof({
			proofJwt: dpopProofJwt,
			method: "POST",
			url: getEndpointUrl(ctx, "/oauth2/token"),
			expectedJkt,
			proofMaxAgeSeconds: opts.dpop?.proofMaxAgeSeconds,
			signingAlgorithms: opts.dpop?.signingAlgorithms,
			replayStore: createDpopReplayStore(ctx.context.internalAdapter),
		});
		return { jkt: proof.jkt };
	} catch (error) {
		if (isDpopProofError(error)) {
			throwInvalidDpopProof(error.message);
		}
		throw error;
	}
}

async function createUserTokens(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	params: CreateUserTokensParams,
): Promise<OAuthTokenResponse> {
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
	const scopeExp = opts.scopeExpirations
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

	const grantIssuance = await resolveResourceGrantIssuance(ctx, opts, {
		clientId: client.clientId,
		requestedScopes: scopes,
		resources: params.resources,
		originalResources: params.originalResources,
		refreshToken: params.refreshToken,
		iat,
		scopeExpiresAtSeconds: scopeExp,
	});
	const audienceClaim = grantIssuance.audienceClaim;
	const effectiveScopes = grantIssuance.effectiveScopes;
	const exp = grantIssuance.accessTokenExpiresAtSeconds;
	const refreshTokenExp = grantIssuance.refreshTokenExpiresAtSeconds;
	// Only mint a refresh token when the client may use refresh tokens.
	// Otherwise an `offline_access` scope alone would hand a refresh token to a
	// pure machine-to-machine client that was never authorized for one.
	const isRefreshToken =
		user &&
		clientAllowsGrant(client, "refresh_token") &&
		(existingRefreshToken?.scopes?.includes("offline_access") ||
			scopes.includes("offline_access"));
	const isJwtAccessToken = audienceClaim && !opts.disableJwtPlugin;
	const isIdToken = user && effectiveScopes.includes("openid");
	const metadata = parseClientMetadata(client.metadata);
	const additionalIdTokenClaims =
		isIdToken && user
			? {
					...(await collectExtensionIdTokenClaims(opts, {
						ctx,
						opts,
						user,
						client,
						scopes: effectiveScopes,
						grantType,
						referenceId,
						sessionId,
						resources: params.resources,
						metadata,
					})),
					...(params.idTokenClaims ?? {}),
				}
			: undefined;

	// Resolve custom fields before any token side effects (refresh rotation, DB writes)
	const customFields = opts.customTokenResponseFields
		? await opts.customTokenResponseFields({
				grantType,
				user,
				scopes: effectiveScopes,
				metadata,
				verificationValue,
			})
		: undefined;

	const refreshResources = grantIssuance.refreshResources;
	// A confirmation supplied by the caller (an extension client-authentication
	// strategy, for example mTLS `x5t#S256`, or a binding captured out-of-grant
	// for CIBA push/ping) takes precedence; a DPoP proof on the token request is
	// the fallback. Either way the AS owns the RFC 7800 `cnf`: stamped into a JWT
	// access token, persisted on opaque access and refresh tokens, and surfaced
	// as `cnf` at introspection.
	const confirmation =
		params.confirmation ??
		(await resolveDpopTokenBinding(ctx, opts, {
			client,
			grantIssuance,
			verificationValue,
			refreshToken: existingRefreshToken,
		}));

	// Refresh token may need to be created beforehand for id field
	const earlyRefreshToken =
		isRefreshToken && user && !isJwtAccessToken
			? await createRefreshToken(
					ctx,
					opts,
					user,
					referenceId,
					params.authorizationCodeId,
					client,
					effectiveScopes,
					{
						iat,
						exp: refreshTokenExp,
						sid: sessionId,
					},
					existingRefreshToken,
					authTime,
					refreshResources,
					confirmation,
				)
			: undefined;

	// Enriched (non-AS-owned) access-token claims, resolved once for the JWT
	// mint. Opaque tokens persist no claims and re-derive the same set at
	// introspection through this same resolver, so the formats cannot drift.
	const accessTokenClaims = isJwtAccessToken
		? await resolveAccessTokenClaims({
				ctx,
				opts,
				user,
				client,
				scopes: effectiveScopes,
				grantType,
				sessionId,
				resources: params.resources,
				referenceId,
				metadata,
				perRequestClaims: params.accessTokenClaims,
				resourcePolicyClaims: grantIssuance.resourceCustomClaims,
			})
		: undefined;

	// Create access token and refresh token in parallel
	const [accessToken, refreshToken] = await Promise.all([
		isJwtAccessToken
			? createJwtAccessToken(
					ctx,
					opts,
					user,
					client,
					audienceClaim,
					effectiveScopes,
					{
						iat,
						exp,
						sid: sessionId,
						signingAlgorithm: grantIssuance.signingAlgorithm,
						signingKeyId: grantIssuance.signingKeyId,
						accessTokenClaims,
						confirmation,
					},
				)
			: createOpaqueAccessToken(
					ctx,
					opts,
					user,
					client,
					effectiveScopes,
					{
						iat,
						exp,
						sid: sessionId,
					},
					params?.resources,
					referenceId,
					params.authorizationCodeId,
					earlyRefreshToken?.id,
					confirmation,
				),
		earlyRefreshToken
			? earlyRefreshToken
			: isRefreshToken && user
				? createRefreshToken(
						ctx,
						opts,
						user,
						referenceId,
						params.authorizationCodeId,
						client,
						effectiveScopes,
						{
							iat,
							exp: refreshTokenExp,
							sid: sessionId,
						},
						existingRefreshToken,
						authTime,
						refreshResources,
						confirmation,
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
				effectiveScopes,
				nonce,
				sessionId,
				authTime,
				accessToken,
				additionalIdTokenClaims,
			)
		: undefined;

	return ctx.json({
		...customFields,
		...(params.tokenResponse ?? {}),
		access_token: accessToken,
		expires_in: exp - iat,
		expires_at: exp,
		token_type: confirmationTokenType(confirmation),
		refresh_token: refreshToken?.token,
		scope: effectiveScopes.join(" "),
		id_token: idToken,
	});
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
	const authorizationCodeId = await storeToken(
		opts.storeTokens,
		code,
		"authorization_code",
	);
	// Atomic single-use redemption per RFC 6749 §4.1.2. The first caller
	// receives the row and mints tokens; concurrent racers receive `null`
	// and fall through to the `invalid_grant` error path (RFC 6749 §5.2).
	const verification =
		await ctx.context.internalAdapter.consumeVerificationValue(
			authorizationCodeId,
		);

	if (!verification) {
		await revokeTokensIssuedForAuthorizationCode(ctx, authorizationCodeId);
		throw new APIError("BAD_REQUEST", {
			error_description: "invalid code",
			error: "invalid_grant",
		});
	}

	let rawValue: unknown;
	try {
		rawValue = JSON.parse(verification.value);
	} catch {
		throw new APIError("BAD_REQUEST", {
			error_description: "malformed verification value",
			error: "invalid_grant",
		});
	}
	const parsed = verificationValueSchema.safeParse(rawValue);
	if (!parsed.success) {
		throw new APIError("BAD_REQUEST", {
			error_description: "malformed verification value",
			error: "invalid_grant",
		});
	}
	// Zod's passthrough adds index signature; the schema already validates the structure
	const verificationValue = parsed.data as VerificationValue;

	if (verificationValue.query.client_id !== client_id) {
		throw new APIError("BAD_REQUEST", {
			error_description: "invalid client_id",
			error: "invalid_grant",
		});
	}
	// RFC 6749 §4.1.3: redirect_uri is bound at the token endpoint only when the
	// authorization request carried one. Enforce an exact correspondence in both
	// directions: a code minted with a redirect_uri must be redeemed with the
	// identical value, and a headless code (first-party-apps / device-style)
	// minted without one must be redeemed without one.
	const boundRedirectUri = verificationValue.query.redirect_uri;
	if (boundRedirectUri) {
		if (!redirect_uri) {
			throw new APIError("BAD_REQUEST", {
				error_description: "redirect_uri is required",
				error: "invalid_request",
			});
		}
		if (boundRedirectUri !== redirect_uri) {
			throw new APIError("BAD_REQUEST", {
				// RFC 6749 §5.2: a redirect_uri that does not match the one bound to
				// the code is an invalid grant, not a malformed request.
				error_description: "redirect_uri mismatch",
				error: "invalid_grant",
			});
		}
	} else if (redirect_uri) {
		throw new APIError("BAD_REQUEST", {
			error_description: "redirect_uri mismatch",
			error: "invalid_grant",
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
		authorizedResources: storedResources,
		authorizationCodeId,
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
		preVerified,
		authMethod,
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
	// redirect_uri is validated conditionally against the stored code in
	// checkVerificationValue (RFC 6749 §4.1.3): required and matched only when the
	// authorization request included one, so headless codes can omit it.

	const isAuthCodeWithSecret = client_id && client_secret;
	const isAuthCodeWithPkce = client_id && code && code_verifier;

	if (!isAuthCodeWithSecret && !isAuthCodeWithPkce && !preVerified) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Either code_verifier or client_secret is required",
			error: "invalid_request",
		});
	}

	/** Get and check Verification Value */
	const {
		verificationValue,
		effectiveResources,
		authorizedResources,
		authorizationCodeId,
	} = await checkVerificationValue(
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
		preVerified,
		"authorization_code",
		authMethod,
	);

	// Parse scopes from the authorization request
	const requestedScopes =
		(verificationValue.query?.scope as string)?.split(" ") || [];

	// Check if PKCE is required for this client and authorization request
	const pkceRequired = isPKCERequired(client, {
		scopes: requestedScopes,
		nonce: verificationValue.query?.nonce,
	});

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
		if (!(isAuthCodeWithPkce || isAuthCodeWithSecret || preVerified)) {
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
		authorizationCodeId,
		resources: effectiveResources,
		originalResources: authorizedResources,
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
		preVerified,
		authMethod,
	} = destructureCredentials(credentials);
	const { scope, resource }: { scope?: string; resource?: string | string[] } =
		ctx.body;
	const resources = toResourceList(resource);

	if (!client_id) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing required client_id",
			error: "invalid_grant",
		});
	}
	if (!client_secret && !preVerified) {
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
		preVerified,
		"client_credentials",
		authMethod,
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
		preVerified,
		authMethod,
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
			error_description: "invalid refresh token",
			error: "invalid_grant",
		});
	}
	if (refreshToken.expiresAt < new Date()) {
		throw new APIError("BAD_REQUEST", {
			error_description: "invalid refresh token",
			error: "invalid_grant",
		});
	}
	// Replay revoke (RFC 9700 §4.14: tear down the family)
	if (refreshToken.revoked) {
		await invalidateRefreshFamily(ctx, client_id, refreshToken.userId);
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
		preVerified,
		"refresh_token",
		authMethod,
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
		authorizationCodeId: refreshToken.authorizationCodeId,
		sessionId: refreshToken.sessionId,
		refreshToken,
		resources: resources ?? refreshToken.resources,
		authTime,
	});
}
