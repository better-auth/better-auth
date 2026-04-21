/**
 * Translates Better Auth's framework-level Zod validation envelope
 * (`{"message":"...","code":"VALIDATION_ERROR"}`) into the RFC-compliant
 * error format expected by each OAuth 2.1 endpoint.
 *
 * Why this exists
 * ---------------
 * `createAuthEndpoint` validates request inputs via Zod before calling the
 * endpoint handler. When validation fails, it throws an `APIError` with
 * `code: VALIDATION_ERROR`, which is serialized as the generic Better Auth
 * envelope. OAuth clients, however, expect the envelopes specified by the
 * OAuth 2.1 family of RFCs:
 *
 *  - `/oauth2/token`        RFC 6749 §5.2      JSON `{error, error_description}`
 *  - `/oauth2/authorize`    RFC 6749 §4.1.2.1  302 redirect, error in query
 *  - `/oauth2/revoke`       RFC 7009 §2.2      JSON `{error, error_description}`
 *  - `/oauth2/introspect`   RFC 7662 §2.3      JSON `{error, error_description}`
 *  - `/oauth2/register`     RFC 7591 §3.2.2   JSON `{error, error_description}`
 *
 * OAuth 2.1 additionally requires `Cache-Control: no-store` on any response
 * containing token-adjacent data; we apply it on every translated body.
 *
 * This module is the single point where that translation happens. It is
 * deliberately a pure function so it can be unit-tested in isolation and
 * plugged into the plugin's `hooks.after` handler.
 *
 * @see https://github.com/better-auth/better-auth/issues/9250
 */

export type OAuthEndpointKind =
	| "token"
	| "authorize"
	| "revoke"
	| "introspect"
	| "register";

export const OAUTH_PATH_MAP: Record<string, OAuthEndpointKind> = {
	"/oauth2/token": "token",
	"/oauth2/authorize": "authorize",
	"/oauth2/revoke": "revoke",
	"/oauth2/introspect": "introspect",
	"/oauth2/register": "register",
};

interface ValidationBody {
	message?: string;
	code?: string;
}

/**
 * Zod v4 issue codes we care about. `invalid_type` with `received: undefined`
 * is how a missing required field surfaces; `invalid_value` / `invalid_format`
 * indicate the value was present but unsupported.
 */
interface ZodIssueLike {
	code?: string;
	received?: unknown;
	path?: Array<string | number>;
}

/**
 * Parses `[body.field_name]` / `[query.field_name]` prefix that better-call
 * emits on Zod failures. Returns the bare field name, or null when we can't
 * tell.
 */
