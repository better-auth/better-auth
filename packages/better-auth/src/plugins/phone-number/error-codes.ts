import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const PHONE_NUMBER_ERROR_CODES = defineErrorCodes({
	/**
 * @description This error occurs when the provided phone number doesn't conform to valid phone number formats or fails validation.
 *
 * ## Common Causes
 *
 * - Phone number format is incorrect or missing country code
 * - Contains invalid characters or formatting
 * - Number length doesn't match expected format for the country
 * - Missing the + prefix for international format
 *
 * ## How to resolve
 *
 * - Ensure phone number includes country code (e.g., +1 for US)
 * - Use E.164 format: +[country code][number]
 * - Remove spaces, dashes, or parentheses
 * - Verify the number is valid for the specified country
 *
 * ## Example
 *
 * ```typescript
 * // Correct phone number format
 * await client.auth.signUp.phoneNumber({
 *   phoneNumber: "+12025551234", // E.164 format
 *   password: "securePassword"
 * });
 * ```
 */
	INVALID_PHONE_NUMBER: "Invalid phone number",
	/**
 * @description This error occurs when attempting to register a phone number that is already associated with an existing account.
 *
 * ## Common Causes
 *
 * - Phone number was previously registered
 * - Another user already has this phone number
 * - Phone number was registered but account is inactive
 *
 * ## How to resolve
 *
 * - Use a different phone number
 * - Sign in with the existing account instead
 * - Use account recovery if you forgot password
 * - Contact support if you believe this is an error
 */
	PHONE_NUMBER_EXIST: "Phone number already exists",
	/**
 * @description This error occurs when attempting to sign in with a phone number that is not registered in the system.
 *
 * ## Common Causes
 *
 * - Phone number was never registered
 * - Typo in the phone number
 * - Account associated with phone number was deleted
 * - Wrong country code used
 *
 * ## How to resolve
 *
 * - Verify the phone number is entered correctly
 * - Create a new account with this phone number
 * - Check if you used a different phone number to register
 * - Ensure country code is correct
 */
	PHONE_NUMBER_NOT_EXIST: "phone number isn't registered",
	/**
 * @description This error occurs when attempting to sign in with a phone number and password combination that doesn't match any account.
 *
 * ## Common Causes
 *
 * - Incorrect phone number entered
 * - Wrong password provided
 * - Phone number format doesn't match registration format
 * - Account doesn't use password authentication
 *
 * ## How to resolve
 *
 * - Verify both phone number and password are correct
 * - Use password reset if you forgot your password
 * - Check if phone number needs country code
 * - Ensure account was created with password authentication
 */
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Invalid phone number or password",
	/**
 * @description This error occurs when an unexpected system error happens during phone number authentication operations.
 *
 * ## Common Causes
 *
 * - Database connection failure
 * - SMS service provider error
 * - System resource limitations
 * - Unhandled exception in the authentication flow
 *
 * ## How to resolve
 *
 * - Retry the operation
 * - Wait a few moments and try again
 * - Check server logs for specific error details
 * - Contact support if the issue persists
 */
	UNEXPECTED_ERROR: "Unexpected error",
	/**
 * @description This error occurs when attempting to verify an OTP that doesn't exist or has been deleted from the system.
 *
 * ## Common Causes
 *
 * - OTP was already used and consumed
 * - OTP was deleted after expiration
 * - Wrong phone number provided for verification
 * - OTP was never requested for this phone number
 *
 * ## How to resolve
 *
 * - Request a new OTP for the phone number
 * - Verify you're using the correct phone number
 * - Ensure OTP request completed successfully before verifying
 */
	OTP_NOT_FOUND: "OTP not found",
	/**
 * @description This error occurs when the one-time password (OTP) has passed its expiration time (typically 5-10 minutes).
 *
 * ## Common Causes
 *
 * - User waited too long to enter the OTP
 * - SMS delivery was delayed
 * - User entered an old OTP from a previous request
 * - System clock differences
 *
 * ## How to resolve
 *
 * - Request a new OTP by triggering another SMS
 * - Complete verification more quickly after receiving OTP
 * - Check that SMS delivery is not delayed
 *
 * ## Example
 *
 * ```typescript
 * // Request a new OTP if expired
 * await client.auth.phoneNumber.sendOtp({ phoneNumber: "+12025551234" });
 * ```
 */
	OTP_EXPIRED: "OTP expired",
	/**
 * @description This error occurs when the provided OTP doesn't match the expected value for the phone number.
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
 * - Double-check the OTP from the SMS
 * - Ensure you're using the most recent OTP
 * - Request a new OTP if unsure
 * - Check for copy-paste errors or extra spaces
 */
	INVALID_OTP: "Invalid OTP",
	/**
 * @description This error occurs when attempting an operation that requires a verified phone number but the phone number hasn't been verified yet.
 *
 * ## Common Causes
 *
 * - User created account but didn't complete OTP verification
 * - Verification step was skipped
 * - Phone number verification expired
 * - System requires phone verification for the operation
 *
 * ## How to resolve
 *
 * - Complete phone number verification with OTP
 * - Request a new verification OTP
 * - Verify the phone number before attempting restricted operations
 *
 * ## Example
 *
 * ```typescript
 * // Verify phone number before proceeding
 * await client.auth.phoneNumber.verify({ phoneNumber, otp: code });
 * ```
 */
	PHONE_NUMBER_NOT_VERIFIED: "Phone number not verified",
	/**
 * @description This error occurs when attempting to update a phone number but the operation is not allowed or fails validation.
 *
 * ## Common Causes
 *
 * - Phone number updates are disabled in configuration
 * - User doesn't have permission to update phone number
 * - New phone number is already in use
 * - Security policy prevents phone number changes
 *
 * ## How to resolve
 *
 * - Verify phone number updates are enabled in configuration
 * - Use a different, unregistered phone number
 * - Complete additional security verification if required
 * - Contact support if you need to change your phone number
 */
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Phone number cannot be updated",
	/**
 * @description This error occurs when phone OTP functionality is requested but the sendOTP function hasn't been configured in the phone number plugin.
 *
 * ## Common Causes
 *
 * - sendOTP function not provided in phone number plugin configuration
 * - SMS service integration not set up
 * - Missing SMS provider credentials
 * - Phone number plugin misconfigured
 *
 * ## How to resolve
 *
 * - Implement the sendOTP function in phone number plugin configuration
 * - Configure SMS service provider (Twilio, AWS SNS, etc.)
 * - Ensure SMS provider credentials are set
 * - Review phone number plugin documentation for setup
 *
 * ## Example
 *
 * ```typescript
 * // Configure sendOTP in plugin
 * phoneNumber({
 *   sendOTP: async (phoneNumber, otp) => {
 *     await smsService.send(phoneNumber, `Your code: ${otp}`);
 *   }
 * })
 * ```
 */
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP not implemented",
	/**
 * @description This error occurs when the user has exceeded the maximum number of OTP verification or sign-in attempts.
 *
 * ## Common Causes
 *
 * - User entered incorrect OTP multiple times
 * - Too many OTP requests in a short time period
 * - Rate limiting triggered for security
 * - Automated attack prevention activated
 *
 * ## How to resolve
 *
 * - Wait for the rate limit cooldown period to expire
 * - Request a new OTP after the cooldown
 * - Ensure you're entering the correct OTP carefully
 * - Contact support if you're locked out
 */
	TOO_MANY_ATTEMPTS: "Too many attempts",
});
