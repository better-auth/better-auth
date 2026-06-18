// Validation for Client ID Metadata Documents.
// Implements draft-ietf-oauth-client-id-metadata-document §3 and §4.1.
import {
	isLoopbackHost,
	isPublicRoutableHost,
} from "@better-auth/core/utils/host";

const DOT_SEGMENT_RE = /\/(?:\.|%2e)(?:\.|%2e)?(?:\/|$|#|\?)/i;

const PROHIBITED_FIELDS = new Set([
	"client_secret",
	"client_secret_expires_at",
]);

const SYMMETRIC_AUTH_METHODS = new Set([
	"client_secret_post",
	"client_secret_basic",
	"client_secret_jwt",
]);

const ALLOWED_GRANT_TYPES = new Set(["authorization_code", "refresh_token"]);

const ALLOWED_RESPONSE_TYPES = new Set(["code"]);

export interface ClientIdMetadataDocumentResult {
	valid: boolean;
	error?: string;
	warnings?: string[];
}

export interface ClientIdUrlOptions {
	/**
	 * Permit loopback `client_id` URLs (`localhost`, `127.0.0.0/8`, `::1`,
	 * `*.localhost`) and plain HTTP for them. Off by default.
	 */
	allowLoopback?: boolean;
}

/**
 * Detect a URL-formatted client_id (Client ID Metadata Document pattern).
 *
 * HTTPS URLs always match; the SSRF and loopback policy is enforced in
 * {@link validateClientIdUrl}. Plain HTTP matches only loopback hosts, and
 * only when `allowLoopback` is set.
 */
export function isUrlClientId(
	clientId: string,
	options?: ClientIdUrlOptions,
): boolean {
	if (clientId.startsWith("https://")) {
		return true;
	}
	if (!clientId.startsWith("http://")) {
		return false;
	}
	if (!options?.allowLoopback) {
		return false;
	}
	try {
		return isLoopbackHost(new URL(clientId).hostname);
	} catch {
		return false;
	}
}

/**
 * Validate a client_id URL per IETF draft §3.
 * Returns null on success, an error string on failure.
 *
 * Loopback hosts are rejected unless `allowLoopback` is set; every other
 * non-public host (private, link-local, cloud-metadata, IPv6 tunnels) is
 * rejected.
 */
export function validateClientIdUrl(
	url: string,
	options?: ClientIdUrlOptions,
): string | null {
	// §3: check the raw URL for dot segments before the URL class normalizes them
	if (DOT_SEGMENT_RE.test(url)) {
		return "client_id URL MUST NOT contain dot segments";
	}

	// §3: MUST NOT contain fragments
	if (url.includes("#")) {
		return "client_id URL MUST NOT contain a fragment";
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return "client_id is not a valid URL";
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return "client_id URL must use HTTPS";
	}

	// §3: MUST NOT contain credentials
	if (parsed.username || parsed.password) {
		return "client_id URL MUST NOT contain credentials";
	}

	// §3: MUST contain a path (not just scheme + authority)
	if (parsed.pathname === "/" || parsed.pathname === "") {
		return "client_id URL MUST contain a path component";
	}

	if (isLoopbackHost(parsed.hostname)) {
		if (!options?.allowLoopback) {
			return "client_id URL must not target a loopback address (set allowLoopback to enable local development)";
		}
		return null;
	}

	if (parsed.protocol !== "https:") {
		return "client_id URL must use HTTPS (HTTP is allowed only for loopback in development)";
	}
	if (!isPublicRoutableHost(parsed.hostname)) {
		return "client_id URL must not resolve to a private or reserved address";
	}

	return null;
}

/** Warning: §3 SHOULD NOT have a query string. */
function checkUrlQueryWarning(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.search) {
			return "client_id URL SHOULD NOT contain a query string (§3)";
		}
	} catch {
		// URL validation handled by validateClientIdUrl
	}
	return null;
}

