import type { GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { getJwks } from "better-auth/oauth2";
import type { Session, User } from "better-auth/types";
import { APIError } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { createLocalJWKSet, jwtVerify } from "jose";
import { resolveAccessTokenClaims } from "./claims";
import {
	getResourceCustomClaims,
	isAudienceClaimAllowed,
	isClientLinkedToAnyResource,
} from "./resources";
import { decodeRefreshToken } from "./token";
import type {
	OAuthOpaqueAccessToken,
	OAuthOptions,
	OAuthRefreshToken,
	SchemaClient,
	Scope,
} from "./types";
import {
	destructureCredentials,
	extractClientCredentials,
	getClient,
	getJwtPlugin,
	getStoredToken,
	parseClientMetadata,
	resolveSubjectIdentifier,
	toAudienceClaim,
	validateClientCredentials,
} from "./utils";

/**
 * IMPORTANT NOTES:
 * Introspection follows RFC7662
 * https://datatracker.ietf.org/doc/html/rfc7662
 * - APIError: Continue catches (returnable to client)
 * - Error: Should immediately stop catches (internal error)
 */

/**
 * Resource identifiers in a token's audience, excluding the implicit
 * `/oauth2/userinfo` audience (which is not a configured resource server).
 */
function audienceResourceIdentifiers(
	aud: unknown,
	userInfoAud: string,
): string[] {
	if (aud == null) return [];
	const values = Array.isArray(aud) ? aud : [aud];
	return values.filter(
		(value): value is string =>
			typeof value === "string" && value !== userInfoAud,
	);
}

/**
 * Authorizes an introspection request (RFC 7662 §2.1/§4). The caller is already
 * authenticated as a registered client; it may introspect the token when it
 * issued the token, or when it is a resource server linked to one of the token's
 * audience resources. Tokens with no resource audience stay issuer-only. An
 * unauthorized caller receives `{active:false}` (indistinguishable from an
 * expired or unknown token), preserving the §4 anti-scanning property.
 */
async function isIntrospectionAuthorized(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	params: {
		introspectingClientId: string | undefined;
		issuerClientId: string | undefined;
		audienceResources: string[];
	},
): Promise<boolean> {
	const { introspectingClientId, issuerClientId, audienceResources } = params;
	if (!introspectingClientId) return true;
	if (introspectingClientId === issuerClientId) return true;
	if (audienceResources.length === 0) return false;
	return isClientLinkedToAnyResource(
		ctx,
		opts,
		introspectingClientId,
		audienceResources,
	);
}

/**
 * Validates a JWT access token against the configured JWKs.
 *
 * @returns RFC7662 introspection format
 */
async function validateJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
	clientId?: string,
) {
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;
	const baseURL = ctx.context.baseURL ?? "";
	const userInfoAud = `${baseURL}/oauth2/userinfo`;
	const expectedIssuer = jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL;
	let jwtPayload: JWTPayload & {
		sid?: string;
		azp?: string;
	};

	try {
		// Do NOT pass `audience` to jose's verifier. Verify signature + issuer
		// here, then validate `aud` manually against the resource model below.
		const jwksFetch = jwtPluginOptions?.jwks?.remoteUrl
			? jwtPluginOptions.jwks.remoteUrl
			: async (): Promise<JSONWebKeySet | undefined> => {
					const jwksRes = await jwtPlugin?.endpoints.getJwks(ctx);
					// @ts-expect-error response is a JSONWebKeySet but within the response field
					return jwksRes?.response as JSONWebKeySet | undefined;
				};
		const jwks = await getJwks(token, { jwksFetch, jwksCacheKey: jwtPlugin });
		const verified = await jwtVerify<JWTPayload & { azp?: string }>(
			token,
			createLocalJWKSet(jwks),
			{
				issuer: expectedIssuer,
			},
		);
		jwtPayload = verified.payload;
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === "TypeError" || error.name === "JWSInvalid") {
				// likely an opaque token
				throw new APIError("BAD_REQUEST", {
					error_description: "invalid JWT signature",
					error: "invalid_request",
				});
			} else if (error.name === "JWTExpired") {
				return {
					active: false,
				};
			} else if (error.name === "JWTInvalid") {
				// issuer or other JWT claim validation failure
				return {
					active: false,
				};
			}
			throw error;
		}
		throw new Error(error as unknown as string);
	}

	// Manual `aud` validation (RFC 7662 §2.2 + RFC 8707 §3). EVERY value in
	// the `aud` claim must resolve to a legitimate resource target:
	//   1. baseURL + /oauth2/userinfo (OIDC implicit),
	//   2. a known `oauthResource` row (deleted → inactive; disabled rows
	//      still verify — the "block new issuance, existing tokens continue
	//      to verify until expiry" lifecycle contract).
	//
	// All-must-resolve semantics matter for the deleted-resource contract: a
	// token issued with `aud: [<resource>, userInfoAud]` and then having
	// `<resource>` deleted from the AS must hard-reject. "Any valid"
	// semantics would let the always-valid userinfo audience value mask the
	// deletion.
	const rawAud = jwtPayload.aud;
	if (!(await isAudienceClaimAllowed(ctx, opts, rawAud, [userInfoAud]))) {
		return { active: false };
	}

	// An OAuth access token issued by this provider always carries an `azp`
	// (authorized party = client) claim, stamped by `createJwtAccessToken`. The
	// JWT plugin shares the same issuer, audience convention, and signing keys, so
	// a plain session JWT (e.g. from its `/token` endpoint) can otherwise satisfy
	// the signature/issuer/audience checks above. Such a token was never issued
	// through the OAuth token endpoint and has no client or consent binding, so
	// it must not be reported as an active access token. Require `azp` and a
	// matching, enabled client before considering the token active.
	if (!jwtPayload.azp) {
		return {
			active: false,
		};
	}
	const client = await getClient(ctx, opts, jwtPayload.azp);
	if (!client || client?.disabled) {
		return {
			active: false,
		};
	}
	// RFC 7662 §2.1/§4: the introspecting client need not be the issuer. Allow
	// the issuer, or a resource server linked to one of the token's audience
	// resources; otherwise report the token inactive (no scanning signal).
	if (
		!(await isIntrospectionAuthorized(ctx, opts, {
			introspectingClientId: clientId,
			issuerClientId: jwtPayload.azp,
			audienceResources: audienceResourceIdentifiers(rawAud, userInfoAud),
		}))
	) {
		return { active: false };
	}

	// A JWT access token carrying `sid` is bound to that OP session; once the
	// session has ended (sign-out, admin revoke, back-channel logout...) the
	// token is revoked per OIDC Back-Channel Logout §2.7 even though the JWT
	// itself is still within its TTL.
	const sessionId = jwtPayload.sid;
	if (sessionId) {
		const session = await ctx.context.adapter.findOne<Session>({
			model: "session",
			where: [{ field: "id", value: sessionId }],
		});
		if (!session || session.expiresAt < new Date()) {
			return { active: false };
		}
	}

	// Return the JWT payload in introspection format
	// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
	jwtPayload.client_id = jwtPayload.azp;
	jwtPayload.active = true;
	return jwtPayload;
}

