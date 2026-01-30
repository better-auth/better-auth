import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const USERNAME_ERROR_CODES = defineErrorCodes({
	/**
 * @description This error occurs when attempting to sign in with a username and password combination that doesn't match any account.
 *
 * ## Common Causes
 *
 * - Incorrect username entered
 * - Wrong password provided
 * - Username doesn't exist in the system
 * - Account uses different authentication method
 *
 * ## How to resolve
 *
 * - Verify both username and password are correct
 * - Check for typos in username (case-sensitive)
 * - Use password reset if you forgot your password
 * - Ensure you registered with username authentication
 *
 * ## Example
 *
 * ```typescript
 * // Verify credentials match registration
 * await client.auth.signIn.username({
 *   username: "johndoe",
 *   password: "correctPassword"
 * });
 * ```
 */
	INVALID_USERNAME_OR_PASSWORD: "Invalid username or password",
	/**
 * @description This error occurs when attempting an operation that requires email verification but the user's email hasn't been verified yet.
 *
 * ## Common Causes
 *
 * - User created account but didn't verify email
 * - Email verification link wasn't clicked
 * - Verification email expired
 * - System requires email verification for username accounts
 *
 * ## How to resolve
 *
 * - Check email for verification link
 * - Request a new verification email
 * - Complete email verification before proceeding
 * - Check spam folder for verification email
 */
	EMAIL_NOT_VERIFIED: "Email not verified",
	/**
 * @description This error occurs when an unexpected system error happens during username authentication operations.
 *
 * ## Common Causes
 *
 * - Database connection failure
 * - System resource limitations
 * - Unhandled exception in the authentication flow
 * - Configuration error
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
 * @description This error occurs when attempting to register or change to a username that is already in use by another account.
 *
 * ## Common Causes
 *
 * - Another user already registered this username
 * - Username was previously taken
 * - Case-insensitive username collision
 *
 * ## How to resolve
 *
 * - Choose a different username
 * - Add numbers or unique identifiers to make it unique
 * - Check if username is available before attempting registration
 * - Try variations of your desired username
 *
 * ## Example
 *
 * ```typescript
 * // Handle username taken error gracefully
 * try {
 *   await client.auth.signUp.username({ username: "john" });
 * } catch (e) {
 *   if (e.code === "USERNAME_IS_ALREADY_TAKEN") {
 *     // Suggest alternatives like "john123", "john_smith"
 *   }
 * }
 * ```
 */
	USERNAME_IS_ALREADY_TAKEN: "Username is already taken. Please try another.",
	/**
 * @description This error occurs when the provided username is shorter than the minimum required length.
 *
 * ## Common Causes
 *
 * - Username has fewer characters than minimum (typically 3 characters)
 * - Empty username provided
 * - Username length validation failed
 *
 * ## How to resolve
 *
 * - Use a longer username that meets minimum length requirements
 * - Check the username length requirements in documentation
 * - Typically usernames need at least 3-4 characters
 *
 * ## Example
 *
 * ```typescript
 * // Ensure username meets minimum length
 * await client.auth.signUp.username({
 *   username: "john123", // At least 3+ characters
 *   password: "securePassword"
 * });
 * ```
 */
	USERNAME_TOO_SHORT: "Username is too short",
	/**
 * @description This error occurs when the provided username exceeds the maximum allowed length.
 *
 * ## Common Causes
 *
 * - Username has more characters than maximum (typically 20-30 characters)
 * - Username length validation failed
 * - Very long username string provided
 *
 * ## How to resolve
 *
 * - Use a shorter username that meets maximum length requirements
 * - Check the username length requirements in documentation
 * - Typically usernames should be 20-30 characters or less
 */
	USERNAME_TOO_LONG: "Username is too long",
	/**
 * @description This error occurs when the username contains invalid characters or doesn't meet format requirements.
 *
 * ## Common Causes
 *
 * - Username contains special characters that aren't allowed
 * - Username contains spaces
 * - Username starts or ends with invalid characters
 * - Username contains only numbers or symbols
 *
 * ## How to resolve
 *
 * - Use only allowed characters (typically letters, numbers, underscores, hyphens)
 * - Remove spaces and special characters
 * - Start username with a letter
 * - Follow the username format guidelines
 *
 * ## Example
 *
 * ```typescript
 * // Valid username formats
 * "john_doe"     // Correct
 * "john-smith"   // Correct
 * "john123"      // Correct
 * "john doe"     // Invalid - contains space
 * "john@smith"   // Invalid - contains @
 * ```
 */
	INVALID_USERNAME: "Username is invalid",
	/**
 * @description This error occurs when the display username (the visible name shown to other users) contains invalid characters or doesn't meet format requirements.
 *
 * ## Common Causes
 *
 * - Display username contains prohibited characters
 * - Display username is too long or too short
 * - Display username violates content policy
 * - Invalid Unicode characters or emojis (if not allowed)
 *
 * ## How to resolve
 *
 * - Use appropriate characters for display names
 * - Follow display username format guidelines
 * - Check length requirements
 * - Ensure content is appropriate and within policy
 */
	INVALID_DISPLAY_USERNAME: "Display username is invalid",
});