function isAbsoluteHttpUri(uri: string): boolean {
	try {
		const parsed = new URL(uri);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Validate a fetched Client ID Metadata Document per §4.1.
 *
 * @param fetchUrl - The URL the document was fetched from.
 * @param raw - The parsed JSON body of the response.
 * @param originBoundFields - Fields whose URL values must share the same origin as the `client_id` URL.
 */
export function validateCimdMetadata(
	fetchUrl: string,
	raw: unknown,
	originBoundFields?: string[],
): ClientIdMetadataDocumentResult {
	if (!raw || typeof raw !== "object") {
		return { valid: false, error: "metadata document is not a JSON object" };
	}

	const doc = raw as Record<string, unknown>;
	const warnings: string[] = [];

	// §4.1: client_id MUST equal the fetch URL (simple string comparison)
	if (doc.client_id !== fetchUrl) {
		return {
			valid: false,
			error: `client_id "${String(doc.client_id)}" does not match the metadata document URL`,
		};
	}

	// §4.1: prohibited fields MUST NOT be present
	for (const field of PROHIBITED_FIELDS) {
		if (field in doc) {
			return {
				valid: false,
				error: `metadata document MUST NOT contain "${field}"`,
			};
		}
	}

	// §4.1: only non-secret auth methods are allowed
	const ALLOWED_AUTH_METHODS = new Set(["none", "private_key_jwt"]);
	if (
		doc.token_endpoint_auth_method !== undefined &&
		typeof doc.token_endpoint_auth_method !== "string"
	) {
		return {
			valid: false,
			error: "token_endpoint_auth_method must be a string",
		};
	}
	if (typeof doc.token_endpoint_auth_method === "string") {
		if (SYMMETRIC_AUTH_METHODS.has(doc.token_endpoint_auth_method)) {
			return {
				valid: false,
				error: `symmetric auth method "${doc.token_endpoint_auth_method}" is prohibited for Client ID Metadata Document clients`,
			};
		}
		if (!ALLOWED_AUTH_METHODS.has(doc.token_endpoint_auth_method)) {
			return {
				valid: false,
				error:
					'token_endpoint_auth_method must be "none" or "private_key_jwt" for Client ID Metadata Document clients',
			};
		}
		if (
			doc.token_endpoint_auth_method === "private_key_jwt" &&
			!doc.jwks &&
			!doc.jwks_uri
		) {
			return {
				valid: false,
				error:
					"private_key_jwt requires either jwks or jwks_uri in the metadata document",
			};
		}
	}

	// redirect_uris: required, non-empty array of absolute HTTP(S) URIs
	if (
		!Array.isArray(doc.redirect_uris) ||
		doc.redirect_uris.length === 0 ||
		!doc.redirect_uris.every(
			(uri: unknown) => typeof uri === "string" && isAbsoluteHttpUri(uri),
		)
	) {
		return {
			valid: false,
			error: "redirect_uris must be a non-empty array of absolute HTTP(S) URIs",
		};
	}

	// grant_types: must be a subset of allowed types
	if (
		doc.grant_types !== undefined &&
		!(
			Array.isArray(doc.grant_types) &&
			doc.grant_types.every(
				(g: unknown) => typeof g === "string" && ALLOWED_GRANT_TYPES.has(g),
			)
		)
	) {
		return {
			valid: false,
			error: `grant_types must be a subset of [${[...ALLOWED_GRANT_TYPES].map((g) => `"${g}"`).join(", ")}]`,
		};
	}

	// response_types: must be a subset of allowed types
	if (
		doc.response_types !== undefined &&
		!(
			Array.isArray(doc.response_types) &&
			doc.response_types.every(
				(r: unknown) => typeof r === "string" && ALLOWED_RESPONSE_TYPES.has(r),
			)
		)
	) {
		return {
			valid: false,
			error: 'response_types must be a subset of ["code"]',
		};
	}

	// Validate client_uri and logo_uri for SSRF if present
	for (const field of ["client_uri", "logo_uri"] as const) {
		if (doc[field] !== undefined && typeof doc[field] !== "string") {
			return { valid: false, error: `${field} must be a string` };
		}
		if (typeof doc[field] === "string") {
			try {
				const parsed = new URL(doc[field]);
				if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
					return { valid: false, error: `${field} must use HTTP(S)` };
				}
				if (!isPublicRoutableHost(parsed.hostname)) {
					return {
						valid: false,
						error: `${field} must not point to a private or reserved address`,
					};
				}
			} catch {
				return { valid: false, error: `${field} is not a valid URL` };
			}
		}
	}

	// Origin-bound fields: values must share the same origin as the client_id URL
	const fieldsToCheck = originBoundFields ?? [
		"redirect_uris",
		"post_logout_redirect_uris",
		"client_uri",
	];

	let clientIdOrigin: string;
	try {
		clientIdOrigin = new URL(fetchUrl).origin;
	} catch {
		return { valid: false, error: "client_id is not a valid URL" };
	}

	for (const key of fieldsToCheck) {
		const value = doc[key];
		if (value === undefined) {
			continue;
		}
		let values: string[];
		if (typeof value === "string") {
			values = [value];
		} else if (Array.isArray(value)) {
			if (!value.every((v): v is string => typeof v === "string")) {
				return {
					valid: false,
					error: `${key} must be a string or an array of strings`,
				};
			}
			values = value;
		} else {
			return {
				valid: false,
				error: `${key} must be a string or an array of strings`,
			};
		}

		for (const val of values) {
			let uri: URL;
			try {
				uri = new URL(val);
			} catch {
				return {
					valid: false,
					error: `${key} contains an invalid URL: "${val}"`,
				};
			}

			if (uri.protocol !== "https:" && uri.protocol !== "http:") {
				return {
					valid: false,
					error: `all values for ${key} must use HTTP(S)`,
				};
			}

			// Loopback redirect URIs are allowed for local/native app flows
			// (RFC 8252); this exception applies only to redirect URI fields.
			const isRedirectField =
				key === "redirect_uris" || key === "post_logout_redirect_uris";
			const localhostAllowed = isRedirectField && isLoopbackHost(uri.hostname);
			if (uri.origin !== clientIdOrigin && !localhostAllowed) {
				return {
					valid: false,
					error: `${key} value "${val}" must have the same origin as client_id (${clientIdOrigin})`,
				};
			}
		}
	}

	// §3: SHOULD NOT have a query string
	const queryWarning = checkUrlQueryWarning(fetchUrl);
	if (queryWarning) {
		warnings.push(queryWarning);
	}

	return {
		valid: true,
		...(warnings.length > 0 ? { warnings } : {}),
	};
}
