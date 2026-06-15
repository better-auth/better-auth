import type { GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import {
	getJwks,
	stripAccessTokenAuthorizationScheme,
} from "better-auth/oauth2";
import { APIError } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { createLocalJWKSet, jwtVerify } from "jose";
import {
	destructureCredentials,
	extractClientCredentials,
	validateClientCredentials,
} from "./client-authentication";
import { isAudienceClaimAllowed } from "./resources";
import { decodeRefreshToken, invalidateRefreshFamily } from "./token";
import type {
	OAuthOpaqueAccessToken,
	OAuthOptions,
	OAuthRefreshToken,
	Scope,
} from "./types";
import { getJwtPlugin, getStoredToken } from "./utils";

/**
 * IMPORTANT NOTES:
 * Revocation follows RFC7009
 * https://datatracker.ietf.org/doc/html/rfc7009
 * - APIError: Continue catches (returnable to client)
 * - Error: Should immediately stop catches (internal error)
 */

/**
 * Revokes a JWT access token against the configured JWKs.
 *
 * A JWT access token is self-contained and never stored, so there is nothing to
 * delete. Once the token is confirmed to be a valid JWT for this server, the
 * endpoint reports `unsupported_token_type` (RFC 7009 §2.2.1) instead of a
 * silent success, so callers can tell that no server-side revocation happened.
 * An expired JWT or a JWT with an audience rejected by the OAuth resource model
 * is already inactive and still resolves as a successful no-op. Session-bound
 * tokens (carrying `sid`) are cut off early by the session-liveness check in
 * introspection and userinfo.
 */
async function revokeJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
) {
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;

	// Verify signature + issuer first, then validate `aud` against the OAuth
	// resource model. Do not pass jose's `audience` option here: access-token
	// audiences are resource identifiers, not a single global authorization-server
	// audience.
	try {
		const jwksFetch = jwtPluginOptions?.jwks?.remoteUrl
			? jwtPluginOptions.jwks.remoteUrl
			: async (): Promise<JSONWebKeySet | undefined> => {
					const jwksRes = await jwtPlugin?.endpoints.getJwks(ctx);
					// @ts-expect-error response is a JSONWebKeySet but within the response field
					return jwksRes?.response as JSONWebKeySet | undefined;
				};
		const jwks = await getJwks(token, {
			jwksFetch,
			// The plugin instance is stable across requests, so the key set
			// fetched by the per-request closure above is cached under it.
			jwksCacheKey: jwtPlugin,
		});
		const verified = await jwtVerify<JWTPayload & { azp?: string }>(
			token,
			createLocalJWKSet(jwks),
			{
				issuer: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
			},
		);
		const userInfoAudience = `${ctx.context.baseURL}/oauth2/userinfo`;
		if (
			!verified.payload.azp ||
			!(await isAudienceClaimAllowed(ctx, opts, verified.payload.aud, [
				userInfoAudience,
			]))
		) {
			return null;
		}
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === "TypeError" || error.name === "JWSInvalid") {
				// likely an opaque token
				throw new APIError("BAD_REQUEST", {
					error_description: "invalid JWT signature",
					error: "invalid_request",
				});
			} else if (error.name === "JWTExpired") {
				return null;
			} else if (error.name === "JWTInvalid") {
				// issuer or other JWT claim validation failure
				return null;
			}
			throw error;
		}
		throw new Error(error as unknown as string);
	}

	// Verified: a valid JWT access token for this server. It is self-contained
	// and not stored, so it cannot be revoked. Report that rather than implying
	// success (RFC 7009 §2.2.1).
	throw new APIError("BAD_REQUEST", {
		error_description:
			"JWT access tokens are self-contained and cannot be revoked server-side",
		error: "unsupported_token_type",
	});
}

/**
 * Searches for an opaque access token in the database and validates it
 */
async function revokeOpaqueAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
	clientId: string,
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
	const accessToken:
		| (OAuthOpaqueAccessToken<Scope[]> & { id?: string })
		| null = await ctx.context.adapter.findOne<OAuthOpaqueAccessToken<Scope[]>>(
		{
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
		},
	);
	if (!accessToken) {
		throw new APIError("BAD_REQUEST", {
			error_description: "opaque access token not found",
			error: "invalid_request",
		});
	}
	if (!accessToken.clientId || accessToken.clientId !== clientId) {
		return null;
	}

	accessToken.id
		? await ctx.context.adapter.delete({
				model: "oauthAccessToken",
				where: [{ field: "id", value: accessToken.id }],
			})
		: await ctx.context.adapter.delete({
				model: "oauthAccessToken",
				where: [{ field: "token", value: accessToken.token }],
			});
}

