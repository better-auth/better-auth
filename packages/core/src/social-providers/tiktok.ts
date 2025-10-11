import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	refreshAccessToken,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";

/**
 * [More info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/)
 */
export interface TiktokProfile extends Record<string, any> {
	data: {
		user: {
			/**
			 * The unique identification of the user in the current application.Open id
			 * for the client.
			 *
			 * To return this field, add `fields=open_id` in the user profile request's query parameter.
			 */
			open_id: string;
			/**
			 * The unique identification of the user across different apps for the same developer.
			 * For example, if a partner has X number of clients,
			 * it will get X number of open_id for the same TikTok user,
			 * but one persistent union_id for the particular user.
			 *
			 * To return this field, add `fields=union_id` in the user profile request's query parameter.
			 */
			union_id?: string;
			/**
			 * User's profile image.
			 *
			 * To return this field, add `fields=avatar_url` in the user profile request's query parameter.
			 */
			avatar_url?: string;
			/**
			 * User`s profile image in 100x100 size.
			 *
			 * To return this field, add `fields=avatar_url_100` in the user profile request's query parameter.
			 */
			avatar_url_100?: string;
			/**
			 * User's profile image with higher resolution
			 *
			 * To return this field, add `fields=avatar_url_100` in the user profile request's query parameter.
			 */
			avatar_large_url: string;
			/**
			 * User's profile name
			 *
			 * To return this field, add `fields=display_name` in the user profile request's query parameter.
			 */
			display_name: string;
			/**
			 * User's username.
			 *
			 * To return this field, add `fields=username` in the user profile request's query parameter.
			 */
			username: string;
			/** @note Email is currently unsupported by TikTok  */
			email?: string;
			/**
			 * User's bio description if there is a valid one.
			 *
			 * To return this field, add `fields=bio_description` in the user profile request's query parameter.
			 */
			bio_description?: string;
			/**
			 * The link to user's TikTok profile page.
			 *
			 * To return this field, add `fields=profile_deep_link` in the user profile request's query parameter.
			 */
			profile_deep_link?: string;
			/**
			 * Whether TikTok has provided a verified badge to the account after confirming
			 * that it belongs to the user it represents.
			 *
			 * To return this field, add `fields=is_verified` in the user profile request's query parameter.
			 */
			is_verified?: boolean;
			/**
			 * User's followers count.
			 *
			 * To return this field, add `fields=follower_count` in the user profile request's query parameter.
			 */
			follower_count?: number;
			/**
			 * The number of accounts that the user is following.
			 *
			 * To return this field, add `fields=following_count` in the user profile request's query parameter.
			 */
			following_count?: number;
			/**
			 * The total number of likes received by the user across all of their videos.
			 *
			 * To return this field, add `fields=likes_count` in the user profile request's query parameter.
			 */
			likes_count?: number;
			/**
			 * The total number of publicly posted videos by the user.
			 *
			 * To return this field, add `fields=video_count` in the user profile request's query parameter.
			 */
			video_count?: number;
		};
	};
	error?: {
		/**
		 * The error category in string.
		 */
		code?: string;
		/**
		 * The error message in string.
		 */
		message?: string;
		/**
		 * The error message in string.
		 */
		log_id?: string;
	};
}

export interface TiktokOptions extends ProviderOptions {
	// Client ID is not used in TikTok, we delete it from the options
	clientId?: never;
	clientSecret: string;
	clientKey: string;
}

export const tiktok = (options: TiktokOptions) => {
	return {
		id: "tiktok",
		name: "TikTok",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["user.info.profile"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return new URL(
				`https://www.tiktok.com/v2/auth/authorize?scope=${_scopes.join(
					",",
				)}&response_type=code&client_key=${options.clientKey}&redirect_uri=${encodeURIComponent(
					options.redirectURI || redirectURI,
				)}&state=${state}`,
			);
		},

		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options: {
					clientKey: options.clientKey,
					clientSecret: options.clientSecret,
				},
				tokenEndpoint: "https://open.tiktokapis.com/v2/oauth/token/",
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: {
							clientSecret: options.clientSecret,
						},
						tokenEndpoint: "https://open.tiktokapis.com/v2/oauth/token/",
						authentication: "post",
						extraParams: {
							client_key: options.clientKey,
						},
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const fields = [
				"open_id",
				"avatar_large_url",
				"display_name",
				"username",
			];
			const { data: profile, error } = await betterFetch<TiktokProfile>(
				`https://open.tiktokapis.com/v2/user/info/?fields=${fields.join(",")}`,
				{
					headers: {
						authorization: `Bearer ${token.accessToken}`,
					},
				},
			);

			if (error) {
				return null;
			}

			return {
				user: {
					email: profile.data.user.email || profile.data.user.username,
					id: profile.data.user.open_id,
					name: profile.data.user.display_name || profile.data.user.username,
					image: profile.data.user.avatar_large_url,
					/** @note Tiktok does not provide emailVerified or even email*/
					emailVerified: profile.data.user.email ? true : false,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<TiktokProfile, TiktokOptions>;
};
