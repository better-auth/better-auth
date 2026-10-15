import type { GenericEndpointContext } from "@better-auth/core";
import { getJwks } from "better-auth/oauth2";
import { APIError } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import {
	createLocalJWKSet,
	decodeProtectedHeader,
	errors as joseErrors,
	jwtVerify,
} from "jose";
import type {
	OAuthOpaqueAccessToken,
	OAuthOptions,
	OAuthRefreshToken,
	Scope,
} from "./types";
import { getJwtPlugin, getStoredToken } from "./utils";

/** Signature, issuer, and `azp` are verified; audience and client are not. */
export type JwtAccessTokenPayload = JWTPayload & { azp: string; sid?: string };
export type OpaqueAccessTokenRecord = OAuthOpaqueAccessToken<Scope[]> & {
	id?: string;
};
export type RefreshTokenRecord = OAuthRefreshToken<Scope[]> & { id: string };

/** An access token issued by this server, identified by its format. */
export type FoundAccessToken =
	| { type: "jwt"; payload: JwtAccessTokenPayload }
	| { type: "opaque"; record: OpaqueAccessTokenRecord };

/** A token presented to revocation or introspection, identified by type. */
export type FoundToken =
	| FoundAccessToken
	| { type: "refresh"; record: RefreshTokenRecord };

const jwksInfrastructureErrorCodes = new Set([
	joseErrors.JWKSTimeout.code,
	joseErrors.JWKSInvalid.code,
	joseErrors.JWKSMultipleMatchingKeys.code,
]);

/**
 * Verifies a JWT access token issued by this server. Returns `"inactive"` for
 * one that is expired or fails claim validation, so the lookup can stop: it
 * cannot be another token type. Returns `null` for anything else (an opaque
 * token, a malformed or forged JWT, a JWT that is not an access token) so the
 * lookup can continue. Key-set failures still throw.
 */
async function verifyJwtAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
): Promise<JwtAccessTokenPayload | "inactive" | null> {
	if (opts.disableJwtPlugin) return null;
	// Only a compact JWS (three segments) can be a JWT access token; a JWE such
	// as an encrypted refresh token has five, and must not wait on the key set.
	if (token.split(".").length !== 3) return null;
	try {
		decodeProtectedHeader(token);
	} catch {
		return null;
	}
	const jwtPlugin = getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin.options;
	const jwksFetch = jwtPluginOptions?.jwks?.remoteUrl
		? jwtPluginOptions.jwks.remoteUrl
		: async (): Promise<JSONWebKeySet | undefined> => {
				const jwksRes = await jwtPlugin.endpoints.getJwks(ctx);
				// @ts-expect-error response is a JSONWebKeySet but within the response field
				return jwksRes?.response as JSONWebKeySet | undefined;
			};
	// The plugin instance is stable across requests, so the key set fetched by
	// the per-request closure above is cached under it.
	const jwks = await getJwks(token, { jwksFetch, jwksCacheKey: jwtPlugin });
	let payload: JWTPayload;
	try {
		// Do not pass jose's `audience` option: access-token audiences are
		// resource identifiers, which each endpoint validates itself.
		({ payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
			issuer: jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL,
		}));
	} catch (error) {
		// jose checks claims only after the signature verifies. `JWTExpired` is
		// not a subclass of `JWTClaimValidationFailed`, so both are listed.
		if (
			error instanceof joseErrors.JWTExpired ||
			error instanceof joseErrors.JWTClaimValidationFailed
		) {
			return isAccessTokenPayload(error.payload) ? "inactive" : null;
		}
		if (
			error instanceof joseErrors.JOSEError &&
			!jwksInfrastructureErrorCodes.has(error.code)
		) {
			return null;
		}
		throw error;
	}
	return isAccessTokenPayload(payload) ? payload : null;
}

/**
 * The OAuth token endpoint stamps `azp` (the client) on every JWT access token.
 * The JWT plugin signs other JWTs with the same issuer and keys, such as its
 * `/token` session JWT, so one without `azp` is not an access token.
 */
function isAccessTokenPayload(
	payload: JWTPayload,
): payload is JwtAccessTokenPayload {
	return typeof payload.azp === "string" && payload.azp.length > 0;
}

async function findOpaqueAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
) {
	const prefix = opts.prefix?.opaqueAccessToken;
	if (prefix && !token.startsWith(prefix)) return null;
	return ctx.context.adapter.findOne<OpaqueAccessTokenRecord>({
		model: "oauthAccessToken",
		where: [
			{
				field: "token",
				value: await getStoredToken(
					opts.storeTokens,
					prefix ? token.slice(prefix.length) : token,
					"access_token",
				),
			},
		],
	});
}

/**
 * Looks up a refresh token by its presented value, after removing the
 * configured prefix and applying `formatRefreshToken.decrypt`. Returns `null`
 * when the value is not a refresh token this server stored.
 */
export async function findRefreshToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
) {
	const prefix = opts.prefix?.refreshToken;
	if (prefix && !token.startsWith(prefix)) return null;
	const value = prefix ? token.slice(prefix.length) : token;
	let decoded: { token: string };
	try {
		decoded = opts.formatRefreshToken?.decrypt
			? await opts.formatRefreshToken.decrypt(value)
			: { token: value };
	} catch (error) {
		// A `decrypt` that rejects the format, with a 400 or a JOSE error such as
		// `compactDecrypt` throws, means this is not a refresh token. Any other
		// failure is real.
		if (
			(error instanceof APIError && error.statusCode === 400) ||
			error instanceof joseErrors.JOSEError
		) {
			return null;
		}
		throw error;
	}
	return ctx.context.adapter.findOne<RefreshTokenRecord>({
		model: "oauthRefreshToken",
		where: [
			{
				field: "token",
				value: await getStoredToken(
					opts.storeTokens,
					decoded.token,
					"refresh_token",
				),
			},
		],
	});
}

async function identifyAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
): Promise<FoundAccessToken | "inactive" | null> {
	const payload = await verifyJwtAccessToken(ctx, opts, token);
	if (payload === "inactive") return payload;
	if (payload) return { type: "jwt", payload };
	const record = await findOpaqueAccessToken(ctx, opts, token);
	return record ? { type: "opaque", record } : null;
}

/**
 * Identifies an access token as a JWT or an opaque token issued by this
 * server. Returns `null` when it is neither, including an expired JWT.
 */
export async function findAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
): Promise<FoundAccessToken | null> {
	const found = await identifyAccessToken(ctx, opts, token);
	return found === "inactive" ? null : found;
}

/**
 * Identifies a token presented to revocation or introspection. Every token
 * type is searched; `token_type_hint` only decides which one is tried first
 * (RFC 7009 §2.1, RFC 7662 §2.1). Returns `null` when no type matches. Only
 * infrastructure failures (key set, database, refresh-token decryption) throw.
 */
export async function findToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	token: string,
	tokenTypeHint?: string,
): Promise<FoundToken | null> {
	const asRefreshToken = async (): Promise<FoundToken | null> => {
		const record = await findRefreshToken(ctx, opts, token);
		return record ? { type: "refresh", record } : null;
	};
	if (tokenTypeHint === "refresh_token") {
		return (await asRefreshToken()) ?? findAccessToken(ctx, opts, token);
	}
	const found = await identifyAccessToken(ctx, opts, token);
	if (found === "inactive") return null;
	return found ?? asRefreshToken();
}
