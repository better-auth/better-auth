import { betterFetch } from "@better-fetch/fetch";
import { Facebook } from "arctic";
import type { OAuthProvider, ProviderOptions } from ".";
import { getRedirectURI, validateAuthorizationCode } from "./utils";

export interface FacebookProfile {
	id: string;
	name: string;
	email: string;
	email_verified: boolean;
	picture: {
		data: {
			height: number;
			is_silhouette: boolean;
			url: string;
			width: number;
		};
	};
}
export interface FacebookOptions extends ProviderOptions {}
export const facebook = (options: FacebookOptions) => {
	const facebookArctic = new Facebook(
		options.clientId,
		options.clientSecret,
		getRedirectURI("facebook", options.redirectURI),
	);
	return {
		id: "facebook",
		name: "Facebook",
		createAuthorizationURL({ state, scopes }) {
			const _scopes = options.scope || scopes || ["email", "public_profile"];
			return facebookArctic.createAuthorizationURL(state, _scopes);
		},
		validateAuthorizationCode: async (code, codeVerifier, redirectURI) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI:
					redirectURI || getRedirectURI("facebook", options.redirectURI),
				options,
				tokenEndpoint: "https://graph.facebook.com/v16.0/oauth/access_token",
			});
		},
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<FacebookProfile>(
				"https://graph.facebook.com/me",
				{
					auth: {
						type: "Bearer",
						token: token.accessToken(),
					},
				},
			);
			if (error) {
				return null;
			}
			return {
				user: {
					id: profile.id,
					name: profile.name,
					email: profile.email,
					emailVerified: profile.email_verified,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<FacebookProfile>;
};
