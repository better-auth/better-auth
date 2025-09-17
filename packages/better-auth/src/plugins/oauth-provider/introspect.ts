import { APIError } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import type { GenericEndpointContext, User } from "../../types";
import {
	basicToClientCredentials,
	getClient,
	getStoredToken,
	validateClientCredentials,
} from "./utils";
import type {
	OAuthOpaqueAccessToken,
	OAuthOptions,
	OAuthSession,
} from "./types";
import { getJwtPlugin } from "./utils";
import { decodeRefreshToken } from "./token";
import { verifyJwsAccessToken } from "./verify";

/**
 * IMPORTANT NOTES:
 * Instropection follows RFC7662
 * https://datatracker.ietf.org/doc/html/rfc7662
 * - APIError: Continue catches (returnable to client)
 * - Error: Should immediately stop catches (internal error)
 */

/**
 * Validates a JWT access token against the configured JWKs.
 *
 * @returns RFC7662 introspection format
 */
async function validateJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	token: string,
	clientId?: string,
) {
	const jwtPlugin = opts.disableJWTPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;
	let jwtPayload: JWTPayload & {
		sid?: string;
		azp?: string;
	};

	try {
		jwtPayload = await verifyJwsAccessToken(token, {
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
					error: "invalid_token",
				});
			} else if (error.name === "JWTExpired") {
				return {
					active: false,
				};
			} else if (error.name === "JWTInvalid") {
				// audience or issuer mismatch
				throw new Error("jwt invalid likely audience or issuer mismatch");
			}
			throw error;
		}
		throw new Error(error as unknown as string);
	}

	if (jwtPayload.azp && clientId && jwtPayload.azp !== clientId) {
		if (clientId && jwtPayload.azp !== clientId) {
			throw new Error("token does not match client ID");
		} else {
			const client = await getClient(ctx, opts, jwtPayload.azp);
			if (!client || client?.disabled) {
				return {
					active: false,
				};
			}
		}
	}

	// Validate JWT against its session if it exists
	if (jwtPayload.sid) {
		const session = await ctx.context.adapter.findOne<OAuthSession>({
			model: "session",
			where: [
				{
					field: "id",
					value: jwtPayload.sid,
				},
			],
		});
		// Token was valid but session is not valid
		if (!session || session.expiresAt < new Date()) {
			return {
				active: false,
			};
		}
	}

	// Return the JWT payload in introspection format
	// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
	if (jwtPayload.azp) {
		jwtPayload.client_id = jwtPayload.azp;
	}
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
	opts: OAuthOptions,
	token: string,
	clientId?: string,
) {
	let tokenValue = token;
	if (opts.opaqueAccessTokenPrefix) {
		if (tokenValue.startsWith(opts.opaqueAccessTokenPrefix)) {
			tokenValue = tokenValue.replace(opts.opaqueAccessTokenPrefix, "");
		} else {
			throw new APIError("BAD_REQUEST", {
				error_description: "opaque access token not found",
				error: "invalid_token",
			});
		}
	}
	const accessToken = await ctx.context.adapter
		.findOne<OAuthOpaqueAccessToken>({
			model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
			where: [
				{
					field: "token",
					value: await getStoredToken(opts.storeTokens, tokenValue),
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
			error: "invalid_token",
		});
	}
	if (clientId && accessToken.clientId !== clientId) {
		throw new Error("access token does not match client ID");
	}
	if (!accessToken.expiresAt || accessToken.expiresAt < new Date()) {
		return {
			active: false,
		};
	}

	let user: (User & Record<string, any>) | undefined;
	if (accessToken.sessionId) {
		const session = await ctx.context.adapter
			.findOne<OAuthSession>({
				model: "session",
				where: [
					{
						field: "id",
						value: accessToken.sessionId,
					},
				],
			})
			.then((res) => {
				// TODO: remove join when native arrays supported
				if (!res) return res;
				return {
					...res,
					scopes: (res.scopes as unknown as string)?.split(" "),
				};
			});
		// Token was valid but associated session is no longer valid
		if (!session || session.expiresAt < new Date()) {
			return {
				active: false,
			};
		}
		if (session?.userId) {
			user =
				(await ctx.context.internalAdapter.findUserById(session?.userId)) ??
				undefined;
		}
	}

	// Return the access token in introspection format
	// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
	const jwtPlugin = opts.disableJWTPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;
	return {
		active: true,
		iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		client_id: accessToken.clientId,
		sub: user?.id,
		sid: accessToken.sessionId,
		exp: Math.floor(accessToken.expiresAt.getTime() / 1000),
		iat: Math.floor(accessToken.createdAt.getTime() / 1000),
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
	opts: OAuthOptions,
	token: string,
	clientId: string,
) {
	const userSession = await ctx.context.adapter
		.findOne<OAuthSession | null>({
			model: "session",
			where: [
				{
					field: "refresh",
					value: await getStoredToken(opts.storeTokens, token),
				},
			],
		})
		.then((res) => {
			// TODO: remove join when native arrays supported
			if (!res) return res;
			return {
				...res,
				scopes: (res.scopes as unknown as string)?.split(" "),
			};
		});
	if (!userSession) {
		throw new APIError("BAD_REQUEST", {
			error_description: "token not found",
			error: "invalid_token",
		});
	}
	if (!userSession.clientId || userSession.clientId !== clientId) {
		throw new Error("token does not match client ID");
	}
	if (!userSession.expiresAt || userSession.expiresAt < new Date()) {
		return {
			active: false,
		};
	}

	// Return the access token in introspection format
	// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
	const jwtPlugin = opts.disableJWTPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;

	return {
		active: true,
		client_id: clientId,
		iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		sub: userSession.userId,
		sid: userSession.id,
		exp: Math.floor(userSession.expiresAt.getTime() / 1000),
		iat: Math.floor(userSession.createdAt.getTime() / 1000),
		scope: userSession.scopes?.join(" "),
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
	opts: OAuthOptions,
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
		error: "invalid_token",
	});
}

export async function introspectEndpoint(
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
	if (!client_id || !client_secret) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "missing required credentials",
			error: "invalid_client",
		});
	}

	// Check token
	if (typeof token === "string" && token.startsWith("Bearer ")) {
		token = token.replace("Bearer ", "");
	}
	if (!token.length) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing a required token for introspection",
			error: "invalid_token",
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
				const payload = await validateAccessToken(
					ctx,
					opts,
					token,
					client.clientId,
				);
				return ctx.json(payload);
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
				return ctx.json(payload);
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
			error: "invalid_token",
		});
	} catch (error) {
		if (error instanceof APIError) {
			throw error;
		} else if (error instanceof Error) {
			console.error("Introspection error:", error.message, error.stack);
			throw new APIError("INTERNAL_SERVER_ERROR");
		} else {
			console.error("Introspection error:", error);
			throw new APIError("INTERNAL_SERVER_ERROR");
		}
	}
}
