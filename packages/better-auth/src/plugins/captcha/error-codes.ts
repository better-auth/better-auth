// These error codes are returned by the API
import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const EXTERNAL_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when the CAPTCHA verification process fails, indicating the user did not successfully complete the CAPTCHA challenge.
	 *
	 * ## Common Causes
	 *
	 * - User failed to solve the CAPTCHA correctly
	 * - CAPTCHA response token is invalid or expired
	 * - Bot detection triggered verification failure
	 * - CAPTCHA provider rejected the verification
	 *
	 * ## How to resolve
	 *
	 * - Ask the user to retry the CAPTCHA
	 * - Ensure the CAPTCHA widget is properly initialized
	 * - Verify the CAPTCHA response is sent before expiration (typically 2 minutes)
	 * - Check that your CAPTCHA provider credentials are correct
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Client-side: Ensure CAPTCHA response is included
	 * await client.auth.signUp({
	 *   email: "user@example.com",
	 *   password: "password",
	 *   captchaToken: grecaptcha.getResponse()
	 * });
	 * ```
	 */
	VERIFICATION_FAILED: "Captcha verification failed",
	/**
	 * @description This error occurs when the CAPTCHA response token is not included in the request that requires CAPTCHA verification.
	 *
	 * ## Common Causes
	 *
	 * - CAPTCHA widget not rendered on the page
	 * - User didn't complete the CAPTCHA before submitting
	 * - CAPTCHA response not included in the API request
	 * - Frontend integration issue with CAPTCHA provider
	 *
	 * ## How to resolve
	 *
	 * - Ensure CAPTCHA widget is rendered before form submission
	 * - Verify CAPTCHA response is being captured and sent
	 * - Check that the CAPTCHA field name matches your configuration
	 * - Implement form validation to require CAPTCHA completion
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Ensure CAPTCHA response is captured
	 * const captchaToken = grecaptcha.getResponse();
	 * if (!captchaToken) {
	 *   alert("Please complete the CAPTCHA");
	 *   return;
	 * }
	 * ```
	 */
	MISSING_RESPONSE: "Missing CAPTCHA response",
	/**
	 * @description This is a generic error that occurs when an unexpected issue happens during CAPTCHA verification.
	 *
	 * ## Common Causes
	 *
	 * - Network issues contacting CAPTCHA provider
	 * - Unexpected response format from CAPTCHA service
	 * - Internal server error during verification
	 * - Configuration issues with CAPTCHA integration
	 *
	 * ## How to resolve
	 *
	 * - Check server logs for detailed error information
	 * - Verify network connectivity to CAPTCHA provider
	 * - Ensure CAPTCHA configuration is correct
	 * - Retry the operation after a short delay
	 * - Contact support if the issue persists
	 */
	UNKNOWN_ERROR: "Something went wrong",
});

// These error codes are only visible in the server logs
export const INTERNAL_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This internal error occurs when the CAPTCHA secret key is not configured on the server. This error appears only in server logs.
	 *
	 * ## Common Causes
	 *
	 * - CAPTCHA secret key not set in environment variables
	 * - Configuration file missing secret key
	 * - Environment variables not loaded properly
	 *
	 * ## How to resolve
	 *
	 * - Set the CAPTCHA secret key in your environment variables (e.g., CAPTCHA_SECRET_KEY)
	 * - Verify the secret key is correctly configured in your Better Auth setup
	 * - Restart the server after adding the secret key
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // In your auth configuration
	 * export const auth = betterAuth({
	 *   plugins: [
	 *     captcha({
	 *       secretKey: process.env.CAPTCHA_SECRET_KEY,
	 *     })
	 *   ]
	 * });
	 * ```
	 */
	MISSING_SECRET_KEY: "Missing secret key",
	/**
	 * @description This internal error occurs when the CAPTCHA verification service is unavailable or unreachable. This error appears only in server logs.
	 *
	 * ## Common Causes
	 *
	 * - CAPTCHA provider service is down
	 * - Network connectivity issues from server to CAPTCHA provider
	 * - Firewall blocking outbound requests to CAPTCHA service
	 * - DNS resolution issues
	 *
	 * ## How to resolve
	 *
	 * - Check CAPTCHA provider status page (e.g., status.recaptcha.com)
	 * - Verify server can reach external services
	 * - Check firewall rules and network configuration
	 * - Implement retry logic with exponential backoff
	 * - Consider a fallback CAPTCHA provider
	 */
	SERVICE_UNAVAILABLE: "CAPTCHA service unavailable",
});
