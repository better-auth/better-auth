import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface SalesforceProfile {
	sub: string;
	user_id: string;
	organization_id: string;
	preferred_username?: string | undefined;
	email: string;
	email_verified?: boolean | undefined;
	name: string;
	given_name?: string | undefined;
	family_name?: string | undefined;
	zoneinfo?: string | undefined;
	photos?:
		| {
				picture?: string;
				thumbnail?: string;
		  }
		| undefined;
}

export interface SalesforceOptions extends ProviderOptions<SalesforceProfile> {
	clientId: string;
	environment?: ("sandbox" | "production") | undefined;
	loginUrl?: string | undefined;
	/**
	 * Override the redirect URI if auto-detection fails.
	 * Should match the Callback URL configured in your Salesforce Connected App.
	 * @example "http://localhost:3000/api/auth/callback/salesforce"
	 */
	redirectURI?: string | undefined;
}

export const salesforce = (options: SalesforceOptions) => {
	const environment = options.environment ?? "production";
	const isSandbox = environment === "sandbox";
	const authorizationEndpoint = options.loginUrl
		? `https://${options.loginUrl}/services/oauth2/authorize`
		: isSandbox
			? "https://test.salesforce.com/services/oauth2/authorize"
			: "https://login.salesforce.com/services/oauth2/authorize";

	const tokenEndpoint = options.loginUrl
		? `https://${options.loginUrl}/services/oauth2/token`
		: isSandbox
			? "https://test.salesforce.com/services/oauth2/token"
			: "https://login.salesforce.com/services/oauth2/token";

	const userInfoEndpoint = options.loginUrl
		? `https://${options.loginUrl}/services/oauth2/userinfo`
		: isSandbox
			? "https://test.salesforce.com/services/oauth2/userinfo"
			: "https://login.salesforce.com/services/oauth2/userinfo";

	return {
		id: "salesforce",
		name: "Salesforce",

		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret are required for Salesforce. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Salesforce");
			}

			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "email", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "salesforce",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
			});
		},

		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
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
							clientSecret: options.clientSecret,
						},
						tokenEndpoint,
					});
				},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			try {
				const { data: user } = await betterFetch<SalesforceProfile>(
					userInfoEndpoint,
					{
						headers: {
							Authorization: `Bearer ${token.accessToken}`,
						},
					},
				);

				if (!user) {
					logger.error("Failed to fetch user info from Salesforce");
					return null;
				}

				const userMap = await options.mapProfileToUser?.(user);

				return {
					user: {
						id: user.user_id,
						name: user.name,
						email: user.email,
						image: user.photos?.picture || user.photos?.thumbnail,
						emailVerified: user.email_verified ?? false,
						...userMap,
					},
					data: user,
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Salesforce:", error);
				return null;
			}
		},

		options,
	} satisfies OAuthProvider<SalesforceProfile>;
};
