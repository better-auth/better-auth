import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
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
 *
 * @see https://developers.cloudflare.com/api/resources/user/methods/get/
 */
const userEndpoint = "https://api.cloudflare.com/client/v4/user";

/**
 * The user profile returned by the Cloudflare API `/user` endpoint.
 *
 * @see https://developers.cloudflare.com/api/resources/user/methods/get/
 */
export interface CloudflareProfile {
	/** Identifier of the user. */
	id: string;
	/** Current email address of the user. */
	email: string;
	/** The user's first name. */
	first_name?: string | null | undefined;
	/** The user's last name. */
	last_name?: string | null | undefined;
	/** The country in which the user lives. */
	country?: string | null | undefined;
	/** The user's telephone number. */
	telephone?: string | null | undefined;
	/** The zipcode or postal code where the user lives. */
	zipcode?: string | null | undefined;
	/** Indicates whether two-factor authentication is enabled for the user account. */
	two_factor_authentication_enabled?: boolean | undefined;
	/** Indicates whether the user has been suspended. */
	suspended?: boolean | undefined;
}

/** The standard Cloudflare API response envelope for the `/user` endpoint. */
interface CloudflareUserResponse {
	success: boolean;
	errors: { code: number; message: string }[];
	result: CloudflareProfile | null;
}

export interface CloudflareOptions extends ProviderOptions<CloudflareProfile> {
	clientId: string;
	/**
	 * The token endpoint authentication method configured for the Cloudflare OAuth client.
	 *
	 * @default "client_secret_basic" when clientSecret is set, otherwise "none"
	 */
	tokenEndpointAuthMethod?:
		| "client_secret_basic"
		| "client_secret_post"
		| "none"
		| undefined;
}

const getTokenEndpointAuthentication = (options: CloudflareOptions) => {
	const method =
		options.tokenEndpointAuthMethod ??
		(options.clientSecret ? "client_secret_basic" : "none");

	return method === "client_secret_basic" ? "basic" : undefined;
};

const getTokenEndpointOptions = (options: CloudflareOptions) => {
	if (options.tokenEndpointAuthMethod !== "none") {
		return options;
	}
	return {
		...options,
		clientSecret: undefined,
	};
};

export const cloudflare = (options: CloudflareOptions) => {
	return {
		id: "cloudflare",
		name: "Cloudflare",
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
				options: getTokenEndpointOptions(options),
				tokenEndpoint,
				authentication: getTokenEndpointAuthentication(options),
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: getTokenEndpointOptions({
							clientId: options.clientId,
							clientKey: options.clientKey,
							clientSecret: options.clientSecret,
							tokenEndpointAuthMethod: options.tokenEndpointAuthMethod,
						}),
						tokenEndpoint,
						authentication: getTokenEndpointAuthentication(options),
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
				return null;
			}
			const profile = data.result;
			const name = [profile.first_name, profile.last_name]
				.filter(Boolean)
				.join(" ");
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name,
					email: profile.email,
					/**
					 * The Cloudflare `/user` endpoint does not expose an email
					 * verification status. Completing the OAuth flow proves the user
					 * controls the Cloudflare account, so the account email is treated
					 * as verified. Override via `mapProfileToUser` if you need different
					 * behavior.
					 */
					emailVerified: true,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<CloudflareProfile>;
};
