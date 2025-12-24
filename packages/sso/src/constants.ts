/**
 * SAML Constants
 *
 * Centralized constants for SAML SSO functionality.
 */

// ============================================================================
// Key Prefixes (for verification table storage)
// ============================================================================

/** Prefix for AuthnRequest IDs used in InResponseTo validation */
export const AUTHN_REQUEST_KEY_PREFIX = "saml-authn-request:";

/** Prefix for used Assertion IDs used in replay protection */
export const USED_ASSERTION_KEY_PREFIX = "saml-used-assertion:";

// ============================================================================
// Time-To-Live (TTL) Defaults
// ============================================================================

/**
 * Default TTL for AuthnRequest records (5 minutes).
 * This should be sufficient for most IdPs while protecting against stale requests.
 */
export const DEFAULT_AUTHN_REQUEST_TTL_MS = 5 * 60 * 1000;

/**
 * Default TTL for used assertion records (15 minutes).
 * This should match the maximum expected NotOnOrAfter window plus clock skew.
 */
export const DEFAULT_ASSERTION_TTL_MS = 15 * 60 * 1000;

/**
 * Default clock skew tolerance (5 minutes).
 * Allows for minor time differences between IdP and SP servers.
 *
 * Accommodates:
 * - Network latency and processing time
 * - Clock synchronization differences (NTP drift)
 * - Distributed systems across timezones
 */
export const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;

// ============================================================================
// Size Limits (DoS Protection)
// ============================================================================

/**
 * Default maximum size for SAML responses (256 KB).
 * Protects against memory exhaustion from oversized SAML payloads.
 */
export const DEFAULT_MAX_SAML_RESPONSE_SIZE = 256 * 1024;

/**
 * Default maximum size for IdP metadata (100 KB).
 * Protects against oversized metadata documents.
 */
export const DEFAULT_MAX_SAML_METADATA_SIZE = 100 * 1024;
