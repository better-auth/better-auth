import type {
	CookieCachePayload,
	CookieCacheSigner,
	GenericEndpointContext,
} from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { decodeProtectedHeader, importJWK, jwtVerify, SignJWT } from "jose";
import {
	getSessionCookieJwtVerifyOptions,
	parseSessionCookieJwtPayload,
	SESSION_COOKIE_JWT_AUDIENCE,
	SESSION_COOKIE_JWT_ISSUER,
	SESSION_COOKIE_JWT_TYPE,
} from "../../cookies/jwt";
import { getJwksAdapter } from "./adapter";
import { resolveSigningKey } from "./sign";
import type { JwtOptions } from "./types";

function getCookieCacheJwtIssuer(ctx: GenericEndpointContext) {
	const baseURL = ctx.context.options.baseURL;
	return typeof baseURL === "string"
		? baseURL || SESSION_COOKIE_JWT_ISSUER
		: ctx.context.baseURL || SESSION_COOKIE_JWT_ISSUER;
}

async function importLocalPublicKey(
	ctx: GenericEndpointContext,
	token: string,
	options?: JwtOptions,
) {
	const header = decodeProtectedHeader(token);
	const kid = header.kid;
	if (!kid) {
		ctx.context.logger.debug("Cookie-cache JWT missing kid in header");
		return null;
	}

	const adapter = getJwksAdapter(ctx.context.adapter, options);
	const keys = await adapter.getAllKeys(ctx);
	if (!keys?.length) {
		ctx.context.logger.debug("No JWKS keys available for cookie-cache JWT");
		return null;
	}

	const key = keys.find((entry) => entry.id === kid);
	if (!key) {
		ctx.context.logger.debug(
			`No JWKS key found for cookie-cache JWT kid: ${kid}`,
		);
		return null;
	}

	const alg =
		key.alg ??
		options?.jwks?.keyPairConfig?.alg ??
		(header.alg as string | undefined);
	if (!alg) {
		ctx.context.logger.debug(
			`No JWT algorithm available for cookie-cache JWT kid: ${kid}`,
		);
		return null;
	}

	return {
		alg,
		publicKey: await importJWK(JSON.parse(key.publicKey), alg),
	};
}

async function signCookieCacheJWT(
	ctx: GenericEndpointContext,
	payload: CookieCachePayload,
	expiresIn: number,
	options?: JwtOptions,
): Promise<string> {
	const resolvedKey = await resolveSigningKey(ctx, options);
	if (!resolvedKey) {
		throw new BetterAuthError(
			"`jwt({ sessionCookieCache: true })` requires locally managed JWT plugin keys and does not support `jwt.sign`.",
		);
	}

	const jwt = new SignJWT({
		...payload,
		sid: payload.session.token,
	})
		.setProtectedHeader({
			alg: resolvedKey.alg,
			kid: resolvedKey.kid,
			typ: SESSION_COOKIE_JWT_TYPE,
		})
		.setIssuedAt()
		.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
		.setIssuer(getCookieCacheJwtIssuer(ctx))
		.setAudience(SESSION_COOKIE_JWT_AUDIENCE)
		.setSubject(payload.user.id);

	return await jwt.sign(resolvedKey.privateKey);
}

async function verifyCookieCacheJWT(
	ctx: GenericEndpointContext,
	token: string,
	options?: JwtOptions,
): Promise<{
	payload: CookieCachePayload;
	expiresAt: number;
} | null> {
	try {
		const header = decodeProtectedHeader(token);
		if (header.typ !== SESSION_COOKIE_JWT_TYPE) {
			return null;
		}

		const key = await importLocalPublicKey(ctx, token, options);
		if (!key) {
			return null;
		}

		const { payload } = await jwtVerify(token, key.publicKey, {
			...getSessionCookieJwtVerifyOptions({
				issuer: getCookieCacheJwtIssuer(ctx),
			}),
			algorithms: [key.alg],
		});

		const parsed = parseSessionCookieJwtPayload(payload);
		if (!parsed) {
			return null;
		}

		return {
			payload: parsed,
			expiresAt: parsed.exp ? parsed.exp * 1000 : Date.now(),
		};
	} catch (error) {
		ctx.context.logger.debug("Cookie-cache JWT verification failed", error);
		return null;
	}
}

export function createCookieCacheSigner(
	options?: JwtOptions,
): CookieCacheSigner {
	return {
		sign: (ctx, payload, expiresIn) =>
			signCookieCacheJWT(ctx, payload, expiresIn, options),
		verify: (ctx, token) => verifyCookieCacheJWT(ctx, token, options),
	};
}
