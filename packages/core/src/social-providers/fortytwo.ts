import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";
export interface FortyTwoProfile extends Record<string, any> {
	/** the user's id */
	id: number;
	/** the user's email, could be LOGIN@student.42.fr */
	email: string;
	/**
	 * the user's login/username based on their first and last name
	 * i.e. John Doe's login could be jdoe, but it could be anything else
	 */
	login: string;
	/** the user's full name */
	displayname: string;
	/** the user's avatar */
	image?: { link: string };
}

export interface FortyTwoOptions extends ProviderOptions<FortyTwoProfile> {
	clientId: string;
	clientSecret: string;
}

export const fortytwo = (options: FortyTwoOptions) => {
	return {
		id: "fortytwo",
		name: "42 School",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["public"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "fortytwo",
				options,
				authorizationEndpoint: "https://api.intra.42.fr/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://api.intra.42.fr/oauth/token",
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);

			const { data: profile, error } = await betterFetch<FortyTwoProfile>(
				"https://api.intra.42.fr/v2/me",
				{
					headers: { Authorization: `Bearer ${token.accessToken}` },
				},
			);

			if (error || !profile) return null;

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.id.toString(),
					name: profile.displayname,
					email: profile.email,
					image: profile.image?.link,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<FortyTwoProfile>;
};
