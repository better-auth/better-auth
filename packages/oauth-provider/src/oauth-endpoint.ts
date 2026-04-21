import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "better-auth/api";
import type {
	EndpointContext,
	EndpointOptions,
	StrictEndpoint,
} from "better-call";
import { APIError } from "better-call";
import type * as z from "zod";

/**
 * RFC 6749 §5.2, 7009 §2.2.1, 7662 §2.3, 7591 §3.2.2 require OAuth error
 * responses in the shape `{ error, error_description }`. `createOAuthEndpoint`
 * wraps `createAuthEndpoint` so zod schemas stay the single source of truth
 * for body/query shape while validation failures serialize as the RFC envelope.
 *
 * A failing issue is routed using the field's entry in `fieldErrors`:
 *
 * - a missing required field (`invalid_type` with "received undefined") maps
 *   to `fieldErrors[name].missing` or `defaultError`.
 * - an unsupported value (`invalid_value`, e.g. unknown enum member) maps to
 *   `fieldErrors[name].invalid` or `defaultError`.
 * - any other failure (wrong type, duplicated query params materialized as
 *   arrays, invalid format, failed refinement, out-of-range scalar) maps to
 *   `defaultError`, so RFC 6749 §3.1 malformed requests surface as the
 *   endpoint's default error regardless of field.
 *
 * String-form `fieldErrors` entries apply to every failure on the field; use
 * the object form only when missing and unsupported need different codes.
 * For enum fields that need this distinction, compose as
 * `z.string().pipe(z.enum([...]))` so duplicated params fail the outer
 * `z.string()` as `invalid_type` rather than masquerading as an unsupported
 * enum value.
 *
 * Error delivery is either:
 * - `"json"` (default): installs an `onValidationError` hook that throws an
 *   `APIError` carrying the RFC envelope. The framework's generic throw never
 *   fires because this hook throws first.
 * - `"redirect"`: validates inside the handler wrapper so `redirectOnError`
 *   can reach the request context (e.g. to compute an RP redirect URL from
 *   already-parsed query params).
 */

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

export interface OAuthFieldErrorMap {
	/**
	 * RFC code when the field is absent (undefined input).
	 * @default defaultError
	 */
	missing?: OAuthErrorCode;
	/**
	 * RFC code when the field is present but holds an unsupported value
	 * (`invalid_value`, e.g. unknown enum member).
	 * @default defaultError
	 */
	invalid?: OAuthErrorCode;
}

export type OAuthFieldError = OAuthErrorCode | OAuthFieldErrorMap;

export type OAuthErrorDelivery = "json" | "redirect";

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
	issues: readonly z.ZodIssue[];
};

type ValidationErrorHook = (args: ValidationErrorHookArgs) => unknown;

