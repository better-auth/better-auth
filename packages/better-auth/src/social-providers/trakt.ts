import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface TraktProfile {
	/** The user's username */
	username: string
	/** The user's full name */
	name: string
	/** The user's ID */
  ids: {
		/** Usually the same as `username` */
    slug: string
  }
	/** The user's biography */
  about: string
	/** The user's avatar */
  images: {
    avatar: {
      full: string
    }
  }
}

export interface TraktOption extends ProviderOptions<TraktProfile> {}

export const trakt = (options: TraktOption) => {
	return {
		id: "trakt",
		name: "Trakt",
		createAuthorizationURL(data) {
			const _scopes = data.scopes || ["openid", "profile"]
			options.scope && _scopes.push(...options.scope);
			return createAuthorizationURL({
				id: "trakt",
				options,
				authorizationEndpoint: "https://trakt.tv/oauth/authorize",
				scopes: _scopes,
				state: data.state,
				codeVerifier: data.codeVerifier,
				redirectURI: data.redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint: "https://api.trakt.tv/oauth/token",
				authentication: "post",
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<TraktProfile>(
				"https://api.trakt.tv/users/me?extended=full",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
						"trakt-api-version": "2",
						"trakt-api-key": options.clientId,
					},
				},
			);

			if (error) {
				return null;
			}

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.ids.slug,
					name: profile.name,
					email: profile.username || profile.ids.slug || null,
					image: profile.images.avatar.full,
					emailVerified: true,
					...userMap,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<TraktProfile>;
};
