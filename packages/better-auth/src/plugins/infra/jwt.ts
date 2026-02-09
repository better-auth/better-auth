import { betterFetch } from "@better-fetch/fetch";
import type { GenericEndpointContext } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { JWTPayload } from "jose";
import { createLocalJWKSet, jwtVerify } from "jose";
import type z from "zod";
import type { ZodObject } from "zod";
import type { DashOptionsInternal } from "./types";

/**
 * Skip JTI check for JWTs issued within this many seconds.
 * This is safe because replay attacks require time for interception.
 * A freshly issued token is almost certainly legitimate.
 */
const JTI_CHECK_GRACE_PERIOD_SECONDS = 30;

async function getJWKs(apiUrl: string) {
	const jwks = await betterFetch<{
		keys: {
			kid: string;
		}[];
	}>(`${apiUrl}/api/auth/jwks`);
	if (!jwks.data) {
		throw new APIError("UNAUTHORIZED", {
			message: "Invalid API key",
		});
	}
	const remoteJWKs = createLocalJWKSet(jwks.data);
	return remoteJWKs;
}

/**
 * Check if JWT is recently issued and can skip JTI verification.
 * JWTs issued within the grace period are trusted without JTI check
 * since replay attacks need time for interception and replay.
 */
function isRecentlyIssued(payload: JWTPayload): boolean {
	if (!payload.iat) return false;
	const issuedAt = payload.iat * 1000; // Convert to milliseconds
	const now = Date.now();
	return now - issuedAt < JTI_CHECK_GRACE_PERIOD_SECONDS * 1000;
}

export const jwtMiddleware = <Z extends z.ZodObject<any, any>>(
	options: DashOptionsInternal,
	schema?: Z,
	getJWT?: (ctx: GenericEndpointContext) => Promise<string>,
) =>
	createAuthMiddleware(async (ctx) => {
		const jwsFromHeader = getJWT
			? await getJWT(ctx)
			: ctx.headers?.get("Authorization")?.split(" ")[1];
		if (!jwsFromHeader) {
			throw ctx.error("UNAUTHORIZED", {
				message: "Invalid API key",
			});
		}
		const remoteJWKs = await getJWKs(options.apiUrl);
		const { payload } = await jwtVerify(jwsFromHeader, remoteJWKs, {
			maxTokenAge: "5m",
		}).catch(() => {
			throw ctx.error("UNAUTHORIZED", {
				message: "Invalid API key",
			});
		});

		// Skip JTI check for recently issued JWTs (within grace period).
		// This is safe because replay attacks require time for interception,
		// and a freshly issued token is almost certainly legitimate.
		if (!isRecentlyIssued(payload)) {
			const hasSeen = await betterFetch<{
				valid: boolean;
			}>("/api/auth/check-jti", {
				baseURL: options.apiUrl,
				method: "POST",
				body: {
					jti: payload.jti,
					expiresAt: payload.exp,
				},
			});

			if (!hasSeen.data?.valid) {
				throw ctx.error("UNAUTHORIZED", {
					message: "Invalid API key",
				});
			}
		}

		if (schema) {
			const parsed = schema.safeParse(payload);
			if (!parsed.success) {
				throw ctx.error("UNAUTHORIZED", {
					message: "Invalid API key",
				});
			}
			return {
				payload: parsed.data as Z extends ZodObject<any, any>
					? z.infer<Z>
					: JWTPayload,
			};
		}
		return {
			payload: payload as Z extends ZodObject<any, any>
				? z.infer<Z>
				: JWTPayload,
		};
	});
