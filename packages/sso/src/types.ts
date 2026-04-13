import type { Awaitable, OAuth2Tokens, User } from "better-auth";
import type { AlgorithmValidationOptions } from "./saml/algorithms";

export interface OIDCMapping {
	id?: string | undefined;
	email?: string | undefined;
	emailVerified?: string | undefined;
	name?: string | undefined;
	image?: string | undefined;
	extraFields?: Record<string, string> | undefined;
}

export interface SAMLMapping {
	id?: string | undefined;
	email?: string | undefined;
	emailVerified?: string | undefined;
	name?: string | undefined;
	firstName?: string | undefined;
	lastName?: string | undefined;
	extraFields?: Record<string, string> | undefined;
}

export interface OIDCConfig {
	issuer: string;
	pkce: boolean;
	clientId: string;
	/** Required for client_secret_basic/client_secret_post. Optional for private_key_jwt. */
	clientSecret?: string;
	authorizationEndpoint?: string | undefined;
	discoveryEndpoint: string;
	userInfoEndpoint?: string | undefined;
	scopes?: string[] | undefined;
	overrideUserInfo?: boolean | undefined;
	tokenEndpoint?: string | undefined;
	tokenEndpointAuthentication?:
		| ("client_secret_post" | "client_secret_basic" | "private_key_jwt")
		| undefined;
	/** Key ID for private_key_jwt key resolution */
	privateKeyId?: string | undefined;
	/** Signing algorithm for private_key_jwt. @default "RS256" */
	privateKeyAlgorithm?: string | undefined;
	jwksEndpoint?: string | undefined;
	mapping?: OIDCMapping | undefined;
}

export interface SAMLConfig {
	/**
	 * SP Entity ID. Used as the `entityID` in SP metadata when
	 * `spMetadata.entityID` is not set. Also used as the expected
	 * audience for SAML assertion validation when `audience` is not set.
	 */
	issuer: string;
	/**
	 * IdP SSO URL. Used as the redirect destination when
	 * `idpMetadata.metadata` is not provided. Ignored when
	 * IdP metadata XML is set (the SSO URL is extracted from the XML).
	 */
	entryPoint: string;
	/**
	 * IdP signing certificate. Used to verify SAML response signatures
	 * when `idpMetadata.metadata` is not provided. Ignored when IdP
	 * metadata XML is set (the certificate is extracted from the XML).
	 * When both this and `idpMetadata.cert` are set, `idpMetadata.cert` takes precedence.
	 */
	cert: string;
	audience?: string | undefined;
	idpMetadata?:
		| {
				metadata?: string;
				entityID?: string;
				cert?: string;
				privateKey?: string;
				privateKeyPass?: string;
				isAssertionEncrypted?: boolean;
				encPrivateKey?: string;
				encPrivateKeyPass?: string;
				singleSignOnService?: Array<{
					Binding: string;
					Location: string;
				}>;
				singleLogoutService?: Array<{
					Binding: string;
					Location: string;
				}>;
		  }
		| undefined;
	/**
	 * SP metadata configuration. All fields are optional; when omitted,
	 * SP metadata is auto-generated from `issuer`, `wantAssertionsSigned`,
	 * `authnRequestsSigned`, and `identifierFormat`.
	 */
	spMetadata?: {
		metadata?: string | undefined;
		entityID?: string | undefined;
		binding?: string | undefined;
		privateKey?: string | undefined;
		privateKeyPass?: string | undefined;
		isAssertionEncrypted?: boolean | undefined;
		encPrivateKey?: string | undefined;
		encPrivateKeyPass?: string | undefined;
	};
	/**
	 * Request signed assertions from the IdP. When true, the SP metadata
	 * advertises `WantAssertionsSigned="true"` and samlify will reject
	 * unsigned assertions.
	 */
	wantAssertionsSigned?: boolean | undefined;
	authnRequestsSigned?: boolean | undefined;
	signatureAlgorithm?: string | undefined;
	digestAlgorithm?: string | undefined;
	identifierFormat?: string | undefined;
	privateKey?: string | undefined;
	mapping?: SAMLMapping | undefined;
}

