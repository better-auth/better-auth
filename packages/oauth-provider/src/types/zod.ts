import * as z from "zod";

const DANGEROUS_SCHEMES = ["javascript:", "data:", "vbscript:"];

function isLocalhost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname.endsWith(".localhost")
	);
}

/**
 * Runtime schema for OAuthAuthorizationQuery.
 * Uses passthrough to tolerate fields added by future extensions (PAR, FPA, etc.)
 */
export const oauthAuthorizationQuerySchema = z
	.object({
		response_type: z.literal("code").optional(),
		request_uri: z.string().optional(),
		redirect_uri: z.string(),
		scope: z.string().optional(),
		state: z.string(),
		client_id: z.string(),
		prompt: z.string().optional(),
		display: z.string().optional(),
		ui_locales: z.string().optional(),
		max_age: z.coerce.number().optional(),
		acr_values: z.string().optional(),
		login_hint: z.string().optional(),
		id_token_hint: z.string().optional(),
		code_challenge: z.string().optional(),
		code_challenge_method: z.literal("S256").optional(),
		nonce: z.string().optional(),
	})
	.passthrough();

/**
 * Runtime schema for the authorization code verification value.
 * Validates structure on deserialization from the JSON blob stored in the DB.
 * Uses passthrough so future fields (e.g. from authorization challenge) don't break parsing.
 */
export const verificationValueSchema = z
	.object({
		type: z.literal("authorization_code"),
		query: oauthAuthorizationQuerySchema,
		sessionId: z.string(),
		userId: z.string(),
		referenceId: z.string().optional(),
		authTime: z.number().optional(),
	})
	.passthrough();

/**
 * Reusable URL validation for OAuth redirect URIs.
 * - Blocks dangerous schemes (javascript:, data:, vbscript:)
 * - For http/https: requires HTTPS (HTTP allowed only for localhost)
 * - Allows custom schemes for mobile apps (e.g., myapp://callback)
 */
export const SafeUrlSchema = z.url().superRefine((val, ctx) => {
	if (!URL.canParse(val)) {
		ctx.addIssue({
			code: "custom",
			message: "URL must be parseable",
			fatal: true,
		});
		return z.NEVER;
	}

	const u = new URL(val);

	if (DANGEROUS_SCHEMES.includes(u.protocol)) {
		ctx.addIssue({
			code: "custom",
			message: "URL cannot use javascript:, data:, or vbscript: scheme",
		});
		return;
	}

	if (u.protocol === "http:" || u.protocol === "https:") {
		if (u.protocol === "http:" && !isLocalhost(u.hostname)) {
			ctx.addIssue({
				code: "custom",
				message:
					"Redirect URI must use HTTPS (HTTP allowed only for localhost)",
			});
		}
	}
});
