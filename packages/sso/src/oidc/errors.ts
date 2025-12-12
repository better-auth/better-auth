/**
 * OIDC Discovery Error Mapping
 *
 * Maps DiscoveryError codes to appropriate APIError responses.
 * Used at the boundary between the discovery pipeline and HTTP handlers.
 */

import { APIError } from "better-auth/api";
import type { DiscoveryError } from "./types";

/**
 * Maps a DiscoveryError to an appropriate APIError for HTTP responses.
 *
 * Error code mapping:
 * - discovery_invalid_url       → 400 BAD_REQUEST
 * - discovery_not_found         → 400 BAD_REQUEST
 * - discovery_invalid_json      → 400 BAD_REQUEST
 * - discovery_incomplete        → 400 BAD_REQUEST
 * - issuer_mismatch             → 400 BAD_REQUEST
 * - unsupported_token_auth_method → 400 BAD_REQUEST
 * - discovery_timeout           → 502 BAD_GATEWAY
 * - discovery_unexpected_error  → 502 BAD_GATEWAY
 *
 * @param error - The DiscoveryError to map
 * @returns An APIError with appropriate status and message
 */
export function mapDiscoveryErrorToAPIError(error: DiscoveryError): APIError {
	switch (error.code) {
		case "discovery_timeout":
			return new APIError("BAD_GATEWAY", {
				message: `OIDC discovery timed out: ${error.message}`,
				code: error.code,
			});

		case "discovery_unexpected_error":
			return new APIError("BAD_GATEWAY", {
				message: `OIDC discovery failed: ${error.message}`,
				code: error.code,
			});

		case "discovery_not_found":
			return new APIError("BAD_REQUEST", {
				message: `OIDC discovery endpoint not found. The issuer may not support OIDC discovery, or the URL is incorrect. ${error.message}`,
				code: error.code,
			});

		case "discovery_invalid_url":
			return new APIError("BAD_REQUEST", {
				message: `Invalid OIDC discovery URL: ${error.message}`,
				code: error.code,
			});

		case "discovery_untrusted_origin":
			return new APIError("BAD_REQUEST", {
				message: `Untrusted OIDC discovery URL: ${error.message}`,
				code: error.code,
			});

		case "discovery_invalid_json":
			return new APIError("BAD_REQUEST", {
				message: `OIDC discovery returned invalid data: ${error.message}`,
				code: error.code,
			});

		case "discovery_incomplete":
			return new APIError("BAD_REQUEST", {
				message: `OIDC discovery document is missing required fields: ${error.message}`,
				code: error.code,
			});

		case "issuer_mismatch":
			return new APIError("BAD_REQUEST", {
				message: `OIDC issuer mismatch: ${error.message}`,
				code: error.code,
			});

		case "unsupported_token_auth_method":
			return new APIError("BAD_REQUEST", {
				message: `Incompatible OIDC provider: ${error.message}`,
				code: error.code,
			});

		default: {
			// Exhaustive check - TypeScript will error if we miss a case
			const _exhaustiveCheck: never = error.code;
			return new APIError("INTERNAL_SERVER_ERROR", {
				message: `Unexpected discovery error: ${error.message}`,
				code: "discovery_unexpected_error",
			});
		}
	}
}
