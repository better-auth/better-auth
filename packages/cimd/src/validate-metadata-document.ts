// Validation for Client ID Metadata Documents.
// Implements draft-ietf-oauth-client-id-metadata-document-02 §3 and §4.
import {
	isLoopbackHost,
	isPublicRoutableHost,
} from "@better-auth/core/utils/host";
import { isReverseDomainPrivateUseRedirectUri } from "@better-auth/core/utils/redirect-uri";
import type { OAuthClientMetadata } from "@better-auth/oauth-provider";
import { oauthClientMetadataSchema } from "@better-auth/oauth-provider";
import {
	isForbiddenCimdClientMetadataField,
	validatePublicClientJwks,
} from "@better-auth/oauth-provider/internal";
import type { CimdMetadataProfile } from "./types";

const DOT_SEGMENT_RE = /\/(?:\.|%2e)(?:\.|%2e)?(?:\/|$|#|\?)/i;

const SYMMETRIC_AUTH_METHODS = new Set([
	"client_secret_post",
	"client_secret_basic",
	"client_secret_jwt",
]);

export type CimdMetadataValidationResult =
	| {
			valid: true;
			metadata: OAuthClientMetadata;
			error?: never;
			warnings?: string[];
	  }
	| {
			valid: false;
			error: string;
			metadata?: never;
			warnings?: string[];
	  };

export interface CimdMetadataValidationOptions {
	originBoundFields?: readonly string[];
	metadataProfile?: CimdMetadataProfile;
}

/**
 * Detect a URL-formatted client_id (Client ID Metadata Document pattern).
 *
 * HTTPS URLs match. This is a routing predicate, not a security gate: it
 * performs no DNS resolution, so callers MUST also run
 * {@link validateClientIdUrl} (and a fetch-time policy) before fetching.
 */
export function isCimdClientIdUrlCandidate(clientId: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(clientId);
	} catch {
		return false;
	}
	return parsed.protocol === "https:";
}

/**
 * Validate a client_id URL per Client ID Metadata Document draft-02 §3.
 * Returns null on success, an error string on failure.
 *
 * Loopback and every other non-public host (private, link-local,
 * cloud-metadata, IPv6 tunnels) are rejected.
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

	if (parsed.protocol !== "https:") {
		return "client_id URL must use HTTPS";
	}

	const httpsAuthorityPrefix = /^https:\/\//i.exec(url);
	if (!httpsAuthorityPrefix || url.includes("\\")) {
		return "client_id URL MUST use an explicit HTTPS authority form";
	}
	const authorityAndSuffix = url.slice(httpsAuthorityPrefix[0].length);
	const firstPathOrSuffixDelimiter = authorityAndSuffix.search(/[/?#]/);
	if (firstPathOrSuffixDelimiter === 0) {
		return "client_id URL MUST use an explicit HTTPS authority form";
	}
	if (
		firstPathOrSuffixDelimiter < 0 ||
		authorityAndSuffix[firstPathOrSuffixDelimiter] !== "/"
	) {
		return "client_id URL MUST contain an explicit path component";
	}

	// §3: MUST NOT contain credentials
	if (parsed.username || parsed.password) {
		return "client_id URL MUST NOT contain credentials";
	}

	if (!isPublicRoutableHost(parsed.hostname)) {
		return "client_id URL must not target a private or reserved address";
	}

	return null;
}

function getClientIdUrlWarnings(url: string): string[] {
	const warnings: string[] = [];
	try {
		const parsed = new URL(url);
		if (parsed.pathname === "/") {
			warnings.push("client_id URL path / is NOT RECOMMENDED (§3)");
		}
		if (parsed.search) {
			warnings.push("client_id URL SHOULD NOT contain a query string (§3)");
		}
	} catch {
		// URL validation handled by validateClientIdUrl
	}
	return warnings;
}

function isAbsoluteRedirectUri(uri: string): boolean {
	try {
		const parsed = new URL(uri);
		return (
			parsed.protocol === "http:" ||
			parsed.protocol === "https:" ||
			isReverseDomainPrivateUseRedirectUri(parsed)
		);
	} catch {
		return false;
	}
}

/**
 * Validate a fetched Client ID Metadata Document per §4.1.
 *
 * @param clientIdUrl - The URL the document was fetched from.
 * @param raw - The parsed JSON body of the response.
 * @param options - Generic draft-02 validation options and an optional protocol profile.
 */
