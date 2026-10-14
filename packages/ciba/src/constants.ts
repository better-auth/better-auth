/**
 * OAuth grant type for the CIBA token-delivery poll, registered with the OAuth
 * provider's token endpoint.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html#rfc.section.7.3
 */
export const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";

/** Backchannel authentication endpoint path, co-located with the OAuth routes. */
export const BC_AUTHORIZE_PATH = "/oauth2/bc-authorize";
