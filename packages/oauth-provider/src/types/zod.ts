import { SafeUrlSchema } from "@better-auth/core/utils/redirect-uri";
import * as z from "zod";

/**
 * Re-exported from `@better-auth/core` so every OAuth provider plugin shares one
 * redirect-URI scheme policy. See `@better-auth/core/utils/redirect-uri`.
 */
export { SafeUrlSchema };

const DANGEROUS_SCHEMES = ["javascript:", "data:", "vbscript:"];

/**
 * Validates an RFC 8707 resource indicator. The value must be an absolute URI
 * with no fragment (RFC 8707 §2). Unlike a redirect URI it is not restricted to
 * HTTPS, because a resource server identifier may use any absolute URI scheme;
 * configured OAuth resources are the authoritative control over
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

const authorizationPromptTokenSchema = z.enum([
	"none",
	"consent",
	"login",
	"create",
	"select_account",
]);

const authorizationPromptSchema = z.string().superRefine((value, ctx) => {
	const promptTokens = value
		.split(" ")
		.map((token) => token.trim())
		.filter(Boolean);
	const promptSet = new Set<string>();
	if (!promptTokens.length) {
		ctx.addIssue({
			code: "custom",
			message: "prompt must include at least one value",
		});
		return;
	}
	for (const token of promptTokens) {
		const result = authorizationPromptTokenSchema.safeParse(token);
		if (!result.success) {
			ctx.addIssue({
				code: "custom",
				message: `unsupported prompt value: ${token}`,
			});
			continue;
		}
		promptSet.add(result.data);
	}
	if (promptSet.has("none") && promptSet.size > 1) {
		ctx.addIssue({
			code: "custom",
			message: "prompt=none cannot be combined with other prompt values",
		});
	}
});

const maxAgeSchema = z
	.union([z.number(), z.string().trim().min(1)])
	.transform((value, ctx) => {
		const maxAge = typeof value === "number" ? value : Number(value);
		if (!Number.isInteger(maxAge) || maxAge < 0) {
			ctx.addIssue({
				code: "custom",
				message: "max_age must be a non-negative integer",
			});
			return z.NEVER;
		}
		return maxAge;
	});

const dpopJktSchema = z
	.string()
	.regex(
		/^[A-Za-z0-9_-]{43}$/,
		"dpop_jkt must be a base64url-encoded SHA-256 JWK thumbprint",
	);

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
		request: z.string().optional(),
		request_uri: z.string().optional(),
		redirect_uri: SafeUrlSchema.optional(),
		scope: z.string().optional(),
		state: z.string().optional(),
		client_id: z.string(),
		prompt: authorizationPromptSchema.optional(),
		display: z.string().optional(),
		ui_locales: z.string().optional(),
		max_age: maxAgeSchema.optional(),
		acr_values: z.string().optional(),
		login_hint: z.string().optional(),
		id_token_hint: z.string().optional(),
		code_challenge: z.string().optional(),
		code_challenge_method: z
			.string()
			.pipe(z.enum(["S256"]))
			.optional(),
		nonce: z.string().optional(),
		dpop_jkt: dpopJktSchema.optional(),
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
		resource: z.array(z.string()).optional(),
	})
	.passthrough();

/**
 * Request body accepted at `POST /oauth2/register` (RFC 7591 §2 client
 * metadata). This is the single source of truth for the registration contract:
 * the endpoint validates against it and {@link ClientRegistrationRequest} is
 * inferred from it, so the type a `validateInitialAccessToken` callback receives
 * always matches what is actually validated. `grant_types` and
 * `token_endpoint_auth_method` are open strings because extensions can register
 * custom values. Server-assigned fields (`client_id`, `client_secret`, the
 * issued/expiry timestamps) and internal state (`disabled`, `reference_id`) are
 * never part of a registration request.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7591#section-2
 */
export const clientRegistrationRequestSchema = z.object({
	redirect_uris: z.array(SafeUrlSchema).min(1).optional(),
	scope: z.string().optional(),
	client_name: z.string().optional(),
	client_uri: z.string().optional(),
	logo_uri: z.string().optional(),
	contacts: z.array(z.string().min(1)).min(1).optional(),
	tos_uri: z.string().optional(),
	policy_uri: z.string().optional(),
	software_id: z.string().optional(),
	software_version: z.string().optional(),
	software_statement: z.string().optional(),
	post_logout_redirect_uris: z.array(SafeUrlSchema).min(1).optional(),
	backchannel_logout_uri: SafeUrlSchema.optional(),
	backchannel_logout_session_required: z.boolean().optional(),
	token_endpoint_auth_method: z.string().trim().min(1).optional(),
	jwks: z
		.union([
			z.array(z.record(z.string(), z.unknown())).min(1),
			z.object({
				keys: z.array(z.record(z.string(), z.unknown())).min(1),
			}),
		])
		.optional(),
	jwks_uri: z.string().optional(),
	grant_types: z.array(z.string().trim().min(1)).min(1).optional(),
	response_types: z.array(z.enum(["code"])).optional(),
	type: z.enum(["web", "native", "user-agent-based"]).optional(),
	subject_type: z.enum(["public", "pairwise"]).optional(),
	// RFC 9449 §5.2: client asks for DPoP-bound access tokens.
	dpop_bound_access_tokens: z.boolean().optional(),
	// RFC 7591 §2 extension: declare the RFC 8707 resource indicators this client
	// will request. Each must be a valid resource URI matching an existing
	// oauthResource row; the registration handler links them on success.
	resources: z.array(ResourceUriSchema).optional(),
	skip_consent: z
		.never({
			error: "skip_consent cannot be set during dynamic client registration",
		})
		.optional(),
});

/**
 * Client metadata as submitted in an RFC 7591 §2 registration request, inferred
 * from {@link clientRegistrationRequestSchema}. Every value is self-asserted by
 * the caller (RFC 7591 §5) and is the raw request before registration defaults
 * are applied, so a `validateInitialAccessToken` callback should treat it as
 * untrusted and not assume defaulted fields are present.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7591#section-2
 */
export type ClientRegistrationRequest = z.infer<
	typeof clientRegistrationRequestSchema
>;
