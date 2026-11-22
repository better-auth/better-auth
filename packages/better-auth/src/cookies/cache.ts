import type { CookieCachePayload } from "@better-auth/core";
import { sessionSchema, userSchema } from "@better-auth/core/db";
import { logger } from "@better-auth/core/env";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { binary } from "@better-auth/utils/binary";
import * as z from "zod";

const cookieCachePayloadSchema: z.ZodType<CookieCachePayload> = z.looseObject({
	session: sessionSchema.loose(),
	user: userSchema.loose(),
	updatedAt: z.number(),
	version: z.string().optional(),
});

const compactCookieCacheSchema = z.object({
	session: z.record(z.string(), z.unknown()),
	expiresAt: z.number(),
	// Always written as base64url without padding; some other characters make the HMAC check throw.
	signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
});

export function parseCookieCachePayload(
	value: unknown,
): CookieCachePayload | null {
	const parsed = safeJSONParse(value);
	if (parsed === null) {
		// safeJSONParse already logs malformed JSON.
		// otherwise, there is no payload to validate.
		return null;
	}

	const result = cookieCachePayloadSchema.safeParse(parsed);
	if (result.success) {
		return result.data;
	}

	logger.warn("Cookie cache payload failed schema validation", {
		issues: result.error.issues.map(({ code, path }) => ({ code, path })),
	});
	return null;
}

/**
 * Decode a compact cookie cache value (base64url-encoded JSON). A value that
 * does not decode, or whose payload is not the compact shape, returns `null`,
 * so a mangled cookie is treated like any other invalid cache value.
 */
export function decodeCompactCookieCache(value: string) {
	let bytes: Uint8Array;
	try {
		bytes = base64Url.decode(value);
	} catch {
		return null;
	}
	const result = compactCookieCacheSchema.safeParse(
		safeJSONParse(binary.decode(bytes)),
	);
	return result.success ? result.data : null;
}
