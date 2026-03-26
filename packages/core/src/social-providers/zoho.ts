import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface ZohoProfile {
	sub: string;
	name: string;
	first_name: string;
	last_name: string;
	email: string;
	email_verified: boolean;
	picture?: string | undefined;
	gender?: string | undefined;
	phone_number?: string | undefined;
	phone_number_verified?: boolean | undefined;
}

export interface ZohoOptions extends ProviderOptions<ZohoProfile> {
	clientId: string;
	/**
	 * The Zoho accounts server URL for the data center where the app is registered.
	 * Defaults to "https://accounts.zoho.com" (US data center).
	 *
	 * Other data centers:
	 * - EU: "https://accounts.zoho.eu"
	 * - India: "https://accounts.zoho.in"
	 * - Australia: "https://accounts.zoho.com.au"
	 * - Japan: "https://accounts.zoho.jp"
	 * - Canada: "https://accounts.zoho.ca"
	 * - Saudi Arabia: "https://accounts.zoho.sa"
	 * - UK: "https://accounts.zoho.uk"
	 */
	accountsServer?: string | undefined;
	/**
	 * The access type to use for the authorization code request.
	 * If "offline", a refresh token will be provided.
	 * Defaults to "offline".
	 */
	accessType?: ("offline" | "online") | undefined;
}

export const zoho = (options: ZohoOptions) => {
	const accountsServer = options.accountsServer ?? "https://accounts.zoho.com";
	const tokenEndpoint = `${accountsServer}/oauth/v2/token`;

	return {
		id: "zoho",
		name: "Zoho",

		async createAuthorizationURL({ state, scopes, redirectURI, loginHint }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Zoho. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}

			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "email", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "zoho",
				options,
				authorizationEndpoint: `${accountsServer}/oauth/v2/auth`,
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				prompt: options.prompt,
				accessType: options.accessType ?? "offline",
			});
		},

		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
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
					});
				},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (token.idToken) {
				const user = decodeJwt(token.idToken) as ZohoProfile;
				const userMap = await options.mapProfileToUser?.(user);
				return {
					user: {
						id: user.sub,
						name:
							user.name ||
							[user.first_name, user.last_name].filter(Boolean).join(" ") ||
							"",
						email: user.email,
						image: user.picture,
						emailVerified: user.email_verified,
						...userMap,
					},
					data: user,
				};
			}

			if (!token.accessToken) {
				return null;
			}

			try {
				const { data: profile } = await betterFetch<ZohoProfile>(
					`${accountsServer}/oauth/user/info`,
					{
						headers: {
							Authorization: `Zoho-oauthtoken ${token.accessToken}`,
						},
					},
				);

				if (!profile) return null;

				const userMap = await options.mapProfileToUser?.(profile);
				return {
					user: {
						id: profile.sub,
						name:
							profile.name ||
							[profile.first_name, profile.last_name]
								.filter(Boolean)
								.join(" ") ||
							"",
						email: profile.email,
						image: profile.picture,
						emailVerified: profile.email_verified,
						...userMap,
					},
					data: profile,
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Zoho:", error);
				return null;
			}
		},

		options,
	} satisfies OAuthProvider<ZohoProfile>;
};
