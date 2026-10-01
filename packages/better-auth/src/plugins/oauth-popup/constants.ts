/** postMessage `type` the completion page posts to its opener. */
export const OAUTH_POPUP_MESSAGE_TYPE = "better-auth:oauth-popup";

/** DOM id of the inert JSON data block the completion page reads. */
export const OAUTH_POPUP_DATA_ELEMENT_ID = "better-auth-oauth-popup";

/** Signed cookie carrying the opener origin/nonce from sign-in to callback. */
export const POPUP_MARKER_COOKIE = "oauth_popup";

/** localStorage key the popup session token is persisted under. */
export const POPUP_TOKEN_STORAGE_KEY = "better-auth.popup_token";
