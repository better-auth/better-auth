import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const OAUTH_POPUP_ERROR_CODES = defineErrorCodes({
	POPUP_SIGN_IN_FAILED: "Popup sign-in failed",
	POPUP_BLOCKED: "Sign-in popup was blocked by the browser",
	POPUP_CLOSED: "Sign-in popup was closed before completing",
	POPUP_TIMEOUT: "Sign-in popup timed out",
});
