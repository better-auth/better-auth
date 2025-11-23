import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface PatreonProfile {
	/**
	 * The user id of the user
	 */
	id: string;

	attributes: {
		/**
		 * The name of the user
		 */
		full_name: string;
		/**
		 * The email of the user
		 */
		email: string;
		/**
		 * The picture of the user
		 */
		image_url: string;
		/**
		 * If the email of the user is verified
		 */
		is_email_verified: boolean;
	};
}

export interface PatreonOptions extends ProviderOptions<PatreonProfile> {}

export const patreon = (options: PatreonOptions) => {
	return {
		id: "patreon",
		name: "Patreon",
		createAuthorizationURL({ state, scopes, redirectURI, codeVerifier }) {
			const _scopes = options.disableDefaultScope ? [] : ["identity[email]"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "patreon",
				redirectURI,
				options,
				authorizationEndpoint: "https://www.patreon.com/oauth2/authorize",
				scopes: _scopes,
				codeVerifier,
				state,
			});
		},
		async validateAuthorizationCode({ code, redirectURI, codeVerifier }) {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://www.patreon.com/api/oauth2/token",
				codeVerifier,
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data, error } = await betterFetch<{
				data: PatreonProfile;
			}>(
				"https://www.patreon.com/api/oauth2/v2/identity?fields[user]=email,full_name,image_url,is_email_verified",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
				},
			);

			if (error) {
				return null;
			}

			const profile = data.data;

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.id.toString(),
					name: profile.attributes.full_name,
					email: profile.attributes.email,
					image: profile.attributes.image_url,
					emailVerified: profile.attributes.is_email_verified,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<PatreonProfile>;
};
