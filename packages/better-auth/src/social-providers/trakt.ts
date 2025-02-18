import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, getOAuth2Tokens, validateAuthorizationCode } from "../oauth2";

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
			return createAuthorizationURL({
				id: "trakt",
				options,
				authorizationEndpoint: "https://trakt.tv/oauth/authorize",
				scopes: [],
				state: data.state,
				redirectURI: data.redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			const { data, error } = await betterFetch<object>("https://api.trakt.tv/oauth/token", {
				method: "POST",
				body: {
					"code": code,
					"client_id": options.clientId,
					"client_secret": options.clientSecret,
					"redirect_uri": options.redirectURI || redirectURI,
					"grant_type": "authorization_code",
				},
				headers: {
					"content-type": "application/json",
				},
			});
		
			if (error) {
				throw error;
			}

			const tokens = getOAuth2Tokens(data);

			return tokens;
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
