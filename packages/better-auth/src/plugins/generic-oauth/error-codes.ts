import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const GENERIC_OAUTH_ERROR_CODES = defineErrorCodes({
	/**
 * @description This error occurs when the OAuth provider configuration is invalid, incomplete, or improperly formatted.
 *
 * ## Common Causes
 *
 * - Missing required OAuth configuration fields (clientId, clientSecret, endpoints)
 * - Malformed provider configuration object
 * - Invalid provider type or unsupported OAuth version
 *
 * ## How to resolve
 *
 * - Verify all required OAuth configuration fields are provided
 * - Check the provider documentation for correct configuration format
 * - Ensure clientId, clientSecret, and authorization/token URLs are valid
 *
 * ## Example
 *
 * ```typescript
 * // Correct OAuth configuration
 * genericOAuth({
 *   providerId: "custom",
 *   clientId: "your-client-id",
 *   clientSecret: "your-client-secret",
 *   authorizationUrl: "https://provider.com/oauth/authorize",
 *   tokenUrl: "https://provider.com/oauth/token"
 * })
 * ```
 */
	INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
	/**
 * @description This error occurs when the OAuth configuration is missing the token endpoint URL, which is required to exchange authorization codes for access tokens.
 *
 * ## Common Causes
 *
 * - Token URL is not specified in the OAuth provider configuration
 * - Configuration object is incomplete
 * - Using a provider that doesn't follow standard OAuth 2.0 flow
 *
 * ## How to resolve
 *
 * - Add the tokenUrl field to your OAuth configuration
 * - Consult the OAuth provider's documentation for the correct token endpoint
 * - Ensure you're using the correct OAuth 2.0 flow for the provider
 *
 * ## Example
 *
 * ```typescript
 * // Include tokenUrl in configuration
 * genericOAuth({
 *   providerId: "custom",
 *   tokenUrl: "https://provider.com/oauth/token" // Required
 * })
 * ```
 */
	TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.",
	/**
 * @description This error occurs when attempting to use an OAuth provider that hasn't been configured in the system.
 *
 * ## Common Causes
 *
 * - Provider ID doesn't match any configured providers
 * - Typo in the provider ID
 * - Provider configuration was not included in the auth setup
 *
 * ## How to resolve
 *
 * - Verify the provider ID matches your configuration
 * - Check for typos in the provider identifier
 * - Ensure the provider is properly configured in your Better Auth setup
 *
 * ## Example
 *
 * ```typescript
 * // Ensure provider is configured
 * auth({
 *   socialProviders: {
 *     genericOAuth({
 *       providerId: "custom-provider" // Must match the ID used in sign-in
 *     })
 *   }
 * })
 * ```
 */
	PROVIDER_CONFIG_NOT_FOUND: "No config found for provider",
	/**
 * @description This error occurs when attempting an OAuth operation without specifying which provider to use.
 *
 * ## Common Causes
 *
 * - providerId parameter is missing from the request
 * - Empty or null providerId value
 * - Client code doesn't specify which OAuth provider to use
 *
 * ## How to resolve
 *
 * - Include the providerId parameter in your OAuth request
 * - Ensure providerId is a non-empty string
 * - Specify which configured provider to use for authentication
 *
 * ## Example
 *
 * ```typescript
 * // Always specify the provider ID
 * await client.auth.signIn.oauth({ providerId: "custom-provider" });
 * ```
 */
	PROVIDER_ID_REQUIRED: "Provider ID is required",
	/**
 * @description This error occurs when the OAuth configuration for a generic provider is invalid or incomplete.
 *
 * ## Common Causes
 *
 * - Required configuration fields are missing
 * - Invalid URL formats for endpoints
 * - Incorrect OAuth flow type specified
 *
 * ## How to resolve
 *
 * - Review the complete OAuth configuration
 * - Validate all URL endpoints are properly formatted
 * - Ensure all required fields for the OAuth flow are present
 */
	INVALID_OAUTH_CONFIG: "Invalid OAuth configuration.",
	/**
 * @description This error occurs when attempting an OAuth operation that requires an authenticated session but none exists.
 *
 * ## Common Causes
 *
 * - Linking OAuth account requires user to be signed in first
 * - Session expired before completing OAuth flow
 * - User is not authenticated when trying to connect OAuth provider
 *
 * ## How to resolve
 *
 * - Ensure user is signed in before linking OAuth accounts
 * - Re-authenticate the user if session has expired
 * - Use the link flow instead of sign-in flow for adding providers
 *
 * ## Example
 *
 * ```typescript
 * // Link OAuth account to existing session
 * const session = await client.auth.getSession();
 * if (session) {
 *   await client.auth.linkOAuth({ providerId: "custom-provider" });
 * }
 * ```
 */
	SESSION_REQUIRED: "Session is required",
	/**
 * @description This error indicates an OAuth issuer mismatch as defined in RFC 9207, where the authorization server's issuer doesn't match the expected value. This is a security validation to prevent authorization server mix-up attacks.
 *
 * ## Common Causes
 *
 * - Authorization server returned a different issuer than configured
 * - DNS or routing issues causing requests to hit wrong server
 * - Provider changed their issuer identifier without notice
 * - Man-in-the-middle attack attempting to substitute different issuer
 *
 * ## How to resolve
 *
 * - Verify the issuer configuration matches the provider's current value
 * - Check with the OAuth provider for any recent changes to their issuer
 * - Ensure network routing is directing to the correct authorization server
 * - Update your configuration if the provider legitimately changed issuer
 *
 * ## Example
 *
 * ```typescript
 * // Issuer must match in configuration and response
 * genericOAuth({
 *   providerId: "custom",
 *   issuer: "https://auth.provider.com" // Must match actual issuer
 * })
 * ```
 */
	ISSUER_MISMATCH:
		"OAuth issuer mismatch. The authorization server issuer does not match the expected value (RFC 9207).",
	/**
 * @description This error indicates the authorization server failed to include the required issuer (iss) parameter as mandated by RFC 9207. This parameter is a security feature to prevent mix-up attacks.
 *
 * ## Common Causes
 *
 * - Authorization server doesn't support RFC 9207
 * - Provider hasn't implemented issuer parameter
 * - Using an older OAuth implementation that predates RFC 9207
 * - Provider configuration is incomplete
 *
 * ## How to resolve
 *
 * - Contact the OAuth provider about RFC 9207 compliance
 * - Check if there's a configuration flag to enable issuer parameter
 * - Consider disabling issuer validation if working with legacy providers (not recommended)
 * - Use a different OAuth provider that supports RFC 9207
 */
	ISSUER_MISSING:
		"OAuth issuer parameter missing. The authorization server did not include the required iss parameter (RFC 9207).",
});
