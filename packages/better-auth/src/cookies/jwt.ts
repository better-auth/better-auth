import type { CookieCachePayload } from "@better-auth/core";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { parseCookieCachePayload } from "./cache";

export const SESSION_COOKIE_JWT_TYPE = "better-auth.session-cache+jwt";
export const SESSION_COOKIE_JWT_AUDIENCE = "better-auth:session-cache";
export const SESSION_COOKIE_JWT_ISSUER = "better-auth:session-cache";

export type VerifySessionCookieJwtOptions = {
	issuer?: string | undefined;
	audience?: string | undefined;
};

export function getSessionCookieJwtVerifyOptions(
	options?: VerifySessionCookieJwtOptions,
) {
	const verifyOptions: {
		clockTolerance: number;
		audience: string;
		issuer?: string;
	} = {
		clockTolerance: 15,
		audience: options?.audience ?? SESSION_COOKIE_JWT_AUDIENCE,
	};

	if (options?.issuer) {
		verifyOptions.issuer = options.issuer;
	}

	return verifyOptions;
}

export function parseSessionCookieJwtPayload(
	payload: JWTPayload,
): (CookieCachePayload & JWTPayload) | null {
	const data = parseCookieCachePayload(payload);
	if (!data || typeof payload.iss !== "string" || !payload.iss) {
		return null;
	}

	if (payload.sub !== data.user.id || payload.sid !== data.session.token) {
		return null;
	}

	return {
		...payload,
		...data,
	};
}

export async function verifySessionCookieJwtWithJwks(
	token: string,
	jwks: JSONWebKeySet,
	options?: VerifySessionCookieJwtOptions,
): Promise<(CookieCachePayload & JWTPayload) | null> {
	try {
		const header = decodeProtectedHeader(token);
		if (header.typ !== SESSION_COOKIE_JWT_TYPE) {
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
			...getSessionCookieJwtVerifyOptions(options),
			algorithms: [alg],
		});
		return parseSessionCookieJwtPayload(payload);
	} catch {
		return null;
	}
}
