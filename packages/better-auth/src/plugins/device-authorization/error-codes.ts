import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const DEVICE_AUTHORIZATION_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when the provided device code is not valid or doesn't exist in the system.
	 *
	 * ## Common Causes
	 *
	 * - Device code was typed incorrectly
	 * - Device code doesn't exist in the database
	 * - Device code has been deleted or revoked
	 *
	 * ## How to resolve
	 *
	 * - Verify the device code is entered correctly
	 * - Request a new device code from the authorization endpoint
	 * - Check for typos or extra characters
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Request new device code if invalid
	 * const { deviceCode, userCode } = await client.auth.device.authorize();
	 * ```
	 */
	INVALID_DEVICE_CODE: "Invalid device code",
	/**
	 * @description This error occurs when the device code has passed its expiration time (typically 10-15 minutes).
	 *
	 * ## Common Causes
	 *
	 * - User took too long to complete authorization
	 * - Device code wasn't used within the expiration window
	 * - System clock differences between device and server
	 *
	 * ## How to resolve
	 *
	 * - Request a new device code
	 * - Complete the authorization process more quickly
	 * - Check that system clocks are synchronized
	 */
	EXPIRED_DEVICE_CODE: "Device code has expired",
	/**
	 * @description This error occurs when the user code displayed to the user has passed its expiration time.
	 *
	 * ## Common Causes
	 *
	 * - User code wasn't entered within the expiration window
	 * - User delayed entering the code on the authorization page
	 * - Expiration period is too short for the workflow
	 *
	 * ## How to resolve
	 *
	 * - Request a new user code and device code pair
	 * - Enter the code more quickly after receiving it
	 * - Consider increasing the expiration period in configuration
	 */
	EXPIRED_USER_CODE: "User code has expired",
	/**
	 * @description This error indicates that the device authorization is still pending and the user hasn't completed the authorization yet. This is an expected status during the OAuth device flow.
	 *
	 * ## Common Causes
	 *
	 * - User hasn't navigated to the authorization URL yet
	 * - User is still in the process of authorizing
	 * - Authorization page hasn't been submitted
	 *
	 * ## How to resolve
	 *
	 * - Continue polling the token endpoint
	 * - Wait for user to complete authorization
	 * - Display the user code and verification URL to the user
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Typical polling implementation
	 * let authorized = false;
	 * while (!authorized) {
	 *   try {
	 *     const token = await pollToken(deviceCode);
	 *     authorized = true;
	 *   } catch (e) {
	 *     if (e.code !== "AUTHORIZATION_PENDING") throw e;
	 *     await delay(5000); // Wait before next poll
	 *   }
	 * }
	 * ```
	 */
	AUTHORIZATION_PENDING: "Authorization pending",
	/**
	 * @description This error occurs when the user explicitly denies the authorization request on the authorization page.
	 *
	 * ## Common Causes
	 *
	 * - User clicked "Deny" or "Cancel" on the authorization page
	 * - User doesn't want to grant access to the device
	 * - User is testing the denial flow
	 *
	 * ## How to resolve
	 *
	 * - Inform the user that access was denied
	 * - Allow the user to request a new device code to try again
	 * - Provide clear messaging about why authorization is needed
	 */
	ACCESS_DENIED: "Access denied",
	/**
	 * @description This error occurs when the user code entered on the authorization page is not valid or doesn't exist.
	 *
	 * ## Common Causes
	 *
	 * - User code was typed incorrectly
	 * - User code has already been used
	 * - User code doesn't match any pending authorization
	 *
	 * ## How to resolve
	 *
	 * - Double-check the user code displayed on the device
	 * - Ensure all characters are entered correctly (avoid O/0 confusion)
	 * - Request a new device code if the current one is invalid
	 */
	INVALID_USER_CODE: "Invalid user code",
	/**
	 * @description This error occurs when attempting to use a device code that has already been authorized or denied.
	 *
	 * ## Common Causes
	 *
	 * - Device code was already used successfully
	 * - Device code was already denied by the user
	 * - Multiple polling attempts after authorization completed
	 *
	 * ## How to resolve
	 *
	 * - Stop polling if you receive this error
	 * - Check if authorization was completed in a previous poll
	 * - Request a new device code if you need to authorize again
	 */
	DEVICE_CODE_ALREADY_PROCESSED: "Device code already processed",
	/**
	 * @description This error occurs when the device polls the token endpoint too frequently, violating the rate limit specified in the device authorization response.
	 *
	 * ## Common Causes
	 *
	 * - Polling interval is shorter than the specified interval (typically 5 seconds)
	 * - Implementation doesn't respect the rate limiting guidelines
	 * - Multiple instances polling the same device code
	 *
	 * ## How to resolve
	 *
	 * - Increase the delay between polling requests
	 * - Use the interval value from the device authorization response
	 * - Implement exponential backoff if you receive this error
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Respect the polling interval
	 * const { interval } = await client.auth.device.authorize();
	 * setInterval(() => pollToken(), interval * 1000);
	 * ```
	 */
	POLLING_TOO_FREQUENTLY: "Polling too frequently",
	/**
	 * @description This error occurs when the user associated with the authorization cannot be found in the system.
	 *
	 * ## Common Causes
	 *
	 * - User account was deleted after authorization started
	 * - User ID stored in device code is invalid
	 * - Database inconsistency
	 *
	 * ## How to resolve
	 *
	 * - Ensure the user account still exists
	 * - Request a new device authorization
	 * - Check for database integrity issues
	 */
	USER_NOT_FOUND: "User not found",
	/**
	 * @description This error occurs when the system fails to create a session after successful device authorization.
	 *
	 * ## Common Causes
	 *
	 * - Database session table constraints failed
	 * - Session store is unavailable
	 * - Session creation timeout
	 *
	 * ## How to resolve
	 *
	 * - Check database connectivity
	 * - Verify session configuration is correct
	 * - Review server logs for session creation errors
	 * - Retry the authorization process
	 */
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	/**
	 * @description This error occurs when the device code has an invalid or unexpected status in the database.
	 *
	 * ## Common Causes
	 *
	 * - Database corruption or invalid state
	 * - Device code status was manually modified
	 * - Race condition in status updates
	 *
	 * ## How to resolve
	 *
	 * - Request a new device code
	 * - Check database integrity
	 * - Review server logs for state transition errors
	 */
	INVALID_DEVICE_CODE_STATUS: "Invalid device code status",
	/**
	 * @description This error occurs when the user attempts to authorize a device code but is not authenticated.
	 *
	 * ## Common Causes
	 *
	 * - User is not signed in
	 * - Session expired before authorization
	 * - Authentication cookie is missing
	 *
	 * ## How to resolve
	 *
	 * - Redirect user to sign in
	 * - Authenticate before accessing the authorization page
	 * - Ensure session is maintained during the authorization flow
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Check authentication before showing authorization page
	 * const session = await client.auth.getSession();
	 * if (!session) {
	 *   redirect("/sign-in?returnTo=/device/authorize");
	 * }
	 * ```
	 */
	AUTHENTICATION_REQUIRED: "Authentication required",
});
