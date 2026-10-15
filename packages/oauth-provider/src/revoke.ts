import type { GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { stripAccessTokenAuthorizationScheme } from "better-auth/oauth2";
import { APIError } from "better-call";
import { isAudienceClaimAllowed, userInfoResource } from "./resources";
import { invalidateRefreshFamily } from "./token";
import type {
	JwtAccessTokenPayload,
	OpaqueAccessTokenRecord,
	RefreshTokenRecord,
} from "./token-lookup";
import { findToken } from "./token-lookup";
import type { OAuthOptions, Scope } from "./types";
import {
	destructureCredentials,
	extractClientCredentials,
	validateClientCredentials,
} from "./utils";

/**
 * Revocation follows RFC 7009
 * https://datatracker.ietf.org/doc/html/rfc7009
 *
 * A token this server cannot find is already unusable, so it resolves as a
 * successful no-op (§2.2). Only explicit protocol errors surface.
 */

/**
 * A JWT access token is self-contained and never stored, so there is nothing to
 * delete. Once the token is confirmed to be a valid JWT for this server, the
 * endpoint reports `unsupported_token_type` (RFC 7009 §2.2.1) instead of a
 * silent success, so callers can tell that no server-side revocation happened.
 * A JWT with an audience rejected by the OAuth resource model is already
 * inactive and resolves as a successful no-op. Session-bound tokens (carrying
 * `sid`) are cut off early by the session-liveness check in introspection and
 * userinfo.
 */
async function revokeJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	payload: JwtAccessTokenPayload,
) {
	if (
		!payload.azp ||
		!(await isAudienceClaimAllowed(ctx, opts, payload.aud, [
			userInfoResource(ctx.context.baseURL),
		]))
	) {
		return null;
	}
	throw new APIError("BAD_REQUEST", {
		error_description:
			"JWT access tokens are self-contained and cannot be revoked server-side",
		error: "unsupported_token_type",
	});
}

async function revokeOpaqueAccessToken(
	ctx: GenericEndpointContext,
	accessToken: OpaqueAccessTokenRecord,
) {
	await ctx.context.adapter.delete({
		model: "oauthAccessToken",
		where: accessToken.id
			? [{ field: "id", value: accessToken.id }]
			: [{ field: "token", value: accessToken.token }],
	});
}

async function revokeRefreshToken(
	ctx: GenericEndpointContext,
	refreshToken: RefreshTokenRecord,
	clientId: string,
) {
	const { userId } = refreshToken;
	// Presenting an already revoked refresh token is treated as replay: tear
	// down the whole family, and still answer 200 since the token is unusable.
	if (refreshToken.revoked) {
		await invalidateRefreshFamily(ctx, clientId, userId);
		return;
	}

	const iat = Math.floor(Date.now() / 1000);
	// Atomic compare-and-swap. If a concurrent rotation already revoked
	// (and re-minted) this row, fail closed and tear down the whole family
	// so the rotation's offspring cannot be used either.
	const won = await ctx.context.adapter.incrementOne<{ id: string }>({
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
		increment: {},
		set: {
			revoked: new Date(iat * 1000),
		},
	});
	if (!won) {
		await invalidateRefreshFamily(ctx, clientId, userId);
		return;
	}
	await ctx.context.adapter.deleteMany({
		model: "oauthAccessToken",
		where: [{ field: "refreshId", value: refreshToken.id }],
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
		const found = await findToken(ctx, opts, token, token_type_hint);
		if (!found) return null;
		if (found.type === "jwt") {
			return await revokeJwtAccessToken(ctx, opts, found.payload);
		}

		// RFC 7009 §2.1: refuse to revoke a token issued to another client. A
		// public client gets a silent 200 instead, so it cannot probe which
		// token values exist.
		if (found.record.clientId !== client.clientId) {
			if (client.tokenEndpointAuthMethod === "none") return null;
			throw new APIError("BAD_REQUEST", {
				error_description:
					"client is not authorized to revoke the presented token",
				error: "invalid_request",
			});
		}

		if (found.type === "opaque") {
			await revokeOpaqueAccessToken(ctx, found.record);
		} else {
			await revokeRefreshToken(ctx, found.record, client.clientId);
		}
		return null;
	} catch (error) {
		if (error instanceof APIError) throw error;
		logger.error("Revocation error:", error);
		throw new APIError("INTERNAL_SERVER_ERROR");
	}
}
