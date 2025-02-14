export interface OIDCOptions {
	/**
	 * The amount of time in seconds that the access token is valid for.
	 *
	 * @default 3600 (1 hour) - Recommended by the OIDC spec
	 */
	accessTokenExpiresIn?: number;
	/**
	 * Allow dynamic client registration.
	 */
	allowDynamicClientRegistration?: boolean;
	/**
	 * The metadata for the OpenID Connect provider.
	 */
	metadata?: Partial<OIDCMetadata>;
	/**
	 * The amount of time in seconds that the refresh token is valid for.
	 *
	 * @default 604800 (7 days) - Recommended by the OIDC spec
	 */
	refreshTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that the authorization code is valid for.
	 *
	 * @default 600 (10 minutes) - Recommended by the OIDC spec
	 */
	codeExpiresIn?: number;
	/**
	 * The scopes that the client is allowed to request.
	 *
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#ScopeClaims
	 * @default
	 * ```ts
	 * ["openid", "profile", "email", "offline_access"]
	 * ```
	 */
	scopes?: string[];
	/**
	 * The default scope to use if the client does not provide one.
	 *
	 * @default "openid"
	 */
	defaultScope?: string;
	/**
	 * A URL to the consent page where the user will be redirected if the client
	 * requests consent.
	 *
	 * After the user consents, they should be redirected by the client to the
	 * `redirect_uri` with the authorization code.
	 *
	 * When the server redirects the user to the consent page, it will include the
	 * following query parameters:
	 * authorization code.
	 * - `client_id` - The ID of the client.
	 * - `scope` - The requested scopes.
	 * - `code` - The authorization code.
	 *
	 * once the user consents, you need to call the `/oauth2/consent` endpoint
	 * with the code and `accept: true` to complete the authorization. Which will
	 * then return the client to the `redirect_uri` with the authorization code.
	 *
	 * @example
	 * ```ts
	 * consentPage: "/oauth/authorize"
	 * ```
	 */
	consentPage?: string;
	/**
	 * The HTML for the consent page. This is used if `consentPage` is not
	 * provided. This should be a function that returns an HTML string.
	 * The function will be called with the following props:
	 */
	getConsentHTML?: (props: {
		clientId: string;
		clientName: string;
		clientIcon?: string;
		clientMetadata: Record<string, any> | null;
		code: string;
		scopes: string[];
	}) => string;
	/**
	 * The URL to the login page. This is used if the client requests the `login`
	 * prompt.
	 */
	loginPage: string;
	/**
	 * Weather to require PKCE (proof key code exchange) or not
	 *
	 * According to OAuth2.1 spec this should be required. But in any
	 * case if you want to disable this you can use this options.
	 *
	 * @default true
	 */
	requirePKCE?: boolean;
	/**
	 * Allow plain to be used as a code challenge method.
	 *
	 * @default true
	 */
	allowPlainCodeChallengeMethod?: boolean;
	/**
	 * Custom function to generate a client ID.
	 */
	generateClientId?: () => string;
	/**
	 * Custom function to generate a client secret.
	 */
	generateClientSecret?: () => string;
}