function extractField(message: string | undefined): string | null {
	if (!message) return null;
	const match = message.match(/^\[(?:body|query)\.([a-zA-Z0-9_]+)/);
	return match ? (match[1] ?? null) : null;
}

/**
 * RFC 6749 §5.2 distinguishes *missing* required parameters (→
 * `invalid_request`) from *unsupported values* (→ `unsupported_grant_type`
 * / `unsupported_response_type`). Zod v4 emits the same "Invalid option"
 * text whether a required enum is absent or has a non-enum value, so we
 * rely on the structured `issues` array when available and fall back to
 * string heuristics otherwise.
 */
function isMissingField(
	message: string | undefined,
	issues: ZodIssueLike[] | undefined,
	field: string | null,
): boolean {
	if (issues && field) {
		const match = issues.find(
			(i) => Array.isArray(i.path) && i.path[i.path.length - 1] === field,
		);
		if (match) {
			if (match.code === "invalid_type" && match.received === "undefined") {
				return true;
			}
			// Any other issue means the value was present but unsupported.
			return false;
		}
	}
	if (!message) return false;
	if (/\bRequired\b/i.test(message)) return true;
	if (/received undefined/i.test(message)) return true;
	return false;
}

/**
 * Token endpoint (RFC 6749 §5.2). Only `grant_type` and `scope` have
 * dedicated error codes for *unsupported values*; missing fields and
 * everything else are `invalid_request`.
 */
function classifyTokenField(field: string | null, missing: boolean): string {
	if (missing) return "invalid_request";
	switch (field) {
		case "grant_type":
			return "unsupported_grant_type";
		case "scope":
			return "invalid_scope";
		default:
			return "invalid_request";
	}
}

/**
 * Authorization endpoint (RFC 6749 §4.1.2.1). Same missing-vs-unsupported
 * distinction as the token endpoint.
 */
function classifyAuthorizeField(
	field: string | null,
	missing: boolean,
): string {
	if (missing) return "invalid_request";
	switch (field) {
		case "response_type":
			return "unsupported_response_type";
		case "scope":
			return "invalid_scope";
		default:
			return "invalid_request";
	}
}

/**
 * Dynamic client registration (RFC 7591 §3.2.2). Redirect URI problems get
 * the dedicated code; all other field errors collapse to
 * `invalid_client_metadata`.
 */
function classifyRegisterField(field: string | null): string {
	switch (field) {
		case "redirect_uris":
		case "post_logout_redirect_uris":
			return "invalid_redirect_uri";
		default:
			return "invalid_client_metadata";
	}
}

function describeError(
	code: string,
	field: string | null,
	originalMessage: string | undefined,
): string {
	if (originalMessage) return originalMessage;
	if (field) {
		return `Request is missing or has an invalid value for '${field}'`;
	}
	return `OAuth request failed with error ${code}`;
}

const NO_STORE_HEADERS: HeadersInit = {
	"content-type": "application/json;charset=UTF-8",
	"cache-control": "no-store",
	pragma: "no-cache",
};

function jsonError(
	status: number,
	error: string,
	description: string,
): Response {
	return new Response(
		JSON.stringify({ error, error_description: description }),
		{ status, headers: NO_STORE_HEADERS },
	);
}

/**
 * Builds a 302 redirect that delivers the error to the client via the
 * authorization endpoint's standard query-parameter channel (RFC 6749
 * §4.1.2.1). Uses the request's `redirect_uri` and `state` query params
 * when present.
 *
 * Security note: at Zod-validation time the client has NOT been resolved,
 * so the `redirect_uri` could point anywhere. We therefore only honor the
 * request's `redirect_uri` when it is an absolute URL with a safe scheme.
 * Otherwise we fall back to the authorization server's default error page
 * at `/api/auth/error`, matching the behavior of the handler-level error
 * paths in authorize.ts.
 */
function authorizeRedirect(
	request: Request | undefined,
	baseUrl: string | undefined,
	error: string,
	description: string,
): Response {
	let target: URL | null = null;
	let state: string | null = null;
	if (request) {
		try {
			const reqUrl = new URL(request.url);
			state = reqUrl.searchParams.get("state");
			const redirectUri = reqUrl.searchParams.get("redirect_uri");
			if (redirectUri) {
				try {
					const parsed = new URL(redirectUri);
					if (parsed.protocol === "https:" || parsed.protocol === "http:") {
						target = parsed;
					}
				} catch {
					// fall through to error page
				}
			}
		} catch {
			// fall through
		}
	}

	if (!target) {
		const root = baseUrl ?? "";
		target = new URL(`${root}/api/auth/error`);
	}

	target.searchParams.set("error", error);
	target.searchParams.set("error_description", description);
	if (state) target.searchParams.set("state", state);

	return new Response(null, {
		status: 302,
		headers: {
			location: target.toString(),
			"cache-control": "no-store",
		},
	});
}

/**
 * Main entry point. Returns a new Response in RFC-compliant format, or
 * `null` when the input response is not an OAuth validation error and
 * should pass through unchanged.
 *
 * When callers have access to the Zod `issues` array (e.g. directly on an
 * `APIError` instance), passing it enables structured missing-vs-unsupported
 * classification; otherwise the translator falls back to string parsing
 * of the error message.
 */
export async function translateOAuthValidationError(args: {
	path: string;
	response: Response;
	request?: Request;
	baseUrl?: string;
	issues?: ZodIssueLike[];
}): Promise<Response | null> {
	const { path, response, request, baseUrl, issues } = args;

	const kind = OAUTH_PATH_MAP[path];
	if (!kind) return null;

	// Only translate Better Auth's framework validation envelope. Handler-
	// level OAuth errors (already `{error, error_description}`) pass through.
	if (response.status !== 400) return null;
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) return null;

	let body: ValidationBody;
	try {
		body = (await response.clone().json()) as ValidationBody;
	} catch {
		return null;
	}
	if (body.code !== "VALIDATION_ERROR") return null;

	const field = extractField(body.message);
	const missing = isMissingField(body.message, issues, field);

	if (kind === "authorize") {
		const code = classifyAuthorizeField(field, missing);
		const description = describeError(code, field, body.message);
		return authorizeRedirect(request, baseUrl, code, description);
	}

	let code: string;
	switch (kind) {
		case "token":
		case "revoke":
		case "introspect":
			code = classifyTokenField(field, missing);
			break;
		case "register":
			code = classifyRegisterField(field);
			break;
	}

	return jsonError(400, code, describeError(code, field, body.message));
}
