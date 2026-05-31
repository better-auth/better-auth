import * as z from "zod";

/**
 * Runtime schema for OAuthAuthorizationQuery.
 * Uses passthrough to tolerate fields added by future extensions (PAR, FPA, etc.)
 */
const oauthAuthorizationQuerySchema = z
	.object({
		response_type: z.literal("code").optional(),
		request_uri: z.string().optional(),
		redirect_uri: z.string(),
		scope: z.string().optional(),
		state: z.string().optional(),
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
 * Re-exported from `@better-auth/core` so every OAuth provider plugin shares one
 * redirect-URI scheme policy. See `@better-auth/core/utils/redirect-uri`.
 */
export { SafeUrlSchema } from "@better-auth/core/utils/redirect-uri";