/**
 * Validates a refresh token in the session store.
 */
async function revokeRefreshToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
	clientId: string,
) {
	const refreshToken = await ctx.context.adapter.findOne<
		OAuthRefreshToken<Scope[]> & { id: string }
	>({
		model: "oauthRefreshToken",
		where: [
			{
				field: "token",
				value: await getStoredToken(opts.storeTokens, token, "refresh_token"),
			},
		],
	});
	if (!refreshToken) {
		throw new APIError("BAD_REQUEST", {
			error_description: "token not found",
			error: "invalid_request",
		});
	}
	if (refreshToken.revoked) {
		await invalidateRefreshFamily(ctx, clientId, refreshToken.userId);
		throw new APIError("BAD_REQUEST", {
			error_description: "refresh token revoked",
			error: "invalid_request",
		});
	}
	if (!refreshToken.clientId || refreshToken.clientId !== clientId) {
		return null;
	}

	const iat = Math.floor(Date.now() / 1000);
	// Atomic compare-and-swap. If a concurrent rotation already revoked
	// (and re-minted) this row, fail closed and tear down the whole family
	// so the rotation's offspring cannot be used either.
	const won = await ctx.context.adapter.update<{ id: string }>({
		model: "oauthRefreshToken",
		where: [
			{
				field: "id",
				value: refreshToken.id,
			},
			{
				field: "revoked",
				operator: "eq",
				value: null,
			},
		],
		update: {
			revoked: new Date(iat * 1000),
		},
	});
	if (!won) {
		await invalidateRefreshFamily(ctx, clientId, refreshToken.userId);
		throw new APIError("BAD_REQUEST", {
			error_description: "refresh token revoked",
			error: "invalid_request",
		});
	}
	await ctx.context.adapter.deleteMany({
		model: "oauthAccessToken",
		where: [{ field: "refreshId", value: refreshToken.id }],
	});
}

/**
 * We don't know the access token format so we try to validate it
 * as a JWT first, then as an opaque token.
 */
async function revokeAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientId: string,
	token: string,
) {
	try {
		return await revokeJwtAccessToken(ctx, opts, token);
	} catch (err) {
		if (err instanceof APIError) {
			// A confirmed JWT access token cannot be revoked: surface that rather
			// than falling through to the opaque-token lookup.
			if (err.body?.error === "unsupported_token_type") {
				throw err;
			}
			// otherwise not a JWT, continue to opaque
		} else if (err instanceof Error) {
			throw err;
		} else {
			throw new Error(err as unknown as string);
		}
	}
	try {
		return await revokeOpaqueAccessToken(ctx, opts, token, clientId);
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

export async function revokeEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	let { token, token_type_hint } = ctx.body as {
		token: string;
		token_type_hint?: string;
	};

	// RFC 7009 §2.2.1: unknown hints are ignored and the server extends its
	// search across all supported token types.
	if (
		token_type_hint !== "access_token" &&
		token_type_hint !== "refresh_token"
	) {
		token_type_hint = undefined;
	}

	const credentials = await extractClientCredentials(
		ctx,
		opts,
		`${ctx.context.baseURL}/oauth2/revoke`,
	);
	const {
		clientId: client_id,
		clientSecret: client_secret,
		preVerified,
		authMethod,
	} = destructureCredentials(credentials);

	if (!client_id) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "missing required credentials",
			error: "invalid_client",
		});
	}

	// Check token
	if (typeof token === "string") {
		token = stripAccessTokenAuthorizationScheme(token);
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
		preVerified,
		undefined,
		authMethod,
	);

	try {
		if (token_type_hint === undefined || token_type_hint === "access_token") {
			try {
				return await revokeAccessToken(ctx, opts, client.clientId, token);
			} catch (error) {
				if (error instanceof APIError) {
					if (
						token_type_hint === "access_token" ||
						error.body?.error === "unsupported_token_type"
					) {
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
				return await revokeRefreshToken(
					ctx,
					opts,
					refreshToken.token,
					client.clientId,
				);
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
			// RFC 7009 §2.2.1: an explicit protocol error (unsupported_token_type)
			// must surface; an unknown or already-invalid token still succeeds.
			if (error.body?.error === "unsupported_token_type") {
				throw error;
			}
			if (error.name === "BAD_REQUEST") {
				return null;
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
