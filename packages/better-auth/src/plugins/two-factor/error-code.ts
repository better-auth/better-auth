import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TWO_FACTOR_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when attempting to use one-time password (OTP) authentication but it hasn't been enabled for the user account.
	 *
	 * ## Common Causes
	 *
	 * - User hasn't set up OTP-based 2FA
	 * - OTP method was disabled after initial setup
	 * - Attempting OTP verification without enabling it first
	 *
	 * ## How to resolve
	 *
	 * - Enable OTP-based two-factor authentication in account settings
	 * - Complete the OTP setup process
	 * - Use a different 2FA method if OTP is not available
	 */
	OTP_NOT_ENABLED: "OTP not enabled",
	/**
	 * @description This error occurs when the one-time password has passed its expiration time and is no longer valid.
	 *
	 * ## Common Causes
	 *
	 * - User waited too long to enter the OTP (typically expires after 5-10 minutes)
	 * - Email/SMS delivery was delayed
	 * - Using an old OTP from a previous request
	 *
	 * ## How to resolve
	 *
	 * - Request a new OTP
	 * - Complete verification more quickly after receiving OTP
	 * - Check email/SMS delivery for delays
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Request a new OTP if expired
	 * await client.auth.twoFactor.sendOtp();
	 * ```
	 */
	OTP_HAS_EXPIRED: "OTP has expired",
	/**
	 * @description This error occurs when attempting to use time-based one-time password (TOTP) authentication but it hasn't been enabled for the user account.
	 *
	 * ## Common Causes
	 *
	 * - User hasn't set up TOTP-based 2FA (authenticator app)
	 * - TOTP was disabled in account settings
	 * - Attempting TOTP verification without setup
	 *
	 * ## How to resolve
	 *
	 * - Enable TOTP in account settings
	 * - Set up an authenticator app (Google Authenticator, Authy, etc.)
	 * - Scan the QR code or enter the secret key to complete setup
	 * - Use a different 2FA method if TOTP is not available
	 */
	TOTP_NOT_ENABLED: "TOTP not enabled",
	/**
	 * @description This error occurs when attempting two-factor authentication operations but 2FA hasn't been enabled for the user account.
	 *
	 * ## Common Causes
	 *
	 * - User hasn't enabled any two-factor authentication method
	 * - 2FA was disabled after initial setup
	 * - Attempting to verify 2FA on an account without it enabled
	 *
	 * ## How to resolve
	 *
	 * - Enable two-factor authentication in account settings
	 * - Choose and set up a 2FA method (TOTP, OTP, or backup codes)
	 * - Complete the 2FA setup wizard
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Enable 2FA before using it
	 * await client.auth.twoFactor.enable({ method: "totp" });
	 * ```
	 */
	TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
	/**
	 * @description This error occurs when attempting to use backup codes but they haven't been generated or enabled for the user account.
	 *
	 * ## Common Causes
	 *
	 * - User hasn't generated backup codes
	 * - Backup codes feature is disabled
	 * - All backup codes were already used
	 *
	 * ## How to resolve
	 *
	 * - Generate backup codes in account settings
	 * - Store backup codes securely when generated
	 * - Generate new backup codes if all were used
	 * - Use a different 2FA method if backup codes aren't available
	 */
	BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
	/**
	 * @description This error occurs when the provided backup code doesn't match any valid, unused backup codes for the account.
	 *
	 * ## Common Causes
	 *
	 * - Backup code was typed incorrectly
	 * - Backup code was already used
	 * - Using backup codes from a different account
	 * - Backup codes were regenerated and old ones are invalid
	 *
	 * ## How to resolve
	 *
	 * - Double-check the backup code for typos
	 * - Try a different backup code from your list
	 * - Generate new backup codes if all are used or lost
	 * - Use a different 2FA method if available
	 */
	INVALID_BACKUP_CODE: "Invalid backup code",
	/**
	 * @description This error occurs when the provided two-factor authentication code (OTP or TOTP) doesn't match the expected value.
	 *
	 * ## Common Causes
	 *
	 * - Code was entered incorrectly
	 * - TOTP code expired (they change every 30 seconds)
	 * - System time on device is out of sync for TOTP
	 * - Using an old OTP that has expired
	 *
	 * ## How to resolve
	 *
	 * - Double-check the code for typos
	 * - For TOTP, wait for the next code if time is about to expire
	 * - Ensure device time is synchronized for TOTP apps
	 * - Request a new OTP if using email/SMS based codes
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Verify 2FA code with proper error handling
	 * try {
	 *   await client.auth.twoFactor.verify({ code: userInput.trim() });
	 * } catch (e) {
	 *   if (e.code === "INVALID_CODE") {
	 *     showError("Incorrect code. Please try again.");
	 *   }
	 * }
	 * ```
	 */
	INVALID_CODE: "Invalid code",
	/**
	 * @description This error occurs when the user has exceeded the maximum number of code verification attempts and needs to request a fresh code.
	 *
	 * ## Common Causes
	 *
	 * - User entered incorrect codes multiple times
	 * - Rate limiting triggered for security
	 * - Automated attack prevention activated
	 * - Too many failed verification attempts in short time
	 *
	 * ## How to resolve
	 *
	 * - Request a new verification code
	 * - Wait for the rate limit cooldown if applicable
	 * - Ensure you're entering codes carefully
	 * - Use backup codes if available
	 * - Contact support if you're locked out
	 */
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
		"Too many attempts. Please request a new code.",
	/**
	 * @description This error occurs when the two-factor authentication cookie is invalid, expired, or tampered with.
	 *
	 * ## Common Causes
	 *
	 * - Cookie was manually modified or corrupted
	 * - Cookie expired before completing 2FA
	 * - Session state mismatch during 2FA flow
	 * - Cookie was cleared or blocked by browser
	 *
	 * ## How to resolve
	 *
	 * - Restart the authentication process from the beginning
	 * - Clear browser cookies and try again
	 * - Ensure cookies are enabled in your browser
	 * - Check that your browser isn't blocking third-party cookies
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Restart authentication flow if cookie is invalid
	 * await client.auth.signIn({ email, password }); // Start fresh
	 * ```
	 */
	INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
});
