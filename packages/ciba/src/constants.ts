/**
 * OAuth grant type for the CIBA token-delivery poll, registered with the OAuth
 * provider's token endpoint.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html#rfc.section.7.3
 */
export const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";

export const BC_AUTHORIZE_PATH = "/oauth2/bc-authorize";

/**
 * Query parameter that identifies a backchannel request on `/oauth2/authorize`,
 * where the user it was sent to approves or denies it.
 */
export const APPROVAL_PARAMETER = "ciba_request_id";