export function validateCimdMetadata(
	clientIdUrl: string,
	raw: unknown,
	options: CimdMetadataValidationOptions = {},
): CimdMetadataValidationResult {
	if (!raw || typeof raw !== "object") {
		return { valid: false, error: "metadata document is not a JSON object" };
	}

	// Draft-02 ignores unknown members, but recognized credential, privilege,
	// and server-control fields remain fatal even when they are not part of the
	// shared wire schema.
	for (const field of Object.keys(raw)) {
		if (isForbiddenCimdClientMetadataField(field)) {
			return {
				valid: false,
				error: `metadata document MUST NOT contain "${field}"`,
			};
		}
	}

	const parsedMetadata = oauthClientMetadataSchema.strip().safeParse(raw);
	if (!parsedMetadata.success) {
		const issue = parsedMetadata.error.issues[0];
		const path = issue?.path.join(".") || "metadata document";
		return {
			valid: false,
			error: `${path}: ${issue?.message ?? "invalid client metadata"}`,
		};
	}

	const doc = parsedMetadata.data;
	const warnings: string[] = [];

	// §4.1: client_id MUST equal the fetch URL (simple string comparison)
	if (doc.client_id !== clientIdUrl) {
		return {
			valid: false,
			error: `client_id "${String(doc.client_id)}" does not match the metadata document URL`,
		};
	}

	if (
		options.metadataProfile === "mcp-2026-07-28" &&
		!doc.client_name?.trim()
	) {
		return {
			valid: false,
			error: "client_name must be a non-empty string",
		};
	}

	// §4.1: prohibited recognized wire fields MUST NOT be present.
	for (const field of [
		"backchannel_logout_uri",
		"backchannel_logout_session_required",
	] as const) {
		if (doc[field] !== undefined) {
			return {
				valid: false,
				error: `metadata document MUST NOT contain "${field}"`,
			};
		}
	}

	// §4.1: only non-secret auth methods are allowed
	const ALLOWED_AUTH_METHODS = new Set(["none", "private_key_jwt"]);
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

	if (doc.jwks) {
		const result = validatePublicClientJwks(doc.jwks);
		if (!result.valid) {
			return {
				valid: false,
				error: "jwks must contain only structurally valid public keys",
			};
		}
	}
	if (doc.jwks_uri) {
		try {
			const jwksUri = new URL(doc.jwks_uri);
			if (jwksUri.username || jwksUri.password) {
				return {
					valid: false,
					error: "jwks_uri must not contain credentials",
				};
			}
			if (doc.jwks_uri.includes("#")) {
				return {
					valid: false,
					error: "jwks_uri must not contain a fragment",
				};
			}
		} catch {
			return { valid: false, error: "jwks_uri must be a valid URL" };
		}
	}

	const redirectUrisAreRequired = options.metadataProfile === "mcp-2026-07-28";
	if (redirectUrisAreRequired && !doc.redirect_uris) {
		return {
			valid: false,
			error:
				"redirect_uris must be a non-empty array of absolute HTTP(S) or private-use URIs",
		};
	}
	if (
		doc.redirect_uris &&
		!doc.redirect_uris.every((uri) => isAbsoluteRedirectUri(uri))
	) {
		return {
			valid: false,
			error:
				"redirect_uris must be a non-empty array of absolute HTTP(S) or private-use URIs",
		};
	}

	for (const field of [
		"client_uri",
		"logo_uri",
		"tos_uri",
		"policy_uri",
	] as const) {
		if (doc[field] !== undefined && typeof doc[field] !== "string") {
			return { valid: false, error: `${field} must be a string` };
		}
		if (typeof doc[field] === "string") {
			try {
				const parsed = new URL(doc[field]);
				if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
					return { valid: false, error: `${field} must use HTTP(S)` };
				}
				if (parsed.username || parsed.password) {
					return {
						valid: false,
						error: `${field} must not contain credentials`,
					};
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
	const fieldsToCheck = options.originBoundFields ?? [
		"post_logout_redirect_uris",
		"client_uri",
	];

	let clientIdOrigin: string;
	try {
		clientIdOrigin = new URL(clientIdUrl).origin;
	} catch {
		return { valid: false, error: "client_id is not a valid URL" };
	}

	for (const key of fieldsToCheck) {
		const value = (doc as Record<string, unknown>)[key];
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

			const isRedirectField =
				key === "redirect_uris" || key === "post_logout_redirect_uris";
			const isPrivateUseRedirect =
				isRedirectField && isReverseDomainPrivateUseRedirectUri(uri);
			if (
				uri.protocol !== "https:" &&
				uri.protocol !== "http:" &&
				!isPrivateUseRedirect
			) {
				return {
					valid: false,
					error: `all values for ${key} must use HTTP(S) or an authority-free private-use scheme`,
				};
			}
			if (isPrivateUseRedirect) {
				continue;
			}

			// Loopback redirect URIs are allowed for local/native app flows
			// (RFC 8252); this exception applies only to redirect URI fields.
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
	warnings.push(...getClientIdUrlWarnings(clientIdUrl));

	return {
		valid: true,
		metadata: {
			...doc,
			token_endpoint_auth_method: doc.token_endpoint_auth_method ?? "none",
		},
		...(warnings.length > 0 ? { warnings } : {}),
	};
}
