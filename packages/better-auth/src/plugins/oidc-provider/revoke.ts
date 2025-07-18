import { APIError } from "better-call";
import { createLocalJWKSet, JSONWebKeySet, JWTPayload, jwtVerify } from "jose";
import { GenericEndpointContext } from "../../types";
import { basicToClientCredentials, validateClientCredentials } from "./token";
import { OAuthAccessToken, OIDCOptions } from "./types";
import { getJwtPlugin } from "../jwt";

/**
 * IMPORTANT NOTES:
 * Instropection follows RFC7662
 * https://datatracker.ietf.org/doc/html/rfc7662
 * - APIError: Continue catches (returnable to client)
 * - Error: Should immediately stop catches (internal error)
 */

/**
 * Revokes a JWT access token against the configured JWKs.
 * (does nothing if successful since a JWT is not stored on the server)
 */
async function revokeJwtAccessToken(
	ctx: GenericEndpointContext,
	token: string,
) {
	const jwtPlugin = getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin.options;

	// Validate JWT against the JWKs
	const jwksResult = jwtPluginOptions?.jwks?.remoteUrl
		? await fetch(jwtPluginOptions.jwks.remoteUrl, {
				headers: {
					Accept: "application/json",
				},
			}).then(async (res) => {
				if (!res.ok) throw new Error(`Jwks error: status ${res.status}`);
				return (await res.json()) as JSONWebKeySet | undefined;
			})
		: await jwtPlugin.endpoints?.getJwks(ctx).then(async (res) => {
				return res.response as JSONWebKeySet | undefined;
			});
	if (!jwksResult) throw new Error("No jwks found");
	const jwks = createLocalJWKSet(jwksResult);
	try {
		await jwtVerify<
			JWTPayload & {
				sid?: string;
				azp?: string;
			}
		>(token, jwks, {
			audience: jwtPluginOptions?.jwt?.audience ?? ctx.context.options.baseURL,
			issuer: jwtPluginOptions?.jwt?.issuer ?? ctx.context.options.baseURL,
			typ: "JWT",
		});
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === "JWTExpired") {
				return null;
			} else if (error.name === "JWTInvalid") {
				// audience or issuer mismatch
				throw new Error("jwt invalid likely audience or issuer mismatch");
			} else if (error.name === "JWSInvalid") {
				// likely an opaque token
				throw new APIError("BAD_REQUEST", {
					error_description: "invalid JWT signature",
					error: "invalid_token",
				});
			}
			throw error;
		}
		throw new Error(error as unknown as string);
	}
}

/**
 * Searches for an opaque access token in the database and validates it
 *
 * @returns RFC7662 introspection format
 */
async function revokeOpaqueAccessToken(
	ctx: GenericEndpointContext,
	opts: OIDCOptions,
	clientId: string,
	token: string,
) {
	const accessToken: (OAuthAccessToken & { id?: string }) | null =
		await ctx.context.adapter.findOne({
			model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
			where: [{ field: "token", value: token }],
		});
	if (!accessToken) {
		throw new APIError("BAD_REQUEST", {
			error_description: "opaque access token not found",
			error: "invalid_token",
		});
	}
	if (!accessToken.clientId || accessToken.clientId !== clientId) {
		throw new Error("access token does not match client ID");
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
 *
 * @returns payload in RFC7662 introspection format
 */
async function revokeRefreshToken(
	ctx: GenericEndpointContext,
	opts: OIDCOptions,
	clientId: string,
	token: string,
) {
	const refreshToken = await ctx.context.internalAdapter.findSession(token);
	if (!refreshToken) {
		throw new APIError("BAD_REQUEST", {
			error_description: "token not found",
			error: "invalid_token",
		});
	}
	if (
		!refreshToken.session.clientId ||
		refreshToken.session.clientId !== clientId
	) {
		throw new Error("token does not match client ID");
	}

	// Remove all access tokens associated with the refresh token
	await ctx.context.adapter.delete({
		model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
		where: [{ field: "sessionId", value: refreshToken.session.id }],
	});

	// Remove the refresh token
	refreshToken.session.id
		? await ctx.context.internalAdapter.deleteSessionById(
				refreshToken.session.id,
			)
		: await ctx.context.internalAdapter.deleteSession(token);
}

/**
 * We don't know the access token format so we try to validate it
 * as a JWT first, then as an opaque token.
 *
 * @returns RFC7662 introspection format
 */
async function revokeAccessToken(
	ctx: GenericEndpointContext,
	opts: OIDCOptions,
	clientId: string,
	token: string,
) {
	try {
		return await revokeJwtAccessToken(ctx, token);
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
		return await revokeOpaqueAccessToken(ctx, opts, clientId, token);
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

export async function revokeEndpoint(
	ctx: GenericEndpointContext,
	opts: OIDCOptions,
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
	if (token.startsWith("Bearer ")) {
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
				return await revokeRefreshToken(ctx, opts, client.clientId, token);
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
