/**
 * Supported grant types of the token endpoint
 */
export type GrantType =
	| "authorization_code"
	// | "implicit" // NEVER SUPPORT - depreciated in oAuth2.1
	// | "password" // NEVER SUPPORT - depreciated in oAuth2.1
	| "client_credentials"
	| "refresh_token";
// | "urn:ietf:params:oauth:grant-type:device_code" // specified in oAuth2.1 but yet implemented
// | "urn:ietf:params:oauth:grant-type:jwt-bearer" | // unspecified in oAuth2.1
// | "urn:ietf:params:oauth:grant-type:saml2-bearer" // unspecified in oAuth2.1