export interface AuthorizationQuery {
	/**
	 * The response type. Must be 'code' or 'token'. Code is for authorization code flow, token is
	 * for implicit flow.
	 */
	response_type: "code" | "token";
	/**
	 * The redirect URI for the client. Must be one of the registered redirect URLs for the client.
	 */
	redirect_uri?: string;
	/**
	 * The scope of the request. Must be a space-separated list of case sensitive strings.
	 *
	 * - "openid" is required for all requests
	 * - "profile" is required for requests that require user profile information.
	 * - "email" is required for requests that require user email information.
	 * - "offline_access" is required for requests that require a refresh token.
	 */
	scope?: string;
	/**
	 * Opaque value used to maintain state between the request and the callback. Typically,
	 * Cross-Site Request Forgery (CSRF, XSRF) mitigation is done by cryptographically binding the
	 * value of this parameter with a browser cookie.
	 *
	 * Note: Better Auth stores the state in a database instead of a cookie. - This is to minimize
	 * the complication with native apps and other clients that may not have access to cookies.
	 */
	state: string;
	/**
	 * The client ID. Must be the ID of a registered client.
	 */
	client_id: string;
	/**
	 * The prompt parameter is used to specify the type of user interaction that is required.
	 */
	prompt?: "none" | "consent" | "login" | "select_account";
	/**
	 * The display parameter is used to specify how the authorization server displays the
	 * authentication and consent user interface pages to the end user.
	 */
	display?: "page" | "popup" | "touch" | "wap";
	/**
	 * End-User's preferred languages and scripts for the user interface, represented as a
	 * space-separated list of BCP47 [RFC5646] language tag values, ordered by preference. For
	 * instance, the value "fr-CA fr en" represents a preference for French as spoken in Canada,
	 * then French (without a region designation), followed by English (without a region
	 * designation).
	 *
	 * Better Auth does not support this parameter yet. It'll not throw an error if it's provided,
	 *
	 * 🏗️ currently not implemented
	 */
	ui_locales?: string;
	/**
	 * The maximum authentication age.
	 *
	 * Specifies the allowable elapsed time in seconds since the last time the End-User was
	 * actively authenticated by the provider. If the elapsed time is greater than this value, the
	 * provider MUST attempt to actively re-authenticate the End-User.
	 *
	 * Note that max_age=0 is equivalent to prompt=login.
	 */
	max_age?: number;
	/**
	 * Requested Authentication Context Class Reference values.
	 *
	 * Space-separated string that
	 * specifies the acr values that the Authorization Server is being requested to use for
	 * processing this Authentication Request, with the values appearing in order of preference.
	 * The Authentication Context Class satisfied by the authentication performed is returned as
	 * the acr Claim Value, as specified in Section 2. The acr Claim is requested as a Voluntary
	 * Claim by this parameter.
	 */
	acr_values?: string;
	/**
	 * Hint to the Authorization Server about the login identifier the End-User might use to log in
	 * (if necessary). This hint can be used by an RP if it first asks the End-User for their
	 * e-mail address (or other identifier) and then wants to pass that value as a hint to the
	 * discovered authorization service. It is RECOMMENDED that the hint value match the value used
	 * for discovery. This value MAY also be a phone number in the format specified for the
	 * phone_number Claim. The use of this parameter is left to the OP's discretion.
	 */
	login_hint?: string;
	/**
	 * ID Token previously issued by the Authorization Server being passed as a hint about the
	 * End-User's current or past authenticated session with the Client.
	 *
	 * 🏗️ currently not implemented
	 */
	id_token_hint?: string;
	/**
	 * Code challenge
	 */
	code_challenge?: string;
	/**
	 * Code challenge method used
	 */
	code_challenge_method?: "plain" | "s256";
}

export interface Client {
	/**
	 * Client ID
	 *
	 * size 32
	 *
	 * as described on https://www.rfc-editor.org/rfc/rfc6749.html#section-2.2
	 */
	clientId: string;
	/**
	 * Client Secret
	 *
	 * A secret for the client, if required by the authorization server.
	 *
	 * size 32
	 */
	clientSecret: string;
	/**
	 * The client type
	 *
	 * as described on https://www.rfc-editor.org/rfc/rfc6749.html#section-2.1
	 *
	 * - web - A web application
	 * - native - A mobile application
	 * - user-agent-based - A user-agent-based application
	 */
	type: "web" | "native" | "user-agent-based";
	/**
	 * List of registered redirect URLs. Must include the whole URL, including the protocol, port,
	 * and path.
	 *
	 * For example, `https://example.com/auth/callback`
	 */
	redirectURLs: string[];
	/**
	 * The name of the client.
	 */
	name: string;
	/**
	 * The icon of the client.
	 */
	icon?: string;
	/**
	 * Additional metadata about the client.
	 */
	metadata: {
		[key: string]: any;
	} | null;
	/**
	 * Whether the client is disabled or not.
	 */
	disabled: boolean;
}

export interface TokenBody {
	/**
	 * The grant type. Must be 'authorization_code' or 'refresh_token'.
	 */
	grant_type: "authorization_code" | "refresh_token";
	/**
	 * The authorization code received from the authorization server.
	 */
	code?: string;
	/**
	 * The redirect URI of the client.
	 */
	redirect_uri?: string;
	/**
	 * The client ID.
	 */
	client_id?: string;
	/**
	 * The client secret.
	 */
	client_secret?: string;
	/**
	 * The refresh token received from the authorization server.
	 */
	refresh_token?: string;
}

