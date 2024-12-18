import { z } from "zod";
import { createAuthEndpoint, getSessionFromCtx } from "../../api";
import type { BetterAuthPlugin, GenericEndpointContext } from "../../types";
import { generateRandomString } from "../../crypto";
import { modelName } from "./schema";

interface OIDCProviderOptions {
	/**
	 * The metadata for the OpenID Connect provider.
	 */
	metadata?: Partial<OIDCMetadata>;
	/**
	 * Custom function to generate a client id
	 *
	 * @returns A random client id for the client.
	 */
	generateClientId?: () => string;
	/**
	 * Custom function to generate a client secret
	 *
	 * @returns A random client secret for the client.
	 */
	generateClientSecret?: () => string;
}

const getMetadata = (
	ctx: GenericEndpointContext,
	options?: OIDCProviderOptions,
): OIDCMetadata => {
	const issuer = ctx.context.options.baseURL as string;
	const baseURL = ctx.context.baseURL;
	return {
		issuer,
		authorization_endpoint: `${baseURL}/oauth2/authorize`,
		token_endpoint: `${baseURL}/oauth2/token`,
		userInfo_endpoint: `${baseURL}/oauth2/userinfo`,
		jwks_uri: `${baseURL}/jwks`,
		registration_endpoint: `${baseURL}/oauth2/register`,
		scopes_supported: ["openid", "profile", "email", "offline_access"],
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: ["authorization_code"],
		acr_values_supported: [
			"urn:mace:incommon:iap:silver",
			"urn:mace:incommon:iap:bronze",
		],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: ["RS256", "none"],
		token_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
		],
		claims_supported: [
			"sub",
			"iss",
			"aud",
			"exp",
			"nbf",
			"iat",
			"jti",
			"email",
			"email_verified",
			"name",
		],
		...options?.metadata,
	};
};

export const oidcProvider = (options?: OIDCProviderOptions) => {
	const authorizationPath = (options?.metadata?.authorization_endpoint ||
		"/oauth2/authorize") as "/oauth2/authorize";

	const opts = {
		...options,
		generateClientId:
			options?.generateClientId ||
			(() => generateRandomString(32, "a-z", "A-Z")),
		generateClientSecret:
			options?.generateClientSecret ||
			(() => generateRandomString(32, "a-z", "A-Z")),
	};
	return {
		id: "oidc-provider",
		endpoints: {
			authorize: createAuthEndpoint(
				authorizationPath,
				{
					method: "GET",
				},
				async (ctx) => {},
			),
			getOpenIdConfig: createAuthEndpoint(
				"/.well-known/openid-configuration",
				{
					method: "GET",
				},
				async (ctx) => {
					const metadata = getMetadata(ctx, options);
					return metadata;
				},
			),
			registerClient: createAuthEndpoint(
				"/oauth2/register",
				{
					method: "POST",
					body: z.object({
						name: z.string(),
						redirectURLs: z.array(z.string()),
						icon: z.string().optional(),
						metadata: z.record(z.string()).optional(),
					}),
				},
				async (ctx) => {
					const body = ctx.body;
					const session = await getSessionFromCtx(ctx);
					const clientId = opts.generateClientId();
					const clientSecret = opts.generateClientSecret();
					const client = await ctx.context.adapter.create<Record<string, any>>({
						model: modelName.oauthApplication,
						data: {
							name: body.name,
							icon: body.icon,
							metadata: body.metadata ? JSON.stringify(body.metadata) : null,
							clientId: clientId,
							clientSecret: clientSecret,
							redirectURLs: body.redirectURLs.join(","),
							type: "web",
							disabled: false,
							userId: session?.user.id,
						},
					});
					return ctx.json({});
				},
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