/** Stored AuthnRequest record for InResponseTo validation */
export interface AuthnRequestRecord {
	id: string;
	providerId: string;
	createdAt: number;
	expiresAt: number;
}

/** Session data stored during SAML login for Single Logout */
export interface SAMLSessionRecord {
	sessionId: string;
	providerId: string;
	nameID: string;
	sessionIndex?: string;
}

/**
 * Parsed SAML login response extract from samlify.
 *
 * samlify's extractor nests multi-attribute XML elements as objects:
 * - `response` (Response/@ID, @IssueInstant, @Destination, @InResponseTo)
 * - `sessionIndex` (AuthnStatement/@AuthnInstant, @SessionNotOnOrAfter, @SessionIndex)
 * - `conditions` (Conditions/@NotBefore, @NotOnOrAfter)
 *
 * Single-value elements remain as strings: `nameID`, `audience`.
 */
export interface SAMLAssertionExtract {
	nameID?: string;
	/**
	 * From `<AuthnStatement>` — samlify extracts all 3 attributes as an object.
	 * To get the SessionIndex string, read `sessionIndex.sessionIndex`.
	 */
	sessionIndex?: {
		authnInstant?: string;
		sessionNotOnOrAfter?: string;
		sessionIndex?: string;
	};
	conditions?: {
		notBefore?: string;
		notOnOrAfter?: string;
	};
	response?: {
		id?: string;
		issueInstant?: string;
		destination?: string;
		inResponseTo?: string;
	};
	/** Single string or array when multiple `<Audience>` elements are present. */
	audience?: string | string[];
}

type BaseSSOProvider = {
	issuer: string;
	oidcConfig?: OIDCConfig | undefined;
	samlConfig?: SAMLConfig | undefined;
	userId: string;
	providerId: string;
	organizationId?: string | undefined;
	domain: string;
};

export type SSOProvider<O extends SSOOptions> =
	O["domainVerification"] extends { enabled: true }
		? {
				domainVerified: boolean;
			} & BaseSSOProvider
		: BaseSSOProvider;

