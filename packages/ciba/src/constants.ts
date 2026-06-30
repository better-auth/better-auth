/**
 * OAuth grant type for the CIBA token-delivery poll, registered with the OAuth
 * provider's token endpoint.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html#rfc.section.7.3
 */
export const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";

/** Backchannel authentication endpoint path, co-located with the OAuth routes. */
export const BC_AUTHORIZE_PATH = "/oauth2/bc-authorize";

/** Default lifetime of a backchannel auth request, in seconds (CIBA §7.3). */
export const DEFAULT_REQUEST_EXPIRY = 300;

/** Default minimum interval a client must wait between token polls, in seconds. */
export const DEFAULT_POLLING_INTERVAL = 5;

/** Seconds the polling interval ratchets up on each `slow_down` (CIBA §11). */
export const SLOW_DOWN_INCREMENT = 5;

/**
 * Registered client-metadata field naming the CIBA token delivery mode (CIBA
 * §4). A client must register one of `poll`, `ping`, or `push`.
 */
export const DELIVERY_MODE_METADATA_KEY = "backchannel_token_delivery_mode";

/** All CIBA token delivery modes, in the order metadata advertises them. */
export const ALL_DELIVERY_MODES = ["poll", "ping", "push"] as const;