/**
 * Searches for an opaque access token in the database and validates it
 *
 * @returns RFC7662 introspection format
 */
async function validateOpaqueAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
	clientId?: string,
) {
	let tokenValue = token;
	if (opts.prefix?.opaqueAccessToken) {
		if (tokenValue.startsWith(opts.prefix.opaqueAccessToken)) {
			tokenValue = tokenValue.replace(opts.prefix.opaqueAccessToken, "");
		} else {
			throw new APIError("BAD_REQUEST", {
				error_description: "opaque access token not found",
				error: "invalid_request",
			});
		}
	}
	const accessToken = await ctx.context.adapter.findOne<
		OAuthOpaqueAccessToken<Scope[]>
	>({
		model: "oauthAccessToken",
		where: [
			{
				field: "token",
				value: await getStoredToken(
					opts.storeTokens,
					tokenValue,
					"access_token",
				),
			},
		],
	});
	if (!accessToken) {
		// Pass through, may be other token type
		throw new APIError("BAD_REQUEST", {
			error_description: "opaque access token not found",
			error: "invalid_token",
		});
	}
	if (!accessToken.expiresAt || accessToken.expiresAt < new Date()) {
		return {
			active: false,
		};
	}
	if (accessToken.revoked) {
		return {
			active: false,
		};
	}

	let client: SchemaClient<Scope[]> | null | undefined;
	if (accessToken.clientId) {
		client = await getClient(ctx, opts, accessToken.clientId);
		if (!client || client?.disabled) {
			return {
				active: false,
			};
		}
		// RFC 7662 §2.1/§4: allow the issuer, or a resource server linked to one
		// of the token's audience resources; otherwise report inactive.
		if (
			!(await isIntrospectionAuthorized(ctx, opts, {
				introspectingClientId: clientId,
				issuerClientId: accessToken.clientId,
				audienceResources: Array.isArray(accessToken.resources)
					? accessToken.resources
					: [],
			}))
		) {
			return { active: false };
		}
	}

	// An opaque access token bound to a session (every authorization-code token;
	// client-credentials tokens have no sessionId) dies with that session. This
	// mirrors the JWT path so revocation is a function of session state and does
	// not depend solely on the `revoked` flag written by the session-delete hook.
	const sessionId = accessToken.sessionId ?? undefined;
	if (sessionId) {
		const session = await ctx.context.adapter.findOne<Session>({
			model: "session",
			where: [
				{
					field: "id",
					value: sessionId,
				},
			],
		});
		if (!session || session.expiresAt < new Date()) {
			return { active: false };
		}
	}

	let user: User | null | undefined;
	if (accessToken.userId) {
		user = await ctx.context.internalAdapter.findUserById(accessToken?.userId);
	}
	const resources = Array.isArray(accessToken.resources)
		? accessToken.resources
		: undefined;
	const userInfoEndpoint = `${ctx.context.baseURL}/oauth2/userinfo`;

	// Deleting a resource row revokes the tokens bound to it: introspection
	// reports inactive (RFC 7662 §2.2 stable failure), mirroring the JWT path so
	// a resource server enforces deletion without per-token revocation. A
	// disabled row still resolves, so an already-issued token keeps verifying
	// until it expires.
	if (
		resources?.length &&
		!(await isAudienceClaimAllowed(ctx, opts, resources, [userInfoEndpoint]))
	) {
		return { active: false };
	}

	const audienceClaim = resources ? [...resources] : undefined;
	if (audienceClaim?.length && accessToken.scopes?.includes("openid")) {
		if (!audienceClaim.includes(userInfoEndpoint)) {
			audienceClaim.push(userInfoEndpoint);
		}
	}

	// Re-derive the enriched access-token claim set through the same authority
	// the JWT mint uses, so opaque introspection carries the claims a JWT would
	// for this grant, with reserved RFC 9068 names stripped. Per-resource
	// customClaims come from the existing rows directly, with no new-issuance
	// gates: the deleted-resource case already returned inactive above, and a
	// disabled resource keeps serving its claims to outstanding tokens.
	const resourcePolicyClaims = resources?.length
		? await getResourceCustomClaims(ctx, opts, resources)
		: {};
	// `grantType` and per-issuance extras are not persisted on the opaque row,
	// so extension claims are re-derived grant-type-stable and per-request
	// extras are JWT-only (see `resolveAccessTokenClaims`).
	const accessTokenClaims = client
		? await resolveAccessTokenClaims({
				ctx,
				opts,
				user,
				client,
				scopes: accessToken.scopes ?? [],
				grantType: undefined,
				resources,
				referenceId: accessToken.referenceId,
				metadata: parseClientMetadata(client.metadata),
				perRequestClaims: undefined,
				resourcePolicyClaims,
			})
		: {};

	// Return the access token in introspection format
	// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;
	return {
		...accessTokenClaims,
		active: true,
		iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		aud: toAudienceClaim(audienceClaim),
		client_id: accessToken.clientId,
		azp: accessToken.clientId,
		sub: user?.id,
		sid: sessionId,
		exp: Math.floor(new Date(accessToken.expiresAt).getTime() / 1000),
		iat: Math.floor(new Date(accessToken.createdAt).getTime() / 1000),
		scope: accessToken.scopes?.join(" "),
	} as JWTPayload;
}