export interface OAuthEndpointExtras {
	/**
	 * How to deliver validation errors.
	 * - `"json"`: throws `APIError` with the RFC envelope as body.
	 * - `"redirect"`: invokes `redirectOnError` (required when this is set).
	 * @default "json"
	 */
	errorDelivery?: OAuthErrorDelivery;
	/**
	 * Invoked by the wrapper when `errorDelivery === "redirect"` and validation
	 * fails. The return value becomes the endpoint response.
	 */
	redirectOnError?: OAuthRedirectOnError;
	/**
	 * First-path-segment → RFC code mapping. Use the string form when any
	 * failure on the field should emit the same RFC code, or the object form
	 * to distinguish missing from unsupported.
	 *
	 * Keys match only the first path segment: nested failures like
	 * `jwks.keys[0].n` collapse to `jwks`. Lift a nested schema to a
	 * top-level field when per-sub-field codes are required.
	 */
	fieldErrors?: Record<string, OAuthFieldError>;
	/**
	 * RFC code returned when no `fieldErrors` entry matches or the failure is
	 * structurally malformed (wrong type, duplicated params, invalid format,
	 * failed refinement).
	 * @default "invalid_request"
	 */
	defaultError?: OAuthErrorCode;
}

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
		errorDelivery = "json",
		redirectOnError,
		fieldErrors,
		defaultError = "invalid_request",
		...rest
	} = options;

	if (errorDelivery === "redirect" && !redirectOnError) {
		throw new Error(
			`createOAuthEndpoint(${path}): errorDelivery "redirect" requires redirectOnError`,
		);
	}
	if (errorDelivery !== "redirect" && redirectOnError) {
		throw new Error(
			`createOAuthEndpoint(${path}): redirectOnError requires errorDelivery "redirect"`,
		);
	}

	if (errorDelivery === "json") {
		const userHook = (rest as { onValidationError?: ValidationErrorHook })
			.onValidationError;
		const forwarded = {
			...rest,
			onValidationError: async (args: ValidationErrorHookArgs) => {
				if (userHook) await userHook(args);
				throw new APIError("BAD_REQUEST", {
					...mapIssuesToOAuthError(args.issues, fieldErrors, defaultError),
				});
			},
		} as unknown as Options;
		return createAuthEndpoint(path, forwarded, handler);
	}

	const userHook = (rest as { onValidationError?: ValidationErrorHook })
		.onValidationError;
	const {
		body: bodySchema,
		query: querySchema,
		onValidationError: _userHookForwarded,
		...forwarded
	} = rest as typeof rest & {
		body?: z.ZodTypeAny;
		query?: z.ZodTypeAny;
		onValidationError?: ValidationErrorHook;
	};

	return createAuthEndpoint(
		path,
		forwarded as unknown as Options,
		async (ctx) => {
			if (bodySchema) {
				const result = await bodySchema.safeParseAsync(ctx.body ?? {});
				if (!result.success) {
					if (userHook) {
						await userHook({
							message: result.error.message,
							issues: result.error.issues,
						});
					}
					return await redirectOnError!({
						...mapIssuesToOAuthError(
							result.error.issues,
							fieldErrors,
							defaultError,
						),
						ctx,
					});
				}
				(ctx as { body: unknown }).body = result.data;
			}
			if (querySchema) {
				const result = await querySchema.safeParseAsync(ctx.query ?? {});
				if (!result.success) {
					if (userHook) {
						await userHook({
							message: result.error.message,
							issues: result.error.issues,
						});
					}
					return await redirectOnError!({
						...mapIssuesToOAuthError(
							result.error.issues,
							fieldErrors,
							defaultError,
						),
						ctx,
					});
				}
				(ctx as { query: unknown }).query = result.data;
			}
			return handler(ctx);
		},
	) as StrictEndpoint<Path, Options, R>;
}

export function mapIssuesToOAuthError(
	issues: readonly z.ZodIssue[],
	fieldErrors?: Record<string, OAuthFieldError>,
	defaultError: OAuthErrorCode = "invalid_request",
): OAuthEndpointErrorResult {
	const issue = issues[0];
	if (!issue) {
		return {
			error: defaultError,
			error_description: "Invalid request.",
		};
	}

	const fieldName = firstPathSegment(issue);
	const mapping =
		typeof fieldName === "string" ? fieldErrors?.[fieldName] : undefined;

	return {
		error: resolveErrorCode(issue, mapping, defaultError),
		error_description: describeIssue(issue),
	};
}

function resolveErrorCode(
	issue: z.ZodIssue,
	mapping: OAuthFieldError | undefined,
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
export function isMissingValueIssue(issue: z.ZodIssue): boolean {
	return (
		issue.code === "invalid_type" &&
		issue.message.endsWith("received undefined")
	);
}

function firstPathSegment(issue: z.ZodIssue): string | undefined {
	const segment = issue.path?.[0];
	if (segment === undefined) return undefined;
	if (typeof segment === "string") return segment;
	if (typeof segment === "number") return String(segment);
	if (typeof segment === "object" && segment !== null && "key" in segment) {
		const key = (segment as { key: unknown }).key;
		return typeof key === "string" ? key : String(key);
	}
	return String(segment);
}

function describeIssue(issue: z.ZodIssue): string {
	const field = fieldPath(issue);
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

function fieldPath(issue: z.ZodIssue): string {
	if (!issue.path?.length) return "";
	return issue.path
		.map((segment) => {
			if (typeof segment === "string") return segment;
			if (typeof segment === "number") return String(segment);
			if (typeof segment === "object" && segment !== null && "key" in segment) {
				const key = (segment as { key: unknown }).key;
				return typeof key === "string" ? key : String(key);
			}
			return String(segment);
		})
		.join(".");
}
