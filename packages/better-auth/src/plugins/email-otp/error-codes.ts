import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const EMAIL_OTP_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when the one-time password (OTP) has passed its expiration time and is no longer valid.
	 *
	 * ## Common Causes
	 *
	 * - User waited too long to enter the OTP (typically expires after 5-10 minutes)
	 * - OTP was generated but not used within the validity window
	 * - System clock differences between server and client
	 *
	 * ## How to resolve
	 *
	 * - Request a new OTP by triggering another email
	 * - Complete the verification more quickly after receiving the OTP
	 * - Check that your email delivery is not delayed
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Request a new OTP if expired
	 * await client.auth.emailOtp.sendOtp({ email: "user@example.com" });
	 * ```
	 */
	OTP_EXPIRED: "OTP expired",
	/**
	 * @description This error occurs when the provided OTP doesn't match the expected value or is malformed.
	 *
	 * ## Common Causes
	 *
	 * - User entered the wrong OTP code
	 * - Typo in the OTP entry
	 * - Using an OTP from a previous request
	 * - OTP was already used successfully
	 *
	 * ## How to resolve
	 *
	 * - Double-check the OTP from the email
	 * - Ensure you're using the most recent OTP
	 * - Request a new OTP if unsure
	 * - Check for copy-paste errors or extra spaces
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Verify OTP with proper error handling
	 * try {
	 *   await client.auth.emailOtp.verify({ email, otp: userInput.trim() });
	 * } catch (e) {
	 *   if (e.code === "INVALID_OTP") {
	 *     showError("Incorrect code. Please try again.");
	 *   }
	 * }
	 * ```
	 */
	INVALID_OTP: "Invalid OTP",
	/**
	 * @description This error occurs when the user has exceeded the maximum number of OTP verification attempts, typically to prevent brute force attacks.
	 *
	 * ## Common Causes
	 *
	 * - User entered incorrect OTP multiple times (typically 3-5 attempts)
	 * - Automated attack attempting to guess OTP codes
	 * - Rate limiting triggered for security
	 *
	 * ## How to resolve
	 *
	 * - Wait for the rate limit cooldown period to expire
	 * - Request a new OTP after the cooldown
	 * - Ensure users are carefully entering the correct OTP
	 * - Implement user feedback to reduce incorrect attempts
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Handle rate limiting gracefully
	 * try {
	 *   await client.auth.emailOtp.verify({ email, otp });
	 * } catch (e) {
	 *   if (e.code === "TOO_MANY_ATTEMPTS") {
	 *     showError("Too many failed attempts. Please try again in a few minutes.");
	 *   }
	 * }
	 * ```
	 */
	TOO_MANY_ATTEMPTS: "Too many attempts",
});
