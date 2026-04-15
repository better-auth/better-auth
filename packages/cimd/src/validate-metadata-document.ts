// Pure validation for Client ID Metadata Documents.
// Implements draft-ietf-oauth-client-id-metadata-document §3 and §4.1.
// Zero side-effect imports: testable without building the monorepo.

const DOT_SEGMENT_RE = /\/\.\.?(?:\/|$|#|\?)/;

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

/** Hostnames that are considered "localhost" for development flows. */
export function isLocalhost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "::1" ||
		hostname.endsWith(".localhost")
	);
}

/**
 * Check whether a dotted-decimal IPv4 address is private, reserved, or
 * otherwise non-routable for a public SSRF target. Covers the subset of
 * RFC 6890 special-purpose ranges that an adversarial `client_id` URL
 * could point at to reach internal infrastructure or disrupt fetches.
 */
function isPrivateIpv4(host: string): boolean {
	const parts = host.split(".");
	if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) {
		return false;
	}
	const a = Number(parts[0]);
	const b = Number(parts[1]);
	const c = Number(parts[2]);
	return (
		// Loopback (127.0.0.0/8), private (RFC 1918), "this network"
		// (0.0.0.0/8), link-local (169.254.0.0/16), shared address space
		// (100.64.0.0/10).
		a === 127 ||
		a === 10 ||
		a === 0 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 169 && b === 254) ||
		(a === 100 && b >= 64 && b <= 127) ||
		// Benchmarking (RFC 2544): 198.18.0.0/15.
		(a === 198 && (b === 18 || b === 19)) ||
		// Documentation (RFC 5737).
		(a === 192 && b === 0 && c === 2) ||
		(a === 198 && b === 51 && c === 100) ||
		(a === 203 && b === 0 && c === 113) ||
		// 6to4 anycast relay (RFC 7526 deprecated): 192.88.99.0/24.
		(a === 192 && b === 88 && c === 99) ||
		// Multicast (RFC 5771): 224.0.0.0/4.
		(a >= 224 && a <= 239) ||
		// Reserved / future use (RFC 1112 + broadcast 255.255.255.255):
		// 240.0.0.0/4.
		a >= 240
	);
}

// Matches ::ffff:a.b.c.d (dotted-decimal, as written by humans)
const V4_MAPPED_DOTTED_RE =
	/^(?:0{0,4}:){0,4}:?(?:0{0,4}:)?ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

// Matches hex-pair form (e.g. ::ffff:a9fe:a9fe), as normalized by the URL parser
const V4_MAPPED_HEX_RE =
	/^(?:0{0,4}:){0,4}:?(?:0{0,4}:)?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

/**
 * Convert two hex groups from an IPv4-mapped IPv6 address to dotted-decimal IPv4.
 * e.g. "a9fe" "a9fe" -> "169.254.169.254"
 */
function hexGroupsToIpv4(hi: string, lo: string): string {
	const h = Number.parseInt(hi, 16);
	const l = Number.parseInt(lo, 16);
	return `${(h >> 8) & 0xff}.${h & 0xff}.${(l >> 8) & 0xff}.${l & 0xff}`;
}

/**
 * Check whether a hostname is private/reserved per RFC 6890.
 *
 * Handles bracketed IPv6 (as returned by URL.hostname), IPv4-mapped
 * IPv6 in both dotted-decimal and hex-normalized forms, and cloud
 * metadata hostnames. No DNS resolution, so it runs identically on
 * Node, Bun, Deno, and Workers.
 */
function isPrivateHost(hostname: string): boolean {
	const lower = hostname.toLowerCase();
	const host =
		lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;

	if (host === "::1") {
		return true;
	}
	if (isPrivateIpv4(host)) {
		return true;
	}
	if (host.includes(":")) {
		const dottedMatch = host.match(V4_MAPPED_DOTTED_RE);
		if (dottedMatch && isPrivateIpv4(dottedMatch[1]!)) {
			return true;
		}
		const hexMatch = host.match(V4_MAPPED_HEX_RE);
		if (hexMatch) {
			const ipv4 = hexGroupsToIpv4(hexMatch[1]!, hexMatch[2]!);
			if (isPrivateIpv4(ipv4)) {
				return true;
			}
		}
		// Link-local (fe80::/10)
		if (/^fe[89ab]/.test(host)) {
			return true;
		}
		// Unique-local (fc00::/7)
		if (host.startsWith("fc") || host.startsWith("fd")) {
			return true;
		}
	}
	if (host === "metadata.google.internal") {
		return true;
	}
	return false;
}

/**
 * Detect URL-formatted client_id (Client ID Metadata Document pattern).
 * HTTPS always accepted; HTTP accepted for localhost variants
 * (localhost, 127.0.0.1, [::1], *.localhost) for development.
 */
export function isUrlClientId(clientId: string): boolean {
	if (clientId.startsWith("https://")) {
		return true;
	}
	if (!clientId.startsWith("http://")) {
		return false;
	}
	try {
		return isLocalhost(new URL(clientId).hostname);
	} catch {
		return false;
	}
}

/**
 * Validate a client_id URL per IETF draft §3.
 * Returns null on success, error string on failure.
 */
export function validateClientIdUrl(url: string): string | null {
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

	if (parsed.protocol === "http:" && !isLocalhost(parsed.hostname)) {
		return "client_id URL must use HTTPS (HTTP allowed only for localhost)";
	}

	// §3: MUST NOT contain credentials
	if (parsed.username || parsed.password) {
		return "client_id URL MUST NOT contain credentials";
	}

	// §3: MUST contain a path (not just scheme + authority)
	if (parsed.pathname === "/" || parsed.pathname === "") {
		return "client_id URL MUST contain a path component";
	}

	// SSRF: block private/reserved hosts
	if (!isLocalhost(parsed.hostname) && isPrivateHost(parsed.hostname)) {
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
				if (!isLocalhost(parsed.hostname) && isPrivateHost(parsed.hostname)) {
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

			// Allow localhost redirect URIs for local/native app flows; the
			// localhost exception only applies to redirect URI fields, never
			// to client_uri or other origin-bound fields.
			const isRedirectField =
				key === "redirect_uris" || key === "post_logout_redirect_uris";
			const localhostAllowed = isRedirectField && isLocalhost(uri.hostname);
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
