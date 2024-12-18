import { createAuthEndpoint } from "../../api";
import type { BetterAuthPlugin, GenericEndpointContext } from "../../types";

interface OIDCProviderOptions {
	/**
	 * The metadata for the OpenID Connect provider.
	 */
	metadata?: Partial<OIDCMetadata>;
}

const getMetadata = (
	ctx: GenericEndpointContext,
	options: OIDCProviderOptions,
): OIDCMetadata => {
	const issuer = ctx.context.options.baseURL as string;
	const baseURL = ctx.context.baseURL;
	return {
		issuer,
		authorizationEndpoint: `${baseURL}/authorize`,
		tokenEndpoint: `${baseURL}/token`,
		userInfoEndpoint: `${baseURL}/userinfo`,
	};
};

export const oidcProvider = (options: OIDCProviderOptions) => {
	return {
		id: "oidc-provider",
		endpoints: {
			authorize: createAuthEndpoint(
				"/authorize",
				{
					method: "GET",
				},
				async (ctx) => {},
			),
		},
	} satisfies BetterAuthPlugin;
};

interface OIDCMetadata {
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
	jwks_uri?: string;
	/**
	 * The URL of the registration endpoint.
	 *
	 * @default `/register`
	 */
	registration_endpoint?: string;
}
