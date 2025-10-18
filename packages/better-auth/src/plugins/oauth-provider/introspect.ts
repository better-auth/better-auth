import { APIError } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import type { GenericEndpointContext } from "@better-auth/core";
import type { Session, User } from "../../types";
import {
	basicToClientCredentials,
	getClient,
	getStoredToken,
	validateClientCredentials,
} from "./utils";
import type {
	OAuthOpaqueAccessToken,
	OAuthOptions,
	OAuthRefreshToken,
	SchemaClient,
} from "./types";
import { getJwtPlugin } from "./utils";
import { decodeRefreshToken } from "./token";
import { verifyJwsAccessToken } from "./verify";
import { logger } from "@better-auth/core/env";

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
	const jwtPlugin = opts.disableJwtPlugin
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
					error: "invalid_request",
				});
			} else if (error.name === "JWTExpired") {
				return {
					active: false,
				};
			} else if (error.name === "JWTInvalid") {
				// audience or issuer mismatch
				return {
					active: false,
				};
			}
			throw error;
		}
		throw new Error(error as unknown as string);
	}

	let client: SchemaClient | null | undefined;
	if (jwtPayload.azp) {
		client = await getClient(ctx, opts, jwtPayload.azp);
		if (!client || client?.disabled) {
			return {
				active: false,
			};
		}
		if (clientId && jwtPayload.azp !== clientId) {
			return {
				active: false,
			};
		}
	}

	// Validate JWT against its session if it exists
	let sessionId = jwtPayload.sid;
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
			jwtPayload.sid = undefined;
		}
	}

	// Add Custom Claims
	if (opts.customAccessTokenClaims) {
		let user: User | null | undefined;
		if (jwtPayload.sub) {
			user =
				(await ctx.context.internalAdapter.findUserById(jwtPayload.sub)) ??
				undefined;
		}
		const customClaims = await opts.customAccessTokenClaims({
			user,
			scopes: ((jwtPayload.scopes as string | undefined) ?? "")?.split(" "),
			resource: ctx.body.resource,
			referenceId: client?.referenceId,
			metadata: client?.metadata ? JSON.parse(client.metadata) : undefined,
		});
		jwtPayload = {
			...customClaims,
			...jwtPayload,
		};
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
				error: "invalid_request",
			});
		}
	}
	const accessToken = await ctx.context.adapter
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

	let client: SchemaClient | null | undefined;
	if (accessToken.clientId) {
		client = await getClient(ctx, opts, accessToken.clientId);
		if (!client || client?.disabled) {
			return {
				active: false,
			};
		}
		if (clientId && accessToken.clientId !== clientId) {
			return {
				active: false,
			};
		}
	}

	let sessionId = accessToken.sessionId ?? undefined;
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

	let user: User | null | undefined;
	if (accessToken.userId) {
		user = await ctx.context.internalAdapter.findUserById(accessToken?.userId);
	}

	// Add Custom Claims
	const customClaims = opts.customAccessTokenClaims
		? await opts.customAccessTokenClaims({
				user,
				scopes: accessToken.scopes,
				resource: ctx.body.resource,
				referenceId: client?.referenceId,
				metadata: client?.metadata ? JSON.parse(client.metadata) : undefined,
			})
		: {};

	// Return the access token in introspection format
	// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;
	return {
		...customClaims,
		active: true,
		iss: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		client_id: accessToken.clientId,
		sub: user?.id,
		sid: sessionId,
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
	const refreshToken = await ctx.context.adapter
		.findOne<OAuthRefreshToken | null>({
			model: "oauthRefreshToken",
			where: [
				{
					field: "token",
					value: await getStoredToken(opts.storeTokens, token, "refresh_token"),
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

	let sessionId: string | undefined = refreshToken.sessionId ?? undefined;
	if (sessionId) {
		const session = await ctx.context.adapter.findOne<Session>({
			model: "session",
			where: [
				{
					field: "id",
					value: refreshToken.sessionId,
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
		exp: Math.floor(refreshToken.expiresAt.getTime() / 1000),
		iat: Math.floor(refreshToken.createdAt.getTime() / 1000),
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
		error: "invalid_request",
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
