import type { CookieCachePayload } from "@better-auth/core";
import { sessionSchema, userSchema } from "@better-auth/core/db";
import { logger } from "@better-auth/core/env";
import { safeJSONParse } from "@better-auth/core/utils/json";
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
	signature: z.string(),
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

export function parseCompactCookieCache(value: unknown) {
	const result = compactCookieCacheSchema.safeParse(value);
	return result.success ? result.data : null;
}