/**
 * Validates a refresh token in the session store.
 *
 * @returns payload in RFC7662 introspection format
 */
async function validateRefreshToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
	clientId: string,
) {
	const refreshToken = await ctx.context.adapter.findOne<OAuthRefreshToken<
		Scope[]
	> | null>({
		model: "oauthRefreshToken",
		where: [
			{
				field: "token",
				value: await getStoredToken(opts.storeTokens, token, "refresh_token"),
			},
		],
	});
	if (!refreshToken) {
		// Pass through may be other token type
		throw new APIError("BAD_REQUEST", {
			error_description: "token not found",
			error: "invalid_token",
		});
	}
	if (!refreshToken.clientId || refreshToken.clientId !== clientId) {
		return {
			active: false,
		};
	}
	if (!refreshToken.expiresAt || refreshToken.expiresAt < new Date()) {
		return {
			active: false,
		};
	}
	if (refreshToken.revoked) {
		return {
			active: false,
		};
	}

	let sessionId = refreshToken.sessionId ?? undefined;
	if (sessionId) {
		const session = await ctx.context.adapter.findOne<Session>({
			model: "session",
			where: [
				{
					field: "id",
					value: sessionId,
				},
			],
		});
		if (!session || session.expiresAt < new Date()) {
			sessionId = undefined;
		}
	}

	let user: User | undefined = undefined;
	if (refreshToken.userId) {
		user =
			(await ctx.context.internalAdapter.findUserById(refreshToken?.userId)) ??
			undefined;
	}

	// Return the access token in introspection format
	// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;

	return {
		active: true,
		client_id: clientId,
		iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		sub: user?.id,
		sid: sessionId,
		exp: Math.floor(new Date(refreshToken.expiresAt).getTime() / 1000),
		iat: Math.floor(new Date(refreshToken.createdAt).getTime() / 1000),
		scope: refreshToken.scopes?.join(" "),
	} as JWTPayload;
}

