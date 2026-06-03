import type { OAUTH_POPUP_MESSAGE_TYPE } from "./constants";

/**
 * Message the completion page posts to its opener.
 */
export interface OAuthPopupMessage {
	type: typeof OAUTH_POPUP_MESSAGE_TYPE;
	/** Echoes the request nonce so the opener can correlate the handoff. */
	nonce: string;
	/** The session token, sent as `Authorization: Bearer <token>`. */
	token: string;
	/** Where the flow would have redirected (callbackURL / newUserURL). */
	redirectTo: string;
}

/**
 * Payload embedded in the completion page's data block.
 */
export interface OAuthPopupData extends OAuthPopupMessage {
	/**
	 * Exact origin the message is posted to (the trusted popup opener).
	 */
	targetOrigin: string;
}
