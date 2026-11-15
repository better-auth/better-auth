/** The authorization challenge endpoint (draft-ietf-oauth-first-party-apps §4.1). */
export const AUTHORIZE_CHALLENGE_PATH = "/oauth2/authorize-challenge";

/**
 * The client `metadata` field that makes a client a first-party app. Set it
 * with the admin client endpoints; registrants cannot set it.
 */
export const FIRST_PARTY_APP_FIELD = "first_party_app";
