import { SafeUrlSchema } from "@better-auth/core/utils/redirect-uri";
import * as z from "zod";
import { supportedPromptValues } from ".";

/**
 * Re-exported from `@better-auth/core` so every OAuth provider plugin shares one
 * redirect-URI scheme policy. See `@better-auth/core/utils/redirect-uri`.
 */
export { SafeUrlSchema } from "@better-auth/core/utils/redirect-uri";

const DANGEROUS_SCHEMES = ["javascript:", "data:", "vbscript:"];
const supportedPromptValueSet = new Set<string>(supportedPromptValues);

const authorizationPromptSchema = z.string().superRefine((value, ctx) => {
	const prompts = value.split(" ");
	if (prompts.length === 0 || prompts.some((prompt) => prompt.length === 0)) {
		ctx.addIssue({
			code: "custom",
			message: "prompt must be a space-delimited list of supported values",
		});
		return;
	}
	const unsupportedPrompt = prompts.find(
		(prompt) => !supportedPromptValueSet.has(prompt),
	);
	if (unsupportedPrompt) {
		ctx.addIssue({
			code: "custom",
			message: "prompt contains an unsupported value",
		});
		return;
	}
	if (prompts.includes("none") && prompts.length > 1) {
		ctx.addIssue({
			code: "custom",
			message: "prompt value none cannot be combined with other prompt values",
		});
	}
});

/**
 * Validates an RFC 8707 resource indicator. The value must be an absolute URI
 * with no fragment (RFC 8707 §2). Unlike a redirect URI it is not restricted to
 * HTTPS, because a resource server identifier may use any absolute URI scheme;
 * the configured `validAudiences` allowlist is the authoritative control over
 * which resources a token may target.
 */
export const ResourceUriSchema = z.string().superRefine((val, ctx) => {
	if (!URL.canParse(val)) {
		ctx.addIssue({
			code: "custom",
			message: "resource must be an absolute URI",
			fatal: true,
		});
		return z.NEVER;
	}
	if (val.includes("#")) {
		ctx.addIssue({
			code: "custom",
			message: "resource must not contain a fragment",
		});
		return;
	}
	if (DANGEROUS_SCHEMES.includes(new URL(val).protocol)) {
		ctx.addIssue({
			code: "custom",
			message: "resource cannot use javascript:, data:, or vbscript: scheme",
		});
	}
});

/**
 * Runtime schema for OAuthAuthorizationQuery.
 * Uses passthrough to tolerate fields added by future extensions (PAR, FPA, etc.)
 */
export const authorizationQuerySchema = z
	.object({
		response_type: z
			.string()
			.pipe(z.enum(["code"]))
			.optional(),
		request_uri: z.string().optional(),
		redirect_uri: SafeUrlSchema.optional(),
		scope: z.string().optional(),
		state: z.string().optional(),
		client_id: z.string(),
		prompt: authorizationPromptSchema.optional(),
		display: z.string().optional(),
		ui_locales: z.string().optional(),
		max_age: z.coerce.number().int().nonnegative().optional(),
		acr_values: z.string().optional(),
		login_hint: z.string().optional(),
		id_token_hint: z.string().optional(),
		code_challenge: z.string().optional(),
		code_challenge_method: z
			.string()
			.pipe(z.enum(["S256"]))
			.optional(),
		nonce: z.string().optional(),
		resource: z
			.union([ResourceUriSchema, z.array(ResourceUriSchema).min(1)])
			.optional(),
	})
	.passthrough();

const storedAuthorizationQuerySchema = authorizationQuerySchema.extend({
	redirect_uri: SafeUrlSchema,
});

/**
 * Runtime schema for the authorization code verification value.
 * Validates structure on deserialization from the JSON blob stored in the DB.
 * Uses passthrough so future fields (e.g. from authorization challenge) don't break parsing.
 */
export const verificationValueSchema = z
	.object({
		type: z.literal("authorization_code"),
		query: storedAuthorizationQuerySchema,
		sessionId: z.string(),
		userId: z.string(),
		referenceId: z.string().optional(),
		authTime: z.number().optional(),
		acr: z.string().optional(),
		amr: z.array(z.string()).optional(),
		resource: z.array(z.string()).optional(),
	})
	.passthrough();
