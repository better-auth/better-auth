import type { OAuth2Tokens, User } from "better-auth";

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
	clientSecret: string;
	authorizationEndpoint?: string | undefined;
	discoveryEndpoint: string;
	userInfoEndpoint?: string | undefined;
	scopes?: string[] | undefined;
	overrideUserInfo?: boolean | undefined;
	tokenEndpoint?: string | undefined;
	tokenEndpointAuthentication?:
		| ("client_secret_post" | "client_secret_basic")
		| undefined;
	jwksEndpoint?: string | undefined;
	mapping?: OIDCMapping | undefined;
}

export interface SAMLConfig {
	issuer: string;
	entryPoint: string;
	cert: string;
	callbackUrl: string;
	audience?: string | undefined;
	idpMetadata?:
		| {
				metadata?: string;
				entityID?: string;
				entityURL?: string;
				redirectURL?: string;
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
		  }
		| undefined;
	spMetadata: {
		metadata?: string | undefined;
		entityID?: string | undefined;
		binding?: string | undefined;
		privateKey?: string | undefined;
		privateKeyPass?: string | undefined;
		isAssertionEncrypted?: boolean | undefined;
		encPrivateKey?: string | undefined;
		encPrivateKeyPass?: string | undefined;
	};
	wantAssertionsSigned?: boolean | undefined;
	signatureAlgorithm?: string | undefined;
	digestAlgorithm?: string | undefined;
	identifierFormat?: string | undefined;
	privateKey?: string | undefined;
	decryptionPvk?: string | undefined;
	additionalParams?: Record<string, any> | undefined;
	mapping?: SAMLMapping | undefined;
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
		  }) => Promise<void>)
		| undefined;
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
	providersLimit?:
		| (number | ((user: User) => Promise<number> | number))
		| undefined;
	/**
	 * Trust the email verified flag from the provider.
	 *
	 * ⚠️ Use this with caution — it can lead to account takeover if misused. Only enable it if users **cannot freely register new providers**. You can
	 * prevent that by using `disabledPaths` or other safeguards to block provider registration from the client.
	 *
	 * If you want to allow account linking for specific trusted providers, enable the `accountLinking` option in your auth config and specify those
	 * providers in the `trustedProviders` list.
	 * @default false
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
		 * Prefix used to generate the domain verification token
		 *
		 * @default "better-auth-token-"
		 */
		tokenPrefix?: string;
	};
}
