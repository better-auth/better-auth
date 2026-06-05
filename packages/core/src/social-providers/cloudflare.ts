import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

const authorizationEndpoint = "https://dash.cloudflare.com/oauth2/auth";
const tokenEndpoint = "https://dash.cloudflare.com/oauth2/token";
const userinfoEndpoint = "https://dash.cloudflare.com/oauth2/userinfo";

export interface CloudflareProfile {
	/** The user's unique Cloudflare OAuth subject. */
	sub: string;
	/** The user's email address, when returned by Cloudflare. */
	email?: string | undefined;
	/** Whether Cloudflare reports the email as verified. */
	email_verified?: boolean | undefined;
	/** The user's display name, when returned by Cloudflare. */
	name?: string | undefined;
	/** URL of the user's profile picture, when returned by Cloudflare. */
	picture?: string | undefined;
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
			const { data: profile, error } = await betterFetch<CloudflareProfile>(
				userinfoEndpoint,
				{ headers: { authorization: `Bearer ${token.accessToken}` } },
			);
			if (error || !profile) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name ?? "",
					email: profile.email,
					image: profile.picture,
					emailVerified: profile.email_verified ?? false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<CloudflareProfile>;
};
