import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ANONYMOUS_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when the automatically generated email for an anonymous user doesn't conform to the expected format.
	 *
	 * ## Common Causes
	 *
	 * - Email generation algorithm produced an invalid format
	 * - Custom email format configuration is incorrect
	 * - Domain validation failed for generated email
	 *
	 * ## How to resolve
	 *
	 * - Check your anonymous user email generation configuration
	 * - Ensure the email domain is properly configured
	 * - Review the email format pattern in your setup
	 */
	INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
	/**
	 * @description This error occurs when the system fails to create an anonymous user account due to database or validation issues.
	 *
	 * ## Common Causes
	 *
	 * - Database connection issues
	 * - User creation constraints failed
	 * - System resource limitations
	 *
	 * ## How to resolve
	 *
	 * - Check database connectivity and permissions
	 * - Review server logs for specific error details
	 * - Ensure the database schema supports anonymous users
	 */
	FAILED_TO_CREATE_USER: "Failed to create user",
	/**
	 * @description This error occurs when the system successfully creates an anonymous user but fails to establish a session.
	 *
	 * ## Common Causes
	 *
	 * - Session store is unavailable or full
	 * - Database session table constraints failed
	 * - Session creation timeout
	 *
	 * ## How to resolve
	 *
	 * - Check session store connectivity
	 * - Verify session configuration is correct
	 * - Review server logs for session creation errors
	 */
	COULD_NOT_CREATE_SESSION: "Could not create session",
	/**
	 * @description This error prevents an already authenticated anonymous user from signing in anonymously again, which would create duplicate accounts.
	 *
	 * ## Common Causes
	 *
	 * - User already has an active anonymous session
	 * - Attempting to create another anonymous account while logged in
	 * - Client code doesn't check for existing session before anonymous sign-in
	 *
	 * ## How to resolve
	 *
	 * - Sign out the current anonymous user before creating a new one
	 * - Check if a session exists before attempting anonymous sign-in
	 * - Use the existing anonymous session instead of creating a new one
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Check for existing session first
	 * const session = await client.auth.getSession();
	 * if (!session) {
	 *   await client.auth.signIn.anonymous();
	 * }
	 * ```
	 */
	ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
		"Anonymous users cannot sign in again anonymously",
	/**
	 * @description This error occurs when attempting to delete an anonymous user account but the operation fails.
	 *
	 * ## Common Causes
	 *
	 * - Database deletion constraints failed
	 * - Related data prevents deletion (foreign key constraints)
	 * - User has been converted to a regular user
	 *
	 * ## How to resolve
	 *
	 * - Check database logs for constraint violations
	 * - Ensure cascading deletes are properly configured
	 * - Verify the user is still marked as anonymous
	 */
	FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user",
	/**
	 * @description This error occurs when attempting to perform an anonymous-user-specific operation on a regular user account.
	 *
	 * ## Common Causes
	 *
	 * - User was converted from anonymous to regular user
	 * - Attempting to delete a regular user through anonymous deletion endpoint
	 * - User ID belongs to a non-anonymous account
	 *
	 * ## How to resolve
	 *
	 * - Verify the user is actually an anonymous user
	 * - Use regular user deletion methods for non-anonymous users
	 * - Check if the user has been upgraded from anonymous status
	 */
	USER_IS_NOT_ANONYMOUS: "User is not anonymous",
	/**
	 * @description This error occurs when anonymous user deletion is attempted but the feature is disabled in the configuration.
	 *
	 * ## Common Causes
	 *
	 * - Anonymous user deletion is disabled in Better Auth configuration
	 * - Security policy prevents automatic anonymous user cleanup
	 * - Feature is restricted by admin settings
	 *
	 * ## How to resolve
	 *
	 * - Enable anonymous user deletion in your Better Auth configuration
	 * - Use admin tools to delete anonymous users if available
	 * - Contact system administrators to enable the feature
	 */
	DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled",
});
