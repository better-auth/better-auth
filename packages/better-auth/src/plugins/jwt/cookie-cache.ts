import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { decodeProtectedHeader, importJWK, jwtVerify, SignJWT } from "jose";
import type { Session, User } from "../../types";
import { getJwksAdapter } from "./adapter";
import { resolveSigningKey } from "./sign";
import type { JwtOptions } from "./types";

export const COOKIE_CACHE_JWT_TYPE = "better-auth.session-cache+jwt";
export const COOKIE_CACHE_JWT_AUDIENCE = "better-auth:session-cache";
export const COOKIE_CACHE_JWT_ISSUER = "better-auth:session-cache";

type CookieCacheJwtSigningKey = "secret" | "jwt-plugin";

type CookieCacheJwtPayload = {
	session: Session & Record<string, unknown>;
	user: User & Record<string, unknown>;
	updatedAt: number;
	version?: string;
};

export type VerifyCookieCacheJwtOptions = {
	issuer?: string | undefined;
	audience?: string | undefined;
};

export function getCookieCacheJwtSigningKey(
	options: Pick<BetterAuthOptions, "session"> | undefined,
): CookieCacheJwtSigningKey {
	return options?.session?.cookieCache?.jwt?.signingKey ?? "secret";
}

function getJwtPluginOptions(ctx: GenericEndpointContext): JwtOptions {
	const plugin = ctx.context.getPlugin?.("jwt");
	if (!plugin) {
		throw new BetterAuthError(
			'`session.cookieCache.jwt.signingKey = "jwt-plugin"` requires the `jwt()` plugin to be installed.',
		);
	}
	const options = (plugin.options ?? {}) as JwtOptions;
	if (options.jwt?.sign) {
		throw new BetterAuthError(
			'`session.cookieCache.jwt.signingKey = "jwt-plugin"` requires locally managed JWT plugin keys and does not support `jwt({ jwt: { sign } })`.',
		);
	}
	return options;
}

function getCookieCacheJwtIssuer(ctx: GenericEndpointContext) {
	const baseURL = ctx.context.options.baseURL;
	return typeof baseURL === "string"
		? baseURL || COOKIE_CACHE_JWT_ISSUER
		: ctx.context.baseURL || COOKIE_CACHE_JWT_ISSUER;
}

function getCookieCacheJwtVerifyOptions(options?: VerifyCookieCacheJwtOptions) {
	const verifyOptions: {
		clockTolerance: number;
		audience: string;
		issuer?: string;
	} = {
		clockTolerance: 15,
		audience: options?.audience ?? COOKIE_CACHE_JWT_AUDIENCE,
	};

	if (options?.issuer) {
		verifyOptions.issuer = options.issuer;
	}

	return verifyOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseCookieCacheJwtPayload<T extends CookieCacheJwtPayload>(
	payload: JWTPayload,
): (T & JWTPayload) | null {
	if (
		!isRecord(payload.session) ||
		!isRecord(payload.user) ||
		typeof payload.updatedAt !== "number"
	) {
		return null;
	}

	if (typeof payload.iss !== "string" || payload.iss.length === 0) {
		return null;
	}

	const userId = payload.user.id;
	const sessionToken = payload.session.token;
	if (typeof userId !== "string" || typeof sessionToken !== "string") {
		return null;
	}

	if (payload.sub !== userId || payload.sid !== sessionToken) {
		return null;
	}

	return payload as T & JWTPayload;
}

async function importLocalPublicKey(
	ctx: GenericEndpointContext,
	token: string,
	options: JwtOptions,
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
		options.jwks?.keyPairConfig?.alg ??
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

export async function signCookieCacheJWT<T extends CookieCacheJwtPayload>(
	ctx: GenericEndpointContext,
	payload: T,
	expiresIn: number,
): Promise<string> {
	const options = getJwtPluginOptions(ctx);
	const resolvedKey = await resolveSigningKey(ctx, options);
	if (!resolvedKey) {
		throw new BetterAuthError(
			'`session.cookieCache.jwt.signingKey = "jwt-plugin"` requires locally managed JWT plugin keys and does not support `jwt({ jwt: { sign } })`.',
		);
	}

	const jwt = new SignJWT({
		...payload,
		sid: payload.session.token,
	})
		.setProtectedHeader({
			alg: resolvedKey.alg,
			kid: resolvedKey.kid,
			typ: COOKIE_CACHE_JWT_TYPE,
		})
		.setIssuedAt()
		.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
		.setIssuer(getCookieCacheJwtIssuer(ctx))
		.setAudience(COOKIE_CACHE_JWT_AUDIENCE)
		.setSubject(payload.user.id);

	return await jwt.sign(resolvedKey.privateKey);
}

export async function verifyCookieCacheJWT<
	T extends CookieCacheJwtPayload = CookieCacheJwtPayload,
>(
	ctx: GenericEndpointContext,
	token: string,
): Promise<(T & JWTPayload) | null> {
	try {
		const header = decodeProtectedHeader(token);
		if (header.typ !== COOKIE_CACHE_JWT_TYPE) {
			return null;
		}

		const options = getJwtPluginOptions(ctx);
		const key = await importLocalPublicKey(ctx, token, options);
		if (!key) {
			return null;
		}

		const { payload } = await jwtVerify(token, key.publicKey, {
			...getCookieCacheJwtVerifyOptions({
				issuer: getCookieCacheJwtIssuer(ctx),
			}),
			algorithms: [key.alg],
		});

		return parseCookieCacheJwtPayload<T>(payload);
	} catch (error) {
		ctx.context.logger.debug("Cookie-cache JWT verification failed", error);
		return null;
	}
}

export async function verifyCookieCacheJWTWithJWKS<
	T extends CookieCacheJwtPayload = CookieCacheJwtPayload,
>(
	token: string,
	jwks: JSONWebKeySet,
	options?: VerifyCookieCacheJwtOptions,
): Promise<(T & JWTPayload) | null> {
	try {
		const header = decodeProtectedHeader(token);
		if (header.typ !== COOKIE_CACHE_JWT_TYPE) {
			return null;
		}

		const kid = header.kid;
		if (!kid) {
			return null;
		}

		const key = jwks.keys.find((entry) => entry.kid === kid);
		if (!key) {
			return null;
		}

		const alg = key.alg ?? (header.alg as string | undefined);
		if (!alg) {
			return null;
		}

		const publicKey = await importJWK(key, alg);
		const { payload } = await jwtVerify(token, publicKey, {
			...getCookieCacheJwtVerifyOptions(options),
			algorithms: [alg],
		});
		return parseCookieCacheJwtPayload<T>(payload);
	} catch {
		return null;
	}
}
