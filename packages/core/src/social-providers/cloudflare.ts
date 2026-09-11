import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../env";
import type {
	OAuthProvider,
	ProviderOptions,
	TokenEndpointAuth,
} from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

const authorizationEndpoint = "https://dash.cloudflare.com/oauth2/auth";
const tokenEndpoint = "https://dash.cloudflare.com/oauth2/token";

/**
 * Cloudflare's OIDC `userinfo` endpoint only returns the `sub` claim, so it
 * cannot be used to build a user. The user's profile (email, name, ...) is
 * read from the Cloudflare API `/user` endpoint instead, which the access
 * token can call when the `user-details.read` scope is granted.
 */
const userEndpoint = "https://api.cloudflare.com/client/v4/user";

/**
 * The user profile returned by the Cloudflare API `/user` endpoint.
 *
 * @see https://developers.cloudflare.com/api/resources/user/methods/get/
 */
export interface CloudflareProfile {
	/**
	 * Identifier of the user.
	 */
	id: string;
	/**
	 * Current email address of the user.
	 */
	email: string;
	/**
	 * The user's first name.
	 */
	first_name?: string | null | undefined;
	/**
	 * The user's last name.
	 */
	last_name?: string | null | undefined;
	/**
	 * The country in which the user lives.
	 */
	country?: string | null | undefined;
	/**
	 * The user's telephone number.
	 */
	telephone?: string | null | undefined;
	/**
	 * The zipcode or postal code where the user lives.
	 */
	zipcode?: string | null | undefined;
	/**
	 * Indicates whether two-factor authentication is enabled for the user account.
	 */
	two_factor_authentication_enabled?: boolean | undefined;
	/**
	 * Indicates whether the user has been suspended.
	 */
	suspended?: boolean | undefined;
}

/**
 * The standard Cloudflare API response envelope for the `/user` endpoint.
 */
interface CloudflareUserResponse {
	success: boolean;
	errors: { code: number; message: string }[];
	result: CloudflareProfile | null;
}

/**
 * Token endpoint authentication supported by Cloudflare OAuth clients.
 *
 * @see https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/#choose-a-flow
 */
type CloudflareClientAuthentication =
	| {
			/**
			 * The client secret of a confidential Cloudflare OAuth client.
			 */
			clientSecret: string;
			/**
			 * The authentication method configured for the token endpoint.
			 *
			 * @default "client_secret_basic"
			 */
			tokenEndpointAuthMethod?:
				| "client_secret_basic"
				| "client_secret_post"
				| undefined;
	  }
	| {
			/**
			 * Clients that use PKCE do not have a client secret.
			 */
			clientSecret?: undefined;
			/**
			 * Clients without a secret do not authenticate at the token endpoint.
			 *
			 * @default "none"
			 */
			tokenEndpointAuthMethod?: "none" | undefined;
	  };

interface CloudflareBaseOptions extends ProviderOptions<CloudflareProfile> {
	/**
	 * The client ID of the Cloudflare OAuth client.
	 */
	clientId: string;
}

/**
 * Options for configuring the Cloudflare social provider.
 */
export type CloudflareOptions = CloudflareBaseOptions &
	CloudflareClientAuthentication;

const getTokenEndpointAuth = (
	options: CloudflareOptions,
): TokenEndpointAuth => {
	const defaultMethod = options.clientSecret ? "client_secret_basic" : "none";
	const method = options.tokenEndpointAuthMethod ?? defaultMethod;

	return { method };
};

export const cloudflare = (options: CloudflareOptions) => {
	return {
		id: "cloudflare",
		name: "Cloudflare",
		accountSubject: ({ profile }) => profile.id,
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["user-details.read"];

			if (options.scope?.length) {
				_scopes.push(...options.scope);
			}

			if (scopes?.length) {
				_scopes.push(...scopes);
			}

			return createAuthorizationURL({
				id: "cloudflare",
				options,
				authorizationEndpoint,
				scopes: _scopes.length ? [...new Set(_scopes)] : undefined,
				state,
				codeVerifier,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
				tokenEndpointAuth: getTokenEndpointAuth(options),
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientKey: options.clientKey,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint,
						tokenEndpointAuth: getTokenEndpointAuth(options),
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data, error } = await betterFetch<CloudflareUserResponse>(
				userEndpoint,
				{ headers: { authorization: `Bearer ${token.accessToken}` } },
			);

			if (error || !data?.success || !data.result) {
				logger.error(
					"Failed to fetch user info from Cloudflare:",
					error ?? data?.errors,
				);
				return null;
			}

			const profile = data.result;
			const name =
				[profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
				profile.email;
			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					name,
					email: profile.email,
					// Cloudflare does not expose email verification status
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<CloudflareProfile>;
};
