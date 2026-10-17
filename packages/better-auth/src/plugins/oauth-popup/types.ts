import type { OAUTH_POPUP_MESSAGE_TYPE } from "./constants";

/** OAuth error relayed to the opener when the flow fails. */
export interface OAuthPopupError {
	code: string;
	description?: string;
}

/**
 * Message the completion page posts to its opener — success carries the token,
 * failure carries the error.
 */
export interface OAuthPopupMessage {
	type: typeof OAUTH_POPUP_MESSAGE_TYPE;
	/** Echoes the request nonce so the opener can correlate the handoff. */
	nonce: string;
	/** The session token, sent as `Authorization: Bearer <token>` (on success). */
	token?: string;
	/** Where the flow would have redirected (callbackURL / newUserURL). */
	redirectTo?: string;
	/** The OAuth error (on failure). */
	error?: OAuthPopupError;
}

/** Payload embedded in the completion page's data block. */
export interface OAuthPopupData extends OAuthPopupMessage {
	/** Exact origin the message is posted to (the trusted popup opener). */
	targetOrigin: string;
}
