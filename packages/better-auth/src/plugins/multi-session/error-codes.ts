import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const MULTI_SESSION_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when a session token is invalid, expired, or malformed when working with multiple concurrent sessions.
	 *
	 * ## Common Causes
	 *
	 * - Session token has expired
	 * - Token was revoked or deleted
	 * - Malformed or corrupted token string
	 * - Using a token from a different session than intended
	 *
	 * ## How to resolve
	 *
	 * - Refresh the session token
	 * - Re-authenticate to obtain a new valid session
	 * - Ensure you're using the correct session token for the operation
	 * - Check that the token hasn't been manually modified or truncated
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Switch to a specific session with valid token
	 * await client.auth.session.switch({ sessionToken: validToken });
	 * ```
	 */
	INVALID_SESSION_TOKEN: "Invalid session token",
});
