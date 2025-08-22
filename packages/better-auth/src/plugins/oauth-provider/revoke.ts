import { APIError } from "better-call";
import type { JSONWebKeySet } from "jose";
import type { GenericEndpointContext } from "@better-auth/core";
import {
	basicToClientCredentials,
	getStoredToken,
	validateClientCredentials,
} from "./utils";
import type {
	OAuthOpaqueAccessToken,
	OAuthOptions,
	OAuthRefreshToken,
} from "./types";
import { getJwtPlugin } from "./utils";
import { decodeRefreshToken } from "./token";
import { verifyJwsAccessToken } from "./verify";
import { logger } from "@better-auth/core/env";

/**
 * IMPORTANT NOTES:
 * Revocation follows RFC7009
 * https://datatracker.ietf.org/doc/html/rfc7009
 * - APIError: Continue catches (returnable to client)
 * - Error: Should immediately stop catches (internal error)
 */

/**
 * Revokes a JWT access token against the configured JWKs.
 * (does nothing if successful since a JWT is not stored on the server)
 */
async function revokeJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	token: string,
) {
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;

	// Verify JWT Payload
	try {
		await verifyJwsAccessToken(token, {
			jwksFetch: jwtPluginOptions?.jwks?.remoteUrl
				? jwtPluginOptions.jwks.remoteUrl
				: async () => {
						const jwksRes = await jwtPlugin?.endpoints.getJwks(ctx);
						// @ts-expect-error response is a JSONWebKeySet but within the response field
						return jwksRes?.response as JSONWebKeySet | undefined;
					},
			verifyOptions: {
				audience: jwtPluginOptions?.jwt?.audience ?? ctx.context.baseURL,
				issuer: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
			},
		});
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
				// audience or issuer mismatch
				return null;
			}
			throw error;
		}
		throw new Error(error as unknown as string);
	}
}

/**
 * Searches for an opaque access token in the database and validates it
 */
async function revokeOpaqueAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	token: string,
	clientId: string,
) {
	let tokenValue = token;
	if (opts.opaqueAccessTokenPrefix) {
		if (tokenValue.startsWith(opts.opaqueAccessTokenPrefix)) {
			tokenValue = tokenValue.replace(opts.opaqueAccessTokenPrefix, "");
		} else {
			throw new APIError("BAD_REQUEST", {
				error_description: "opaque access token not found",
				error: "invalid_request",
			});
		}
	}
	const accessToken: (OAuthOpaqueAccessToken & { id?: string }) | null =
		await ctx.context.adapter
			.findOne<OAuthOpaqueAccessToken>({
				model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
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
			})
			.then((res) => {
				// TODO: remove join when native arrays supported
				if (!res) return res;
				return {
					...res,
					scopes: (res.scopes as unknown as string)?.split(" "),
				} as OAuthOpaqueAccessToken;
			});
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
				model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
				where: [{ field: "id", value: accessToken.id }],
			})
		: await ctx.context.adapter.delete({
				model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
				where: [{ field: "token", value: accessToken.token }],
			});
}

/**
 * Validates a refresh token in the session store.
 */
async function revokeRefreshToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	token: string,
	clientId: string,
) {
	const refreshToken = await ctx.context.adapter.findOne<
		OAuthRefreshToken & { id: string }
	>({
		model: opts.schema?.oauthRefreshToken?.modelName ?? "oauthRefreshToken",
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
	if (!refreshToken.clientId || refreshToken.clientId !== clientId) {
		return null;
	}

	await Promise.allSettled([
		// Removes all access tokens associated with the refresh token
		ctx.context.adapter.deleteMany({
			model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
			where: [{ field: "refreshId", value: refreshToken.id }],
		}),
		// Remove the refresh token
		ctx.context.adapter.delete({
			model: opts.schema?.oauthRefreshToken?.modelName ?? "oauthRefreshToken",
			where: [{ field: "id", value: refreshToken.id }],
		}),
	]);
}

/**
 * We don't know the access token format so we try to validate it
 * as a JWT first, then as an opaque token.
 */
async function revokeAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	clientId: string,
	token: string,
) {
	try {
		return await revokeJwtAccessToken(ctx, opts, token);
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
	opts: OAuthOptions,
) {
	let {
		client_id,
		client_secret,
		token,
		token_type_hint,
	}: {
		client_id?: string;
		client_secret?: string;
		token: string;
		token_type_hint?: "access_token" | "refresh_token";
	} = ctx.body;

	// Convert basic authorization
	const authorization = ctx.request?.headers.get("authorization") || null;
	if (authorization?.startsWith("Basic ")) {
		const res = basicToClientCredentials(authorization);
		client_id = res?.client_id;
		client_secret = res?.client_secret;
	}
	// client_id is always required, client_secret is required for confidential clients
	if (!client_id) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "missing required credentials",
			error: "invalid_client",
		});
	}

	// Check token
	if (typeof token === "string" && token.startsWith("Bearer ")) {
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
	);

	try {
		if (token_type_hint === undefined || token_type_hint === "access_token") {
			try {
				return await revokeAccessToken(ctx, opts, client.clientId, token);
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
