import { defineErrorCodes } from "../utils/error-codes";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		/**
		 * This plugin does not exist, do not use it in runtime.
		 */
		"$internal:base": {
			creator: () => {
				$ERROR_CODES: typeof BASE_ERROR_CODES;
			};
		};
	}
}

export const BASE_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when attempting to access, modify, or authenticate a user that doesn't exist in the system.
	 *
	 * ## Common Causes
	 *
	 * - User ID is incorrect or invalid
	 * - User account was deleted
	 * - Email address is not registered
	 * - Database query returned no matching user
	 *
	 * ## How to resolve
	 *
	 * - Verify the user ID or email is correct
	 * - Check if the user account still exists
	 * - Create a new account if the user doesn't exist
	 * - Ensure you're querying the correct database/environment
	 */
	USER_NOT_FOUND: "User not found",
	/**
	 * @description This error occurs when the system fails to create a new user account due to database constraints, validation errors, or other system issues.
	 *
	 * ## Common Causes
	 *
	 * - Database connection issues
	 * - Invalid user data provided
	 * - Missing required fields in the user creation request
	 * - Duplicate email or username constraints
	 * - Database write permissions issue
	 *
	 * ## How to resolve
	 *
	 * - Verify all required user fields are provided and valid
	 * - Check database connectivity and permissions
	 * - Ensure the email/username is unique
	 * - Review server logs for specific error details
	 */
	FAILED_TO_CREATE_USER: "Failed to create user",
	/**
	 * @description This error occurs when the system successfully authenticates a user but fails to establish a session.
	 *
	 * ## Common Causes
	 *
	 * - Session store is unavailable or full
	 * - Database session table constraints failed
	 * - Session creation timeout
	 * - Redis or session storage connection issues
	 *
	 * ## How to resolve
	 *
	 * - Check session store connectivity
	 * - Verify session configuration is correct
	 * - Review server logs for session creation errors
	 * - Ensure session storage has sufficient capacity
	 */
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	/**
	 * @description This error occurs when attempting to update user information but the operation fails due to database or validation issues.
	 *
	 * ## Common Causes
	 *
	 * - Database connection issues during update
	 * - Validation constraints failed
	 * - Concurrent update conflict
	 * - User is trying to set a protected field
	 *
	 * ## How to resolve
	 *
	 * - Check database connectivity
	 * - Verify all update values are valid
	 * - Retry the operation
	 * - Review server logs for specific error details
	 */
	FAILED_TO_UPDATE_USER: "Failed to update user",
	/**
	 * @description This error occurs when the system fails to retrieve session information from the session store.
	 *
	 * ## Common Causes
	 *
	 * - Session store is unavailable
	 * - Database connection issues
	 * - Session data is corrupted
	 * - Session token is malformed
	 *
	 * ## How to resolve
	 *
	 * - Check session store connectivity
	 * - Verify session configuration
	 * - Re-authenticate to create a new session
	 * - Review server logs for specific error details
	 */
	FAILED_TO_GET_SESSION: "Failed to get session",
	/**
	 * @description This error occurs when the provided password is incorrect during authentication or password verification.
	 *
	 * ## Common Causes
	 *
	 * - User entered wrong password
	 * - Password was changed and old password is being used
	 * - Typo in password entry
	 *
	 * ## How to resolve
	 *
	 * - Verify the password is correct
	 * - Check for typos and correct capitalization
	 * - Use password reset if you forgot your password
	 * - Ensure Caps Lock is off
	 */
	INVALID_PASSWORD: "Invalid password",
	/**
	 * @description This error occurs when the provided email address doesn't conform to valid email format standards.
	 *
	 * ## Common Causes
	 *
	 * - Email format is incorrect (missing @, domain, etc.)
	 * - Contains invalid characters
	 * - Missing required parts of email address
	 * - Email validation failed
	 *
	 * ## How to resolve
	 *
	 * - Ensure email follows format: user@domain.com
	 * - Remove invalid characters
	 * - Verify email address is complete
	 * - Check for typos in the email address
	 */
	INVALID_EMAIL: "Invalid email",
	/**
	 * @description This error occurs when attempting to sign in with an email and password combination that doesn't match any account.
	 *
	 * ## Common Causes
	 *
	 * - Incorrect email address
	 * - Wrong password provided
	 * - Account doesn't exist with this email
	 * - Account uses different authentication method
	 *
	 * ## How to resolve
	 *
	 * - Verify both email and password are correct
	 * - Check for typos in email address
	 * - Use password reset if you forgot your password
	 * - Ensure you registered with email/password authentication
	 */
	INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
	/**
	 * @description This error occurs when a user object fails validation or contains invalid data.
	 *
	 * ## Common Causes
	 *
	 * - User data is missing required fields
	 * - User object structure is malformed
	 * - User data fails custom validation rules
	 * - Database returned corrupted user data
	 *
	 * ## How to resolve
	 *
	 * - Verify user data contains all required fields
	 * - Check user data structure matches expected schema
	 * - Review validation rules for user objects
	 * - Investigate database data integrity
	 */
	INVALID_USER: "Invalid user",
	/**
	 * @description This error occurs when attempting to link a social account (OAuth provider) that is already linked to the user's account or another account.
	 *
	 * ## Common Causes
	 *
	 * - Social account was already linked to this user
	 * - Social account is linked to a different user
	 * - Attempting to link the same provider twice
	 *
	 * ## How to resolve
	 *
	 * - Check if the social account is already linked
	 * - Unlink the social account from the other user if you own both accounts
	 * - Use a different social account
	 * - Contact support if you need to transfer the social account
	 */
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Social account already linked",
	/**
	 * @description This error occurs when attempting to use an OAuth or authentication provider that hasn't been configured or doesn't exist.
	 *
	 * ## Common Causes
	 *
	 * - Provider ID doesn't match any configured providers
	 * - Typo in the provider name
	 * - Provider was not included in the auth configuration
	 * - Provider plugin is not installed
	 *
	 * ## How to resolve
	 *
	 * - Verify the provider ID matches your configuration
	 * - Check for typos in the provider identifier
	 * - Ensure the provider is properly configured in your Better Auth setup
	 * - Install the required provider plugin
	 */
	PROVIDER_NOT_FOUND: "Provider not found",
	/**
	 * @description This error occurs when a token (verification, reset, access token) is invalid, malformed, or doesn't exist.
	 *
	 * ## Common Causes
	 *
	 * - Token was manually modified or corrupted
	 * - Token doesn't exist in the database
	 * - Token was already used and consumed
	 * - Malformed token string
	 *
	 * ## How to resolve
	 *
	 * - Request a new token
	 * - Ensure the complete token is being used
	 * - Check that the token hasn't been modified
	 * - Verify token was copied correctly without extra characters
	 */
	INVALID_TOKEN: "Invalid token",
	/**
	 * @description This error occurs when a token (verification, reset, session) has passed its expiration time and is no longer valid.
	 *
	 * ## Common Causes
	 *
	 * - Token wasn't used within the validity period
	 * - Email verification link is old
	 * - Password reset link expired (typically 1 hour)
	 * - Access token lifetime exceeded
	 *
	 * ## How to resolve
	 *
	 * - Request a new token
	 * - Complete the action more quickly after receiving tokens
	 * - Check email promptly for time-sensitive links
	 */
	TOKEN_EXPIRED: "Token expired",
	/**
	 * @description This error occurs when attempting to use ID token authentication with a provider or flow that doesn't support it.
	 *
	 * ## Common Causes
	 *
	 * - Provider doesn't support OpenID Connect
	 * - Trying to use ID token with OAuth 2.0-only provider
	 * - ID token is not available in the provider's response
	 *
	 * ## How to resolve
	 *
	 * - Use access token authentication instead
	 * - Check if the provider supports OpenID Connect
	 * - Configure the provider to return ID tokens
	 * - Use a different authentication method
	 */
	ID_TOKEN_NOT_SUPPORTED: "id_token not supported",
	/**
	 * @description This error occurs when the system fails to retrieve user information from an OAuth provider.
	 *
	 * ## Common Causes
	 *
	 * - OAuth provider's user info endpoint is unavailable
	 * - Access token is invalid or expired
	 * - Network connectivity issues
	 * - Provider API rate limit exceeded
	 *
	 * ## How to resolve
	 *
	 * - Retry the authentication flow
	 * - Check OAuth provider's service status
	 * - Verify access token is valid
	 * - Review server logs for detailed error information
	 */
	FAILED_TO_GET_USER_INFO: "Failed to get user info",
	/**
	 * @description This error occurs when the OAuth provider doesn't return an email address in the user information, but email is required.
	 *
	 * ## Common Causes
	 *
	 * - Provider doesn't share email by default
	 * - User didn't grant email permission
	 * - Email scope wasn't requested during OAuth
	 * - Provider account doesn't have an email associated
	 *
	 * ## How to resolve
	 *
	 * - Request email scope in OAuth configuration
	 * - Ensure user grants email permission during OAuth
	 * - Ask user to add email to their provider account
	 * - Configure provider to share email address
	 */
	USER_EMAIL_NOT_FOUND: "User email not found",
	/**
	 * @description This error occurs when attempting an operation that requires email verification but the user's email hasn't been verified yet.
	 *
	 * ## Common Causes
	 *
	 * - User created account but didn't verify email
	 * - Email verification link wasn't clicked
	 * - Verification email expired
	 * - System requires email verification for the operation
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
	 * @description This error occurs when the provided password is shorter than the minimum required length.
	 *
	 * ## Common Causes
	 *
	 * - Password has fewer characters than minimum (typically 8 characters)
	 * - Password length validation failed
	 * - Empty password provided
	 *
	 * ## How to resolve
	 *
	 * - Use a longer password that meets minimum length requirements
	 * - Typically passwords need at least 8 characters
	 * - Check the password requirements in documentation
	 */
	PASSWORD_TOO_SHORT: "Password too short",
	/**
	 * @description This error occurs when the provided password exceeds the maximum allowed length.
	 *
	 * ## Common Causes
	 *
	 * - Password has more characters than maximum (typically 128 characters)
	 * - Password length validation failed
	 * - Very long password string provided
	 *
	 * ## How to resolve
	 *
	 * - Use a shorter password that meets maximum length requirements
	 * - Typically passwords should be 128 characters or less
	 * - Check the password requirements in documentation
	 */
	PASSWORD_TOO_LONG: "Password too long",
	/**
	 * @description This error occurs when attempting to create an account with an email that already exists in the system.
	 *
	 * ## Common Causes
	 *
	 * - Email address was previously registered
	 * - Another user already has this email
	 * - Email was registered but account is inactive
	 *
	 * ## How to resolve
	 *
	 * - Use a different email address
	 * - Sign in with the existing account instead
	 * - Use account recovery if you forgot password
	 * - Contact support if you believe this is an error
	 */
	USER_ALREADY_EXISTS: "User already exists.",
	/**
	 * @description This error occurs when attempting to create an account with an email that already exists, with a suggestion to use another email.
	 *
	 * ## Common Causes
	 *
	 * - Email address is already registered
	 * - Duplicate account creation attempt
	 * - User forgot they already have an account
	 *
	 * ## How to resolve
	 *
	 * - Use a different email address
	 * - Sign in with the existing account
	 * - Use password reset if you can't access the account
	 */
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"User already exists. Use another email.",
	/**
	 * @description This error occurs when attempting to update a user's email address but the operation is not allowed or fails validation.
	 *
	 * ## Common Causes
	 *
	 * - Email updates are disabled in configuration
	 * - User doesn't have permission to update email
	 * - New email is already in use
	 * - Security policy prevents email changes
	 *
	 * ## How to resolve
	 *
	 * - Verify email updates are enabled in configuration
	 * - Use a different, unregistered email
	 * - Complete additional security verification if required
	 * - Contact support if you need to change your email
	 */
	EMAIL_CAN_NOT_BE_UPDATED: "Email can not be updated",
	/**
	 * @description This error occurs when attempting to access credential-based authentication for a user who doesn't have email/password credentials.
	 *
	 * ## Common Causes
	 *
	 * - User registered with OAuth/social login only
	 * - User never set a password
	 * - Credential account was deleted or unlinked
	 * - User only has third-party authentication methods
	 *
	 * ## How to resolve
	 *
	 * - Set a password for the account first
	 * - Use social login instead
	 * - Create credentials for the account
	 * - Link email/password authentication to the account
	 */
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Credential account not found",
	/**
	 * @description This error occurs when attempting an operation that requires a fresh session but the current session has expired.
	 *
	 * ## Common Causes
	 *
	 * - Session token expired due to inactivity
	 * - Session lifetime exceeded
	 * - Session was manually revoked
	 * - User was logged out
	 *
	 * ## How to resolve
	 *
	 * - Re-authenticate to create a new session
	 * - Sign in again to continue
	 * - Enable automatic session refresh if available
	 */
	SESSION_EXPIRED: "Session expired. Re-authenticate to perform this action.",
	/**
	 * @description This error prevents unlinking the last authentication method, which would leave the user unable to sign in.
	 *
	 * ## Common Causes
	 *
	 * - Attempting to unlink the only remaining authentication method
	 * - User only has one linked account
	 * - No other sign-in methods are available
	 *
	 * ## How to resolve
	 *
	 * - Link another authentication method before unlinking
	 * - Add email/password authentication before removing social login
	 * - Ensure you have at least one way to sign in
	 */
	FAILED_TO_UNLINK_LAST_ACCOUNT: "You can't unlink your last account",
	/**
	 * @description This error occurs when attempting to access or unlink an account connection that doesn't exist.
	 *
	 * ## Common Causes
	 *
	 * - Account ID is incorrect
	 * - Account was already unlinked
	 * - Account connection doesn't exist
	 * - Wrong provider specified
	 *
	 * ## How to resolve
	 *
	 * - Verify the account ID is correct
	 * - Check which accounts are currently linked
	 * - Ensure the provider matches an existing link
	 */
	ACCOUNT_NOT_FOUND: "Account not found",
	/**
	 * @description This error occurs when attempting to delete an account that has a password, requiring the password for confirmation.
	 *
	 * ## Common Causes
	 *
	 * - User has a password set and it's required for account deletion
	 * - Security policy requires password confirmation for deletion
	 * - Password not provided in deletion request
	 *
	 * ## How to resolve
	 *
	 * - Provide the current password when deleting the account
	 * - Confirm identity by entering password
	 * - Use password reset if you forgot your password
	 */
	USER_ALREADY_HAS_PASSWORD:
		"User already has a password. Provide that to delete the account.",
	/**
	 * @description This error occurs when a cross-site navigation login attempt is blocked as a potential CSRF (Cross-Site Request Forgery) attack.
	 *
	 * ## Common Causes
	 *
	 * - Login request originates from different domain
	 * - CSRF protection detected suspicious cross-origin request
	 * - Referrer header indicates potential attack
	 * - Request doesn't match expected origin
	 *
	 * ## How to resolve
	 *
	 * - Ensure login requests originate from the same domain
	 * - Check CORS configuration
	 * - Verify origin and referrer headers are correct
	 * - Use proper authentication flows for cross-domain scenarios
	 */
	CROSS_SITE_NAVIGATION_LOGIN_BLOCKED:
		"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
	/**
	 * @description This error occurs when attempting to send a verification email but the feature is not enabled in the configuration.
	 *
	 * ## Common Causes
	 *
	 * - Email verification is disabled in Better Auth configuration
	 * - Email provider is not configured
	 * - Verification feature is not enabled
	 *
	 * ## How to resolve
	 *
	 * - Enable email verification in your Better Auth configuration
	 * - Configure email service provider (SMTP, SendGrid, etc.)
	 * - Set up verification templates and settings
	 */
	VERIFICATION_EMAIL_NOT_ENABLED: "Verification email isn't enabled",
	/**
	 * @description This error occurs when attempting to verify an email that has already been verified.
	 *
	 * ## Common Causes
	 *
	 * - User clicked verification link multiple times
	 * - Email was already verified in a previous session
	 * - Verification token was reused
	 *
	 * ## How to resolve
	 *
	 * - No action needed, email is already verified
	 * - Proceed with using the account normally
	 * - Sign in if not already authenticated
	 */
	EMAIL_ALREADY_VERIFIED: "Email is already verified",
	/**
	 * @description This error occurs when the email in the request doesn't match the expected email for the operation.
	 *
	 * ## Common Causes
	 *
	 * - Email in verification token doesn't match provided email
	 * - User changed email after requesting verification
	 * - Wrong email provided in request
	 * - Token belongs to different email address
	 *
	 * ## How to resolve
	 *
	 * - Use the correct email address that the token was issued for
	 * - Request a new verification for the correct email
	 * - Check that you're using the right verification link
	 */
	EMAIL_MISMATCH: "Email mismatch",
	/**
	 * @description This error occurs when attempting a sensitive operation that requires a fresh authentication but the current session is not recent enough.
	 *
	 * ## Common Causes
	 *
	 * - Too much time has passed since last authentication
	 * - Operation requires recent login (e.g., changing password)
	 * - Session doesn't meet freshness requirements
	 * - Security policy requires re-authentication
	 *
	 * ## How to resolve
	 *
	 * - Re-authenticate to refresh the session
	 * - Sign in again to verify identity
	 * - Complete the operation shortly after signing in
	 */
	SESSION_NOT_FRESH: "Session is not fresh",
	/**
	 * @description This error occurs when attempting to link a social account that is already linked to this or another user account.
	 *
	 * ## Common Causes
	 *
	 * - Social account is already linked to the current user
	 * - Social account is linked to a different user
	 * - Attempting to link the same provider twice
	 *
	 * ## How to resolve
	 *
	 * - Check if the account is already linked
	 * - Unlink from other account if you own both accounts
	 * - Use a different social account
	 * - Contact support to resolve account conflicts
	 */
	LINKED_ACCOUNT_ALREADY_EXISTS: "Linked account already exists",
	/**
	 * @description This error occurs when the Origin header in the request doesn't match the allowed origins in the configuration.
	 *
	 * ## Common Causes
	 *
	 * - Request comes from unauthorized domain
	 * - Origin is not in the allowed origins list
	 * - CORS misconfiguration
	 * - Development environment using wrong origin
	 *
	 * ## How to resolve
	 *
	 * - Add the origin to allowed origins in configuration
	 * - Check CORS settings
	 * - Ensure requests come from authorized domains
	 * - Verify origin header is correctly set
	 */
	INVALID_ORIGIN: "Invalid origin",
	/**
	 * @description This error occurs when the callbackURL parameter is invalid, malformed, or not in the allowed list.
	 *
	 * ## Common Causes
	 *
	 * - Callback URL is not properly formatted
	 * - URL is not in the allowed callback list
	 * - Malformed URL string
	 * - URL points to unauthorized domain
	 *
	 * ## How to resolve
	 *
	 * - Ensure callback URL is properly formatted
	 * - Add callback URL to allowed list in configuration
	 * - Use only authorized callback URLs
	 * - Verify URL protocol (http/https) is correct
	 */
	INVALID_CALLBACK_URL: "Invalid callbackURL",
	/**
	 * @description This error occurs when the redirectURL parameter is invalid or not in the allowed list.
	 *
	 * ## Common Causes
	 *
	 * - Redirect URL is malformed
	 * - URL is not in the allowed redirect list
	 * - URL points to unauthorized domain
	 * - Invalid URL format
	 *
	 * ## How to resolve
	 *
	 * - Ensure redirect URL is properly formatted
	 * - Add redirect URL to allowed list in configuration
	 * - Use only authorized redirect URLs
	 * - Verify URL is complete and valid
	 */
	INVALID_REDIRECT_URL: "Invalid redirectURL",
	/**
	 * @description This error occurs when the errorCallbackURL parameter is invalid or not authorized.
	 *
	 * ## Common Causes
	 *
	 * - Error callback URL is malformed
	 * - URL is not in the allowed list
	 * - URL points to unauthorized domain
	 * - Invalid URL format
	 *
	 * ## How to resolve
	 *
	 * - Ensure error callback URL is properly formatted
	 * - Add URL to allowed list in configuration
	 * - Use only authorized error callback URLs
	 * - Verify URL is complete and valid
	 */
	INVALID_ERROR_CALLBACK_URL: "Invalid errorCallbackURL",
	/**
	 * @description This error occurs when the newUserCallbackURL parameter is invalid or not authorized.
	 *
	 * ## Common Causes
	 *
	 * - New user callback URL is malformed
	 * - URL is not in the allowed list
	 * - URL points to unauthorized domain
	 * - Invalid URL format
	 *
	 * ## How to resolve
	 *
	 * - Ensure new user callback URL is properly formatted
	 * - Add URL to allowed list in configuration
	 * - Use only authorized callback URLs
	 * - Verify URL is complete and valid
	 */
	INVALID_NEW_USER_CALLBACK_URL: "Invalid newUserCallbackURL",
	/**
	 * @description This error occurs when the Origin header is missing or has a null value in the request.
	 *
	 * ## Common Causes
	 *
	 * - Browser doesn't send Origin header
	 * - Request is from non-browser client
	 * - Origin header was stripped by proxy
	 * - Cross-origin request without proper headers
	 *
	 * ## How to resolve
	 *
	 * - Ensure requests include Origin header
	 * - Configure proxy to preserve Origin header
	 * - Use appropriate CORS settings
	 * - Check that client is sending required headers
	 */
	MISSING_OR_NULL_ORIGIN: "Missing or null Origin",
	/**
	 * @description This error occurs when a required callbackURL parameter is missing from the request.
	 *
	 * ## Common Causes
	 *
	 * - Callback URL parameter was not provided
	 * - Required parameter missing in request
	 * - API call doesn't include callback URL
	 *
	 * ## How to resolve
	 *
	 * - Include callbackURL parameter in the request
	 * - Ensure all required parameters are provided
	 * - Check API documentation for required parameters
	 */
	CALLBACK_URL_REQUIRED: "callbackURL is required",
	/**
	 * @description This error occurs when the system fails to create a verification record due to database or system issues.
	 *
	 * ## Common Causes
	 *
	 * - Database connection issues
	 * - Verification table constraints failed
	 * - System resource limitations
	 * - Database write permissions issue
	 *
	 * ## How to resolve
	 *
	 * - Retry the verification request
	 * - Check database connectivity
	 * - Review server logs for specific error details
	 * - Ensure verification table exists and is accessible
	 */
	FAILED_TO_CREATE_VERIFICATION: "Unable to create verification",
	/**
	 * @description This error occurs when attempting to set a field that is protected or not allowed to be modified directly.
	 *
	 * ## Common Causes
	 *
	 * - Trying to set a system-managed field
	 * - Field is marked as read-only
	 * - Security restriction prevents field modification
	 * - Field can only be set by system processes
	 *
	 * ## How to resolve
	 *
	 * - Remove the protected field from your update request
	 * - Use appropriate API methods for protected fields
	 * - Check which fields are allowed to be set
	 * - Use system-provided methods to modify protected data
	 */
	FIELD_NOT_ALLOWED: "Field not allowed to be set",
	/**
	 * @description This error occurs when async validation is used in a context where it's not supported.
	 *
	 * ## Common Causes
	 *
	 * - Using async validation in synchronous validation context
	 * - Async validation not supported by the field validator
	 * - Configuration doesn't support async validation
	 *
	 * ## How to resolve
	 *
	 * - Use synchronous validation instead
	 * - Move async validation to appropriate hooks
	 * - Check if the field supports async validation
	 * - Refactor validation to use supported methods
	 */
	ASYNC_VALIDATION_NOT_SUPPORTED: "Async validation is not supported",
	/**
	 * @description This error occurs when data validation fails, indicating that the provided data doesn't meet the required constraints.
	 *
	 * ## Common Causes
	 *
	 * - Data doesn't match expected format
	 * - Required validation rules failed
	 * - Field values are out of acceptable range
	 * - Custom validation rules were not satisfied
	 *
	 * ## How to resolve
	 *
	 * - Check validation error details for specific issues
	 * - Ensure data meets all validation requirements
	 * - Verify field formats match expected patterns
	 * - Review validation rules in documentation
	 */
	VALIDATION_ERROR: "Validation Error",
	/**
	 * @description This error occurs when a required field is missing from the request.
	 *
	 * ## Common Causes
	 *
	 * - Required parameter was not provided
	 * - Field value is null or undefined
	 * - Request body is incomplete
	 * - Missing mandatory field in form submission
	 *
	 * ## How to resolve
	 *
	 * - Include all required fields in the request
	 * - Check which fields are mandatory
	 * - Ensure field values are not null or undefined
	 * - Review API documentation for required parameters
	 */
	MISSING_FIELD: "Field is required",
	/**
	 * @description This error occurs when using POST method for session operations but deferSessionRefresh is not enabled in the session configuration.
	 *
	 * ## Common Causes
	 *
	 * - POST method used without deferSessionRefresh enabled
	 * - Session configuration doesn't support POST method
	 * - Attempting to manually refresh session without proper config
	 *
	 * ## How to resolve
	 *
	 * - Enable deferSessionRefresh in session configuration
	 * - Use GET method instead if POST is not required
	 * - Update session configuration to support manual refresh
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Enable deferred session refresh
	 * auth({
	 *   session: {
	 *     deferSessionRefresh: true
	 *   }
	 * })
	 * ```
	 */
	METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED:
		"POST method requires deferSessionRefresh to be enabled in session config",
	/**
	 * @description This error occurs when the request body is expected to be an object but a different type was provided.
	 *
	 * ## Common Causes
	 *
	 * - Body is a string, array, or primitive instead of object
	 * - JSON parsing resulted in non-object type
	 * - Malformed request body
	 * - Content-Type header is incorrect
	 *
	 * ## How to resolve
	 *
	 * - Ensure request body is a valid JSON object
	 * - Check Content-Type header is set to application/json
	 * - Verify JSON structure is correct
	 * - Wrap data in an object if needed
	 */
	BODY_MUST_BE_AN_OBJECT: "Body must be an object",
	/**
	 * @description This error occurs when attempting to set a password for a user who already has a password configured.
	 *
	 * ## Common Causes
	 *
	 * - User already has a password set
	 * - Attempting to set initial password when one exists
	 * - Trying to use password setup flow for existing password
	 *
	 * ## How to resolve
	 *
	 * - Use password change/update flow instead
	 * - Provide current password when updating
	 * - Use password reset flow if needed
	 * - Check if password exists before attempting to set
	 */
	PASSWORD_ALREADY_SET: "User already has a password set",
});

export type APIErrorCode = keyof typeof BASE_ERROR_CODES;