export interface SSOOptions {
	/**
	 * custom function to provision a user when they sign in with an SSO provider.
	 */
	provisionUser?:
		| ((data: {
				/**
				 * The user object from the database
				 */
				user: User & Record<string, any>;
				/**
				 * The user info object from the provider
				 */
				userInfo: Record<string, any>;
				/**
				 * The OAuth2 tokens from the provider
				 */
				token?: OAuth2Tokens;
				/**
				 * The SSO provider
				 */
				provider: SSOProvider<SSOOptions>;
		  }) => Awaitable<void>)
		| undefined;
	/**
	 * If true, the `provisionUser` callback will be called on every login,
	 * not just when a new user is registered. This is useful when you need
	 * to sync upstream identity provider profile changes on each sign-in.
	 *
	 * The `provisionUser` callback should be idempotent when this is enabled.
	 *
	 * @default false
	 */
	provisionUserOnEveryLogin?: boolean;
	/**
	 * Organization provisioning options
	 */
	organizationProvisioning?:
		| {
				disabled?: boolean;
				defaultRole?: "member" | "admin";
				getRole?: (data: {
					/**
					 * The user object from the database
					 */
					user: User & Record<string, any>;
					/**
					 * The user info object from the provider
					 */
					userInfo: Record<string, any>;
					/**
					 * The OAuth2 tokens from the provider
					 */
					token?: OAuth2Tokens;
					/**
					 * The SSO provider
					 */
					provider: SSOProvider<SSOOptions>;
				}) => Promise<"member" | "admin">;
		  }
		| undefined;
	/**
	 * Default SSO provider configurations for testing.
	 * These will take the precedence over the database providers.
	 */
	defaultSSO?:
		| Array<{
				/**
				 * The domain to match for this default provider.
				 * This is only used to match incoming requests to this default provider.
				 */
				domain: string;
				/**
				 * The provider ID to use
				 */
				providerId: string;
				/**
				 * SAML configuration
				 */
				samlConfig?: SAMLConfig;
				/**
				 * OIDC configuration
				 */
				oidcConfig?: OIDCConfig;
				/**
				 * Private key for `private_key_jwt` authentication.
				 * Only used with defaultSSO — not stored in DB.
				 */
				privateKey?: {
					privateKeyJwk?: JsonWebKey;
					privateKeyPem?: string;
				};
		  }>
		| undefined;
	/**
	 * Override user info with the provider info.
	 * @default false
	 */
	defaultOverrideUserInfo?: boolean | undefined;
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean | undefined;
	/**
	 * The model name for the SSO provider table. Defaults to "ssoProvider".
	 */
	modelName?: string;
	/**
	 * Map fields
	 *
	 * @example
	 * ```ts
	 * {
	 *  samlConfig: "saml_config"
	 * }
	 * ```
	 */
	fields?: {
		issuer?: string | undefined;
		oidcConfig?: string | undefined;
		samlConfig?: string | undefined;
		userId?: string | undefined;
		providerId?: string | undefined;
		organizationId?: string | undefined;
		domain?: string | undefined;
	};
	/**
	 * Configure the maximum number of SSO providers a user can register.
	 * You can also pass a function that returns a number.
	 * Set to 0 to disable SSO provider registration.
	 *
	 * @example
	 * ```ts
	 * providersLimit: async (user) => {
	 *   const plan = await getUserPlan(user);
	 *   return plan.name === "pro" ? 10 : 1;
	 * }
	 * ```
	 * @default 10
	 */
	providersLimit?: (number | ((user: User) => Awaitable<number>)) | undefined;
	/**
	 * Trust the email verified flag from the provider.
	 *
	 * ⚠️ Use this with caution — it can lead to account takeover if misused. Only enable it if users **cannot freely register new providers**. You can
	 * prevent that by using `disabledPaths` or other safeguards to block provider registration from the client.
	 *
	 * If you want to allow account linking for specific trusted providers, enable the `accountLinking` option in your auth config and specify those
	 * providers in the `trustedProviders` list.
	 *
	 * @default false
	 *
	 * @deprecated This option is discouraged for new projects. Relying on provider-level `email_verified` is a weaker
	 * trust signal compared to using `trustedProviders` in `accountLinking` or enabling `domainVerification` for SSO.
	 * Existing configurations will continue to work, but new integrations should use explicit trust mechanisms.
	 * This option may be removed in a future major version.
	 */
	trustEmailVerified?: boolean | undefined;
	/**
	 * Enable domain verification on SSO providers
	 *
	 * When this option is enabled, new SSO providers will require the associated domain to be verified by the owner
	 * prior to allowing sign-ins.
	 */
	domainVerification?: {
		/**
		 * Enables or disables the domain verification feature
		 */
		enabled?: boolean;
		/**
		 * Prefix used to generate the domain verification token.
		 * An underscore is automatically prepended to follow DNS
		 * infrastructure subdomain conventions (RFC 8552), so do
		 * not include a leading underscore.
		 *
		 * @default "better-auth-token"
		 */
		tokenPrefix?: string;
	};
	/**
	 * A shared redirect URI used by all OIDC providers instead of
	 * per-provider callback URLs. Can be a path or a full URL.
	 */
	redirectURI?: string;
	/**
	 * Callback to resolve private key material for private_key_jwt authentication.
	 * Called during token exchange when a provider uses tokenEndpointAuthentication: "private_key_jwt".
	 * Keeps private keys out of the database — supports HSM/KMS/Vault integration.
	 */
	resolvePrivateKey?: (params: {
		providerId: string;
		keyId?: string;
		issuer: string;
	}) => Promise<{
		privateKeyJwk?: JsonWebKey;
		privateKeyPem?: string;
		kid?: string;
		algorithm?: string;
	}>;
	/**
	 * SAML security options for AuthnRequest/InResponseTo validation.
	 * This prevents unsolicited responses, replay attacks, and cross-provider injection.
	 */
	saml?: {
		/**
		 * Enable InResponseTo validation for SP-initiated SAML flows.
		 * When enabled, AuthnRequest IDs are tracked and validated against SAML responses.
		 *
		 * Storage behavior:
		 * - Uses `secondaryStorage` (e.g., Redis) if configured in your auth options
		 * - Falls back to the verification table in the database otherwise
		 *
		 * This works correctly in serverless environments without any additional configuration.
		 *
		 * @default true
		 */
		enableInResponseToValidation?: boolean;
		/**
		 * Allow IdP-initiated SSO (unsolicited SAML responses).
		 * When true, responses without InResponseTo are accepted.
		 * When false, all responses must correlate to a stored AuthnRequest.
		 *
		 * IdP-initiated SSO is a known attack vector — the SAML2Int
		 * interoperability profile recommends against it. Only enable
		 * this if your IdP requires it and you understand the risks.
		 *
		 * Only applies when InResponseTo validation is enabled.
		 *
		 * @default false
		 */
		allowIdpInitiated?: boolean;
		/**
		 * TTL for AuthnRequest records in milliseconds.
		 * Requests older than this will be rejected.
		 *
		 * Only applies when InResponseTo validation is enabled.
		 *
		 * @default 300000 (5 minutes)
		 */
		requestTTL?: number;
		/**
		 * Clock skew tolerance for SAML assertion timestamp validation in milliseconds.
		 * Allows for minor time differences between IdP and SP servers.
		 *
		 * Defaults to 300000 (5 minutes) to accommodate:
		 * - Network latency and processing time
		 * - Clock synchronization differences (NTP drift)
		 * - Distributed systems across timezones
		 *
		 * For stricter security, reduce to 1-2 minutes (60000-120000).
		 * For highly distributed systems, increase up to 10 minutes (600000).
		 *
		 * @default 300000 (5 minutes)
		 */
		clockSkew?: number;
		/**
		 * Require timestamp conditions (NotBefore/NotOnOrAfter) in SAML assertions.
		 * When enabled, assertions without timestamp conditions will be rejected.
		 *
		 * When disabled (default), assertions without timestamps are accepted
		 * but a warning is logged.
		 *
		 * **SAML Spec Notes:**
		 * - SAML 2.0 Core: Timestamps are OPTIONAL
		 * - SAML2Int (enterprise profile): Timestamps are REQUIRED
		 *
		 * **Recommendation:** Enable for enterprise/production deployments
		 * where your IdP follows SAML2Int (Okta, Azure AD, OneLogin, etc.)
		 *
		 * @default false
		 */
		requireTimestamps?: boolean;
		/**
		 * Algorithm validation options for SAML responses.
		 *
		 * Controls behavior when deprecated algorithms (SHA-1, RSA1_5, 3DES)
		 * are detected in SAML responses.
		 *
		 * @example
		 * ```ts
		 * algorithms: {
		 *   onDeprecated: "reject" // Reject deprecated algorithms
		 * }
		 * ```
		 */
		algorithms?: AlgorithmValidationOptions;
		/**
		 * Maximum allowed size for SAML responses in bytes.
		 *
		 * @default 262144 (256KB)
		 */
		maxResponseSize?: number;
		/**
		 * Maximum allowed size for IdP metadata XML in bytes.
		 *
		 * @default 102400 (100KB)
		 */
		maxMetadataSize?: number;
		/**
		 * Enable SAML Single Logout
		 * @default false
		 */
		enableSingleLogout?: boolean;
		/**
		 * TTL for LogoutRequest records in milliseconds
		 * @default 300000 (5 minutes)
		 */
		logoutRequestTTL?: number;
		/**
		 * Require signed LogoutRequests from IdP
		 * @default false
		 */
		wantLogoutRequestSigned?: boolean;
		/**
		 * Require signed LogoutResponses from IdP
		 * @default false
		 */
		wantLogoutResponseSigned?: boolean;
	};
}

export interface Member {
	id: string;
	userId: string;
	organizationId: string;
	role: string;
}
