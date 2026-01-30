import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const API_KEY_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when the metadata parameter is provided but is not an object or undefined.
	 *
	 * ## Common Causes
	 *
	 * - Passing a string, number, or other non-object type as metadata
	 * - Malformed JSON in metadata field
	 * - Client code passes incorrect data type
	 *
	 * ## How to resolve
	 *
	 * - Ensure metadata is an object: { key: "value" }
	 * - Pass undefined or omit the metadata parameter if not needed
	 * - Validate metadata type before making the request
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Correct usage
	 * await client.apiKey.create({ name: "my-key", metadata: { app: "mobile" } });
	 * // Incorrect - will throw error
	 * await client.apiKey.create({ name: "my-key", metadata: "invalid" });
	 * ```
	 */
	INVALID_METADATA_TYPE: "metadata must be an object or undefined",
	/**
	 * @description This error occurs when refillInterval is provided but refillAmount is missing for rate-limited API keys.
	 *
	 * ## Common Causes
	 *
	 * - Configuring rate limit with only refillInterval
	 * - Forgetting to specify how many requests to refill
	 * - Incomplete rate limit configuration
	 *
	 * ## How to resolve
	 *
	 * - Provide both refillInterval and refillAmount together
	 * - Specify how many API calls should be refilled per interval
	 * - Example: { refillInterval: "1h", refillAmount: 100 }
	 */
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount is required when refillInterval is provided",
	/**
	 * @description This error occurs when refillAmount is provided but refillInterval is missing for rate-limited API keys.
	 *
	 * ## Common Causes
	 *
	 * - Configuring rate limit with only refillAmount
	 * - Forgetting to specify the refill time interval
	 * - Incomplete rate limit configuration
	 *
	 * ## How to resolve
	 *
	 * - Provide both refillInterval and refillAmount together
	 * - Specify the time interval for refilling API calls
	 * - Example: { refillInterval: "1h", refillAmount: 100 }
	 */
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval is required when refillAmount is provided",
	/**
	 * @description This error occurs when an API key is used by a banned user account.
	 *
	 * ## Common Causes
	 *
	 * - User account associated with the API key has been banned
	 * - Terms of service violation led to account suspension
	 * - Security incident resulted in account ban
	 *
	 * ## How to resolve
	 *
	 * - Contact support to understand the reason for the ban
	 * - Appeal the ban if issued in error
	 * - Create a new account and API key after resolving the issue
	 */
	USER_BANNED: "User is banned",
	/**
	 * @description This error occurs when attempting an API key operation without valid authentication or with an invalid session.
	 *
	 * ## Common Causes
	 *
	 * - Session token is expired or invalid
	 * - User is not authenticated
	 * - Session cookie is missing or corrupted
	 *
	 * ## How to resolve
	 *
	 * - Ensure user is signed in before managing API keys
	 * - Refresh the authentication session
	 * - Re-authenticate the user
	 */
	UNAUTHORIZED_SESSION: "Unauthorized or invalid session",
	/**
	 * @description This error occurs when attempting to access or modify an API key that doesn't exist in the system.
	 *
	 * ## Common Causes
	 *
	 * - API key was deleted
	 * - Incorrect API key ID provided
	 * - API key belongs to a different user or organization
	 *
	 * ## How to resolve
	 *
	 * - Verify the API key ID is correct
	 * - Check if the key has been deleted
	 * - Ensure you have access to this API key
	 * - Create a new API key if needed
	 */
	KEY_NOT_FOUND: "API Key not found",
	/**
	 * @description This error occurs when attempting to use an API key that has been disabled.
	 *
	 * ## Common Causes
	 *
	 * - API key was manually disabled by the owner
	 * - Security incident led to key deactivation
	 * - Key was temporarily suspended
	 *
	 * ## How to resolve
	 *
	 * - Re-enable the API key through the management interface
	 * - Create a new API key if the old one should remain disabled
	 * - Contact support if you don't have permission to enable it
	 */
	KEY_DISABLED: "API Key is disabled",
	/**
	 * @description This error occurs when attempting to use an API key that has passed its expiration date.
	 *
	 * ## Common Causes
	 *
	 * - API key's expiration date has passed
	 * - Key was created with a short expiration period
	 * - Key hasn't been renewed before expiration
	 *
	 * ## How to resolve
	 *
	 * - Create a new API key to replace the expired one
	 * - Update your application with the new key
	 * - Consider setting longer expiration periods for future keys
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Set expiration when creating a key
	 * await client.apiKey.create({ name: "my-key", expiresIn: "90d" });
	 * ```
	 */
	KEY_EXPIRED: "API Key has expired",
	/**
	 * @description This error occurs when an API key has exhausted its allocated usage quota.
	 *
	 * ## Common Causes
	 *
	 * - All allocated API calls have been consumed
	 * - Rate limit exceeded for the current period
	 * - Usage quota is too low for application needs
	 *
	 * ## How to resolve
	 *
	 * - Wait for the rate limit to reset if refill is configured
	 * - Increase the usage quota for the API key
	 * - Create a new API key with higher limits
	 * - Optimize your application to make fewer API calls
	 */
	USAGE_EXCEEDED: "API Key has reached its usage limit",
	/**
	 * @description This error occurs when attempting to recover an API key that was created with non-recoverable settings.
	 *
	 * ## Common Causes
	 *
	 * - API key was created with recoverable: false
	 * - Security policy prevents key recovery
	 * - Key value is not stored in recoverable format
	 *
	 * ## How to resolve
	 *
	 * - Store the key securely when it's first created
	 * - Create a new API key if the original is lost
	 * - Enable recoverable option when creating future keys
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Create a recoverable key
	 * await client.apiKey.create({ name: "my-key", recoverable: true });
	 * ```
	 */
	KEY_NOT_RECOVERABLE: "API Key is not recoverable",
	/**
	 * @description This error occurs when the specified expiration time is below the configured minimum value.
	 *
	 * ## Common Causes
	 *
	 * - Attempting to create a key with very short expiration
	 * - expiresIn value is below system minimum (e.g., less than 1 hour)
	 * - Security policy enforces minimum key lifetime
	 *
	 * ## How to resolve
	 *
	 * - Use a longer expiration period that meets the minimum requirement
	 * - Check the system's minimum expiration configuration
	 * - Contact administrators if the minimum is too restrictive
	 */
	EXPIRES_IN_IS_TOO_SMALL:
		"The expiresIn is smaller than the predefined minimum value.",
	/**
	 * @description This error occurs when the specified expiration time exceeds the configured maximum value.
	 *
	 * ## Common Causes
	 *
	 * - Attempting to create a key with very long expiration
	 * - expiresIn value exceeds system maximum (e.g., more than 1 year)
	 * - Security policy enforces maximum key lifetime
	 *
	 * ## How to resolve
	 *
	 * - Use a shorter expiration period that meets the maximum requirement
	 * - Create keys with rolling expiration instead of one long-lived key
	 * - Contact administrators if you need extended expiration
	 */
	EXPIRES_IN_IS_TOO_LARGE:
		"The expiresIn is larger than the predefined maximum value.",
	/**
	 * @description This error occurs when the remaining usage count is outside the acceptable range.
	 *
	 * ## Common Causes
	 *
	 * - Setting negative remaining count
	 * - Remaining count exceeds maximum allowed value
	 * - Invalid number format for remaining count
	 *
	 * ## How to resolve
	 *
	 * - Ensure remaining count is a positive number
	 * - Check that the value is within configured limits
	 * - Use reasonable usage limits based on your plan
	 */
	INVALID_REMAINING: "The remaining count is either too large or too small.",
	/**
	 * @description This error occurs when the API key prefix length is outside the acceptable range.
	 *
	 * ## Common Causes
	 *
	 * - Custom prefix is too short or too long
	 * - Prefix length doesn't meet system requirements
	 * - Invalid prefix configuration
	 *
	 * ## How to resolve
	 *
	 * - Use default prefix length if unsure
	 * - Check the acceptable prefix length range in documentation
	 * - Typically prefixes are 4-8 characters
	 */
	INVALID_PREFIX_LENGTH: "The prefix length is either too large or too small.",
	/**
	 * @description This error occurs when the API key name length is outside the acceptable range.
	 *
	 * ## Common Causes
	 *
	 * - Name is too short (e.g., less than 3 characters)
	 * - Name is too long (e.g., more than 100 characters)
	 * - Empty name provided
	 *
	 * ## How to resolve
	 *
	 * - Use a descriptive name between 3-100 characters
	 * - Avoid very short or very long names
	 * - Ensure the name is not empty
	 */
	INVALID_NAME_LENGTH: "The name length is either too large or too small.",
	/**
	 * @description This error occurs when attempting to use metadata functionality but it's disabled in the configuration.
	 *
	 * ## Common Causes
	 *
	 * - Metadata feature is disabled in Better Auth configuration
	 * - System policy prevents metadata storage
	 * - Feature is restricted by plan or permissions
	 *
	 * ## How to resolve
	 *
	 * - Enable metadata in your Better Auth configuration
	 * - Omit metadata from your API key requests
	 * - Upgrade your plan if metadata is a paid feature
	 */
	METADATA_DISABLED: "Metadata is disabled.",
	/**
	 * @description This error occurs when too many API requests are made in a short time period.
	 *
	 * ## Common Causes
	 *
	 * - Application is making requests too frequently
	 * - Rate limit threshold is reached
	 * - Multiple clients using the same API key
	 *
	 * ## How to resolve
	 *
	 * - Implement exponential backoff in your application
	 * - Wait for the rate limit to reset
	 * - Reduce request frequency or batch operations
	 * - Request higher rate limits if needed
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Implement retry with backoff
	 * async function retryWithBackoff(fn, maxRetries = 3) {
	 *   for (let i = 0; i < maxRetries; i++) {
	 *     try { return await fn(); }
	 *     catch (e) { if (e.code === "RATE_LIMIT_EXCEEDED") await delay(2 ** i * 1000); }
	 *   }
	 * }
	 * ```
	 */
	RATE_LIMIT_EXCEEDED: "Rate limit exceeded.",
	/**
	 * @description This error occurs when attempting to update an API key but no fields are provided for update.
	 *
	 * ## Common Causes
	 *
	 * - Update request sent with empty data object
	 * - All provided values are identical to current values
	 * - Request body is missing or malformed
	 *
	 * ## How to resolve
	 *
	 * - Ensure at least one field is provided in the update request
	 * - Verify the request includes values to change
	 * - Check that the update payload is properly formatted
	 */
	NO_VALUES_TO_UPDATE: "No values to update.",
	/**
	 * @description This error occurs when attempting to set custom expiration values but the feature is disabled.
	 *
	 * ## Common Causes
	 *
	 * - Custom expiration is disabled in configuration
	 * - System uses predefined expiration periods only
	 * - Security policy prevents custom expirations
	 *
	 * ## How to resolve
	 *
	 * - Enable custom expiration in your Better Auth configuration
	 * - Use predefined expiration periods if available
	 * - Contact administrators to enable the feature
	 */
	KEY_DISABLED_EXPIRATION: "Custom key expiration values are disabled.",
	/**
	 * @description This error occurs when the provided API key format is invalid or cannot be verified.
	 *
	 * ## Common Causes
	 *
	 * - API key is malformed or corrupted
	 * - Using a revoked or deleted key
	 * - Incorrect key format (missing prefix or checksum)
	 * - Key was modified or truncated
	 *
	 * ## How to resolve
	 *
	 * - Verify you're using the complete API key
	 * - Check for any whitespace or special characters
	 * - Generate a new API key if the current one is invalid
	 * - Ensure the key matches the format: prefix_secretpart
	 */
	INVALID_API_KEY: "Invalid API key.",
	/**
	 * @description This error occurs when the user ID extracted from the API key is invalid or doesn't exist.
	 *
	 * ## Common Causes
	 *
	 * - User account associated with the key has been deleted
	 * - API key data is corrupted
	 * - User ID in key doesn't match any existing user
	 *
	 * ## How to resolve
	 *
	 * - Verify the user account still exists
	 * - Generate a new API key for the current user
	 * - Check for database integrity issues
	 */
	INVALID_USER_ID_FROM_API_KEY: "The user id from the API key is invalid.",
	/**
	 * @description This error occurs when a custom API key getter function returns a value that is not a string.
	 *
	 * ## Common Causes
	 *
	 * - Custom getter returns null, undefined, or object
	 * - Implementation error in custom key extraction logic
	 * - Type mismatch in getter return value
	 *
	 * ## How to resolve
	 *
	 * - Ensure your custom getter always returns a string
	 * - Add type checking in your getter implementation
	 * - Return empty string instead of null/undefined if key is not found
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Correct getter implementation
	 * getAPIKey: (context) => {
	 *   return context.headers.get("x-api-key") || "";
	 * }
	 * ```
	 */
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API Key getter returned an invalid key type. Expected string.",
	/**
	 * @description This error occurs when attempting to modify a property that can only be set from the server auth instance, not from the client.
	 *
	 * ## Common Causes
	 *
	 * - Trying to set sensitive properties from client-side code
	 * - Attempting to modify server-only configuration
	 * - Security restriction prevents client-side modification
	 *
	 * ## How to resolve
	 *
	 * - Move this operation to server-side code
	 * - Use the server auth instance instead of client
	 * - Check which properties are client-accessible in documentation
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Server-side only
	 * import { auth } from "./auth-server";
	 * await auth.api.updateAPIKey({ keyId, serverOnlyProperty: value });
	 * ```
	 */
	SERVER_ONLY_PROPERTY:
		"The property you're trying to set can only be set from the server auth instance only.",
	/**
	 * @description This error occurs when an API key update operation fails due to database or validation issues.
	 *
	 * ## Common Causes
	 *
	 * - Database connection issues during update
	 * - Validation constraints failed
	 * - Concurrent update conflict
	 *
	 * ## How to resolve
	 *
	 * - Check database connectivity
	 * - Verify all update values are valid
	 * - Retry the operation
	 * - Review server logs for specific error details
	 */
	FAILED_TO_UPDATE_API_KEY: "Failed to update API key",
	/**
	 * @description This error occurs when attempting to create an API key without providing a required name.
	 *
	 * ## Common Causes
	 *
	 * - Name field is missing from the request
	 * - Name is provided as empty string
	 * - Request body is malformed
	 *
	 * ## How to resolve
	 *
	 * - Provide a descriptive name for the API key
	 * - Ensure name is a non-empty string
	 * - Include the name field in your request
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Correct usage
	 * await client.apiKey.create({ name: "Production API Key" });
	 * ```
	 */
	NAME_REQUIRED: "API Key name is required.",
});
