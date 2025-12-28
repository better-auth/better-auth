import { betterFetch } from "@better-fetch/fetch";
import {
	refreshAccessToken,
	validateAuthorizationCode,
	type OAuth2Tokens,
	type OAuthProvider,
	type ProviderOptions,
} from "../oauth2";

export interface OsuUser {
	/** user avatar url */
	avatar_url: string;
	
	/** info about user cover image */
	cover: {
		custom_url: string
		url: string
		id: null
	}

	/** 2 letter code representing user country */
	country_code: string;

	/** identifier of default group the user belongs to */
	default_group?: string;

	/** unique id for the user */
	id: number;

	/** has this account been active recently? */
	is_active: boolean;

	/** is this account a bot? */
	is_bot: boolean;
	is_deleted: boolean;

	/** is the user currently restricted? */
	is_restricted: boolean;

	/** is the user currently online? */
	is_online: boolean;

	/** does this user currently have supporter? */
	is_supporter: boolean;

	/** time of last visit as a ISO 8601 string */
	last_visit: string;

	pm_friends_only: boolean;

	/** colour of profile highlight, hex code (e.g. #112233) */
	profile_color?: string;

	/** users display name */
	username: string;
}

export interface OsuOptions extends ProviderOptions<OsuUser> {
	clientId: string;
}

export const osu = (options: OsuOptions) => {
	return {
		id: "osu",
		name: "osu!",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["identify"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return new URL(
				`https://osu.ppy.sh/oauth/authorize?client_id=${options.clientId}
				&redirect_uri=${encodeURIComponent(options.redirectURI || redirectURI)}
				&response_type=code
				&scope=${_scopes.join(" ")}
				&state=${state}
				`,
			);
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint: "https://osu.ppy.sh/oauth/token",
				authentication: "post",
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
						tokenEndpoint: "https://osu.ppy.sh/oauth/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token)
			}

			const { data: profile, error } = await betterFetch<OsuUser>(
				"https://osu.ppy.sh/api/v2/me",
				{
					headers: {
						authorization: `Bearer ${token.accessToken}`
					}
				}
			);

			if (error) {
				return null
			}

			const userMap = await options.mapProfileToUser?.(profile)

			// osu! doesn't provide email or email_verified
			return {
				user: {
					id: profile.id,
					name: profile.username,
					email: null,
					emailVerified: false,
					image: profile.avatar_url,
					...userMap
				},
				data: {
					...profile
				}
			}
		},
		options
	} satisfies OAuthProvider<OsuUser>;
};
