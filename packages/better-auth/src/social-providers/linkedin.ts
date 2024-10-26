import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface LinkedInProfile {
	sub: string;
	name: string;
	given_name: string;
	family_name: string;
	picture: string;
	locale: {
		country: string;
		language: string;
	};
	email: string;
	email_verified: boolean;
}

export interface LinkedInOptions extends ProviderOptions {}

export const linkedin = (options: LinkedInOptions) => {
	const authorizationEndpoint =
		"https://www.linkedin.com/oauth/v2/authorization";
	const tokenEndpoint = "https://www.linkedin.com/oauth/v2/accessToken";

	return {
		id: "linkedin",
		name: "Linkedin",
		createAuthorizationURL: async ({ state, scopes, redirectURI }) => {
			const _scopes = scopes || ["profile", "email", "openid"];
			options.scope && _scopes.push(...options.scope);
			return await createAuthorizationURL({
				id: "linkedin",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return await validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint,
			});
		},
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<LinkedInProfile>(
				"https://api.linkedin.com/v2/userinfo",
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

			return {
				user: {
					id: profile.sub,
					name: profile.name,
					email: profile.email,
					emailVerified: profile.email_verified || false,
					image: profile.picture,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<LinkedInProfile>;
};
