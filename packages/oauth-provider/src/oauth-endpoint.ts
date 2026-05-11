import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "better-auth/api";
import type {
	EndpointContext,
	EndpointOptions,
	StrictEndpoint,
} from "better-call";
import { APIError } from "better-call";
import * as z from "zod";

/**
 * Canonical OAuth 2.0 / OpenID Connect error codes. The union is the single
 * vocabulary for every error-emitting surface in this plugin: token, authorize,
 * revoke, introspect, register, userinfo, logout, consent, and the redirect
 * error channel. Entries are grouped by source RFC so the declaration doubles
 * as a specification map.
 *
 * The trailing `(string & {})` keeps the type open for product-specific codes
 * (e.g. `"invalid_verification"`, `"invalid_user"`) while preserving editor
 * autocomplete for the listed standard codes. Prefer a standard code whenever
 * one applies; fall back to a custom string only for states no RFC covers.
 */
export type OAuthErrorCode =
	// RFC 6749 §4.1.2.1, §5.2 core authorization + token errors
	| "invalid_request"
	| "invalid_client"
	| "invalid_grant"
	| "unauthorized_client"
	| "unsupported_grant_type"
	| "unsupported_response_type"
	| "invalid_scope"
	| "access_denied"
	| "server_error"
	| "temporarily_unavailable"
	// RFC 6750 §3.1 bearer token / RFC 7662 introspection
	| "invalid_token"
	// RFC 7009 §2.2.1 token revocation
	| "unsupported_token_type"
	// RFC 7591 §3.2.2 dynamic client registration
	| "invalid_redirect_uri"
	| "invalid_client_metadata"
	| "invalid_software_statement"
	| "unapproved_software_statement"
	// RFC 8707 §2 resource indicators
	| "invalid_target"
	// RFC 9101 §6 JWT-secured authorization requests (JAR)
	| "invalid_request_object"
	// OIDC Core 1.0 §3.1.2.6 authorization error response
	| "login_required"
	| "consent_required"
	| "interaction_required"
	| "account_selection_required"
	| "invalid_request_uri"
	| "request_not_supported"
	| "request_uri_not_supported"
	| "registration_not_supported"
	| (string & {});

export type OAuthFieldErrorCodeMap = {
	missing?: OAuthErrorCode;
	invalid?: OAuthErrorCode;
};

export type OAuthFieldErrorCode = OAuthErrorCode | OAuthFieldErrorCodeMap;

export interface OAuthEndpointErrorResult {
	error: OAuthErrorCode;
	error_description: string;
}

export interface OAuthEndpointRedirectContext<Ctx = unknown> {
	error: OAuthErrorCode;
	error_description: string;
	ctx: Ctx;
}

export type OAuthRedirectOnError<Ctx = any> = (
	result: OAuthEndpointRedirectContext<Ctx>,
) => unknown;

type ValidationErrorHookArgs = {
	message: string;
	issues: readonly z.core.$ZodIssue[];
};

type ValidationErrorHook = (args: ValidationErrorHookArgs) => unknown;

export interface OAuthEndpointExtras {
	/**
	 * Invoked when validation fails. Presence switches delivery from a JSON
	 * `APIError` envelope to this callback, which receives the request
	 * context so it can compute an RP redirect URL from already-parsed query
	 * params.
	 */
	redirectOnError?: OAuthRedirectOnError;
	/**
	 * Forwarded to `better-call` and awaited before the RFC envelope is
	 * synthesized, so callers can observe or transform issues.
	 */
	onValidationError?: ValidationErrorHook;
	/**
	 * First-path-segment → RFC code mapping. Nested failures like
	 * `jwks.keys[0].n` collapse to `jwks`; lift a nested schema to a
	 * top-level field when per-sub-field codes are required.
	 */
	errorCodesByField?: Record<string, OAuthFieldErrorCode>;
	/**
	 * RFC code returned when no `errorCodesByField` entry matches or the failure is
	 * structurally malformed (wrong type, duplicated params, bad format,
	 * failed refinement).
	 * @default "invalid_request"
	 */
	defaultError?: OAuthErrorCode;
}

/**
 * Wraps `createAuthEndpoint` so zod schemas stay the single source of truth
 * for body/query shape while validation failures serialize as the RFC 6749
 * §5.2 error envelope `{ error, error_description }`.
 *
 * A failing issue is routed by its first path segment via `errorCodesByField`:
 * - missing required (`invalid_type` + "received undefined") → `.missing`
 * - unsupported value (`invalid_value`) → `.invalid`
 * - anything else (wrong type, duplicated params, bad format) → `defaultError`
 *
 * For enum fields that need to distinguish missing from unsupported, compose
 * as `z.string().pipe(z.enum([...]))` so duplicated params fail the outer
 * `z.string()` as `invalid_type` instead of masquerading as an unsupported
 * enum value.
 */