export interface CodeVerificationValue {
	/**
	 * The client ID
	 */
	clientId: string;
	/**
	 * The redirect URI for the client
	 */
	redirectURI: string;
	/**
	 * The scopes that the client requested
	 */
	scope: string[];
	/**
	 * The user ID
	 */
	userId: string;
	/**
	 * The time that the user authenticated
	 */
	authTime: number;
	/**
	 * Whether the user needs to consent to the scopes
	 * before the code can be exchanged for an access token.
	 *
	 * If this is true, then the code is treated as a consent
	 * request. Once the user consents, the code will be updated
	 * with the actual code.
	 */
	requireConsent: boolean;
	/**
	 * The state parameter from the request
	 *
	 * If the prompt is set to `consent`, then the state
	 * parameter is saved here. This is to prevent the client
	 * from using the code before the user consents.
	 */
	state: string | null;
	/**
	 * Code challenge
	 */
	codeChallenge?: string;
	/**
	 * Code Challenge Method
	 */
	codeChallengeMethod?: "sha256" | "plain";
}

export interface OAuthAccessToken {
	/**
	 * The access token
	 */
	accessToken: string;
	/**
	 * The refresh token
	 */
	refreshToken: string;
	/**
	 * The time that the access token expires
	 */
	accessTokenExpiresAt: Date;
	/**
	 * The time that the refresh token expires
	 */
	refreshTokenExpiresAt: Date;
	/**
	 * The client ID
	 */
	clientId: string;
	/**
	 * The user ID
	 */
	userId: string;
	/**
	 * The scopes that the access token has access to
	 */
	scopes: string;
}

export interface OIDCMetadata {
	/**
	 * The issuer identifier, this is the URL of the provider and can be used to verify
	 * the `iss` claim in the ID token.
	 *
	 * default: the base URL of the server (e.g. `https://example.com`)
	 */
	issuer: string;
	/**
	 * The URL of the authorization endpoint.
	 *
	 * @default `/oauth2/authorize`
	 */
	authorization_endpoint: string;
	/**
	 * The URL of the token endpoint.
	 *
	 * @default `/oauth2/token`
	 */
	token_endpoint: string;
	/**
	 * The URL of the userinfo endpoint.
	 *
	 * @default `/oauth2/userinfo`
	 */
	userInfo_endpoint: string;
	/**
	 * The URL of the jwks_uri endpoint.
	 *
	 * For JWKS to work, you must install the `jwt` plugin.
	 *
	 * This value is automatically set to `/jwks` if the `jwt` plugin is installed.
	 *
	 * @default `/jwks`
	 */
	jwks_uri: string;
	/**
	 * The URL of the dynamic client registration endpoint.
	 *
	 * @default `/oauth2/register`
	 */
	registration_endpoint: string;
	/**
	 * Supported scopes.
	 */
	scopes_supported: string[];
	/**
	 * Supported response types.
	 *
	 * only `code` is supported.
	 */
	response_types_supported: ["code"];
	/**
	 * Supported response modes.
	 *
	 * `query`: the authorization code is returned in the query string
	 *
	 * only `query` is supported.
	 */
	response_modes_supported: ["query"];
	/**
	 * Supported grant types.
	 *
	 * only `authorization_code` is supported.
	 */
	grant_types_supported: ["authorization_code"];
	/**
	 * acr_values supported.
	 *
	 * - `urn:mace:incommon:iap:silver`: Silver level of assurance
	 * - `urn:mace:incommon:iap:bronze`: Bronze level of assurance
	 *
	 * only `urn:mace:incommon:iap:silver` and `urn:mace:incommon:iap:bronze` are supported.
	 *
	 *
	 * @default
	 * ["urn:mace:incommon:iap:silver", "urn:mace:incommon:iap:bronze"]
	 * @see https://incommon.org/federation/attributes.html
	 */
	acr_values_supported: string[];
	/**
	 * Supported subject types.
	 *
	 * pairwise: the subject identifier is unique to the client
	 * public: the subject identifier is unique to the server
	 *
	 * only `public` is supported.
	 */
	subject_types_supported: ["public"];
	/**
	 * Supported ID token signing algorithms.
	 *
	 * only `RS256` and `none` are supported.
	 *
	 * @default
	 * ["RS256", "none"]
	 */
	id_token_signing_alg_values_supported: ("RS256" | "none")[];
	/**
	 * Supported token endpoint authentication methods.
	 *
	 * only `client_secret_basic` and `client_secret_post` are supported.
	 *
	 * @default
	 * ["client_secret_basic", "client_secret_post"]
	 */
	token_endpoint_auth_methods_supported: [
		"client_secret_basic",
		"client_secret_post",
	];
	/**
	 * Supported claims.
	 *
	 * @default
	 * ["sub", "iss", "aud", "exp", "nbf", "iat", "jti", "email", "email_verified", "name"]
	 */
	claims_supported: string[];
}