/**
 * We don't know the access token format so we try to validate it
 * as a JWT first, then as an opaque token.
 *
 * @returns RFC7662 introspection format
 *
 * @internal
 */
export async function validateAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
	clientId?: string,
) {
	try {
		return await validateJwtAccessToken(ctx, opts, token, clientId);
	} catch (err) {
		if (err instanceof APIError) {
			// continue
		} else if (err instanceof Error) {
			throw err;
		} else {
			throw new Error(err as unknown as string);
		}
	}
	try {
		return await validateOpaqueAccessToken(ctx, opts, token, clientId);
	} catch (err) {
		if (err instanceof APIError) {
			// nothing
		} else if (err instanceof Error) {
			throw err;
		} else {
			throw new Error("Unknown error validating access token");
		}
	}
	throw new APIError("BAD_REQUEST", {
		error_description: "Invalid access token",
		error: "invalid_request",
	});
}

/**
 * Resolves pairwise sub on an introspection payload.
 * Applied at the presentation layer so internal validation functions
 * keep real user.id (needed for user lookup in /userinfo).
 */
async function resolveIntrospectionSub(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	payload: JWTPayload,
	introspectingClient: SchemaClient<Scope[]>,
): Promise<JWTPayload> {
	if (!payload.active || !payload.sub) return payload;
	// Pairwise `sub` is scoped to the TOKEN's client (its sector), not the
	// caller. Resolve against the issuing client so a resource server that
	// introspects a token issued to a different client sees the token's actual
	// subject, not one re-derived for the caller's sector. The issuer is the
	// caller for same-client and refresh-token introspection, so reuse the
	// already-loaded client there instead of a second lookup.
	const issuerClientId = (payload.client_id ?? payload.azp) as
		| string
		| undefined;
	if (!issuerClientId) return payload;
	const issuingClient =
		issuerClientId === introspectingClient.clientId
			? introspectingClient
			: await getClient(ctx, opts, issuerClientId);
	if (!issuingClient) return payload;
	const resolvedSub = await resolveSubjectIdentifier(
		payload.sub as string,
		issuingClient,
		opts,
	);
	return { ...payload, sub: resolvedSub };
}