export function createOAuthEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	path: Path,
	options: Options & OAuthEndpointExtras,
	handler: (ctx: EndpointContext<Path, Options, AuthContext>) => Promise<R>,
): StrictEndpoint<Path, Options, R> {
	const {
		redirectOnError,
		onValidationError: userHook,
		errorCodesByField,
		defaultError = "invalid_request",
		...rest
	} = options;

	if (!redirectOnError) {
		const forwarded = {
			...rest,
			onValidationError: async (args: ValidationErrorHookArgs) => {
				if (userHook) await userHook(args);
				throw new APIError("BAD_REQUEST", {
					...mapIssuesToOAuthError(
						args.issues,
						errorCodesByField,
						defaultError,
					),
				});
			},
		} as unknown as Options;
		return createAuthEndpoint(path, forwarded, handler);
	}

	// Bind so the non-null narrowing from the guard above survives into `validateSlot`;
	// TS drops narrowing when crossing into a nested function declaration.
	const redirect = redirectOnError;
	const {
		body: bodySchema,
		query: querySchema,
		...forwarded
	} = rest as typeof rest & {
		body?: z.ZodTypeAny;
		query?: z.ZodTypeAny;
	};

	async function validateSlot(
		ctx: EndpointContext<Path, Options, AuthContext>,
		slot: "body" | "query",
		schema: z.ZodTypeAny | undefined,
	): Promise<{ ok: true } | { ok: false; response: unknown }> {
		if (!schema) return { ok: true };
		const result = await schema.safeParseAsync(ctx[slot] ?? {});
		if (result.success) {
			(ctx as Record<string, unknown>)[slot] = result.data;
			return { ok: true };
		}
		if (userHook) {
			await userHook({
				message: result.error.message,
				issues: result.error.issues,
			});
		}
		return {
			ok: false,
			response: redirect({
				...mapIssuesToOAuthError(
					result.error.issues,
					errorCodesByField,
					defaultError,
				),
				ctx,
			}),
		};
	}

	return createAuthEndpoint(
		path,
		forwarded as unknown as Options,
		async (ctx) => {
			const body = await validateSlot(ctx, "body", bodySchema);
			if (!body.ok) return body.response;
			const query = await validateSlot(ctx, "query", querySchema);
			if (!query.ok) return query.response;
			return handler(ctx);
		},
	) as StrictEndpoint<Path, Options, R>;
}

export function mapIssuesToOAuthError(
	issues: readonly z.core.$ZodIssue[],
	errorCodesByField?: Record<string, OAuthFieldErrorCode>,
	defaultError: OAuthErrorCode = "invalid_request",
): OAuthEndpointErrorResult {
	const issue = issues[0];
	if (!issue) {
		return {
			error: defaultError,
			error_description: "Invalid request.",
		};
	}

	const first = issue.path?.[0];
	const fieldKey = typeof first === "string" ? first : undefined;
	const mapping = fieldKey ? errorCodesByField?.[fieldKey] : undefined;
	const field = issue.path?.length ? z.core.toDotPath(issue.path) : "";

	return {
		error: resolveErrorCode(issue, mapping, defaultError),
		error_description: describeIssue(issue, field),
	};
}

function resolveErrorCode(
	issue: z.core.$ZodIssue,
	mapping: OAuthFieldErrorCode | undefined,
	defaultError: OAuthErrorCode,
): OAuthErrorCode {
	if (typeof mapping === "string") return mapping;

	if (isMissingValueIssue(issue)) {
		return mapping?.missing ?? defaultError;
	}
	if (issue.code === "invalid_value") {
		return mapping?.invalid ?? defaultError;
	}
	return defaultError;
}

/**
 * Returns `true` for issues that represent an absent required value. Zod v4
 * strips `input` from published issues, so the signal is the `invalid_type`
 * code combined with a message suffix of "received undefined". The suffix is
 * pinned by a regression test so a zod rephrase fails the test instead of
 * silently reclassifying missing fields.
 *
 * Assumes the default zod error map. Consumers that install a localized map
 * via `z.setErrorMap()` will break this check, collapsing missing-field
 * failures to `defaultError`.
 */
export function isMissingValueIssue(issue: z.core.$ZodIssue): boolean {
	return (
		issue.code === "invalid_type" &&
		issue.message.endsWith("received undefined")
	);
}

function describeIssue(issue: z.core.$ZodIssue, field: string): string {
	if (!field) return issue.message;

	if (issue.code === "invalid_type") {
		if (issue.message.endsWith("received undefined")) {
			return `${field} is required`;
		}
		if (issue.message.endsWith("received array")) {
			return `${field} must not appear more than once`;
		}
		const expected = (issue as { expected?: string }).expected ?? "valid value";
		return `${field} must be a ${expected}`;
	}

	if (issue.code === "invalid_value") {
		const values = (issue as { values?: readonly unknown[] }).values;
		if (Array.isArray(values) && values.length > 0) {
			return `${field} must be one of: ${values.join(", ")}`;
		}
	}

	return `${field}: ${issue.message}`;
}