export async function introspectEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	let { token, token_type_hint } = ctx.body as {
		token: string;
		token_type_hint?: string;
	};

	// RFC 7662 §2.1: unknown hints are ignored and detection falls back to
	// trying both supported token types.
	if (
		token_type_hint !== "access_token" &&
		token_type_hint !== "refresh_token"
	) {
		token_type_hint = undefined;
	}

	const credentials = await extractClientCredentials(
		ctx,
		opts,
		`${ctx.context.baseURL}/oauth2/introspect`,
	);
	const {
		clientId: client_id,
		clientSecret: client_secret,
		preVerifiedClient,
		authMethod,
	} = destructureCredentials(credentials);

	if (!client_id || (!client_secret && !preVerifiedClient)) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "missing required credentials",
			error: "invalid_client",
		});
	}

	// Check token
	if (token && typeof token === "string" && token.startsWith("Bearer ")) {
		token = token.replace("Bearer ", "");
	}
	if (!token?.length) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing a required token for introspection",
			error: "invalid_request",
		});
	}

	// Validate client credentials
	const client = await validateClientCredentials(
		ctx,
		opts,
		client_id,
		client_secret,
		undefined,
		preVerifiedClient,
		undefined,
		authMethod,
	);

	try {
		if (token_type_hint === undefined || token_type_hint === "access_token") {
			try {
				const payload = await validateAccessToken(
					ctx,
					opts,
					token,
					client.clientId,
				);
				return resolveIntrospectionSub(ctx, opts, payload, client);
			} catch (error) {
				if (error instanceof APIError) {
					if (token_type_hint === "access_token") {
						throw error;
					} // else continue
				} else if (error instanceof Error) {
					throw error;
				} else {
					throw new Error(error as unknown as string);
				}
			}
		}

		if (token_type_hint === undefined || token_type_hint === "refresh_token") {
			try {
				const refreshToken = await decodeRefreshToken(opts, token);
				const payload = await validateRefreshToken(
					ctx,
					opts,
					refreshToken.token,
					client.clientId,
				);
				return resolveIntrospectionSub(ctx, opts, payload, client);
			} catch (error) {
				if (error instanceof APIError) {
					if (token_type_hint === "refresh_token") {
						throw error;
					} // else continue
				} else if (error instanceof Error) {
					throw error;
				} else {
					throw new Error(error as unknown as string);
				}
			}
		}

		throw new APIError("BAD_REQUEST", {
			error_description: "token not found",
			error: "invalid_request",
		});
	} catch (error) {
		if (error instanceof APIError) {
			if (error.name === "BAD_REQUEST") {
				return {
					active: false,
				};
			}
			throw error;
		} else if (error instanceof Error) {
			logger.error("Introspection error:", error.message, error.stack);
			throw new APIError("INTERNAL_SERVER_ERROR");
		} else {
			logger.error("Introspection error:", error);
			throw new APIError("INTERNAL_SERVER_ERROR");
		}
	}
}
