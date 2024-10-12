import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from ".";
import {
	createAuthorizationURL,
	getRedirectURI,
	validateAuthorizationCode,
} from "./utils";

export interface TwitterProfile {
	data: {
		/**
		 * Unique identifier of this user. This is returned as a string in order to avoid complications with languages and tools
		 * that cannot handle large integers.
		 */
		id: string;
		/** The friendly name of this user, as shown on their profile. */
		name: string;
		/** @note Email is currently unsupported by Twitter.  */
		email?: string;
		/** The Twitter handle (screen name) of this user. */
		username: string;
		/**
		 * The location specified in the user's profile, if the user provided one.
		 * As this is a freeform value, it may not indicate a valid location, but it may be fuzzily evaluated when performing searches with location queries.
		 *
		 * To return this field, add `user.fields=location` in the authorization request's query parameter.
		 */
		location?: string;
		/**
		 * This object and its children fields contain details about text that has a special meaning in the user's description.
		 *
		 *To return this field, add `user.fields=entities` in the authorization request's query parameter.
		 */
		entities?: {
			/** Contains details about the user's profile website. */
			url: {
				/** Contains details about the user's profile website. */
				urls: Array<{
					/** The start position (zero-based) of the recognized user's profile website. All start indices are inclusive. */
					start: number;
					/** The end position (zero-based) of the recognized user's profile website. This end index is exclusive. */
					end: number;
					/** The URL in the format entered by the user. */
					url: string;
					/** The fully resolved URL. */
					expanded_url: string;
					/** The URL as displayed in the user's profile. */
					display_url: string;
				}>;
			};
			/** Contains details about URLs, Hashtags, Cashtags, or mentions located within a user's description. */
			description: {
				hashtags: Array<{
					start: number;
					end: number;
					tag: string;
				}>;
			};
		};
		/**
		 * Indicate if this user is a verified Twitter user.
		 *
		 * To return this field, add `user.fields=verified` in the authorization request's query parameter.
		 */
		verified?: boolean;
		/**
		 * The text of this user's profile description (also known as bio), if the user provided one.
		 *
		 * To return this field, add `user.fields=description` in the authorization request's query parameter.
		 */
		description?: string;
		/**
		 * The URL specified in the user's profile, if present.
		 *
		 * To return this field, add `user.fields=url` in the authorization request's query parameter.
		 */
		url?: string;
		/** The URL to the profile image for this user, as shown on the user's profile. */
		profile_image_url?: string;
		protected?: boolean;
		/**
		 * Unique identifier of this user's pinned Tweet.
		 *
		 *  You can obtain the expanded object in `includes.tweets` by adding `expansions=pinned_tweet_id` in the authorization request's query parameter.
		 */
		pinned_tweet_id?: string;
		created_at?: string;
	};
	includes?: {
		tweets?: Array<{
			id: string;
			text: string;
		}>;
	};
	[claims: string]: unknown;
}

export interface TwitterOption extends ProviderOptions {}

export const twitter = (options: TwitterOption) => {
	return {
		id: "twitter",
		name: "Twitter",
		createAuthorizationURL(data) {
			const _scopes = options.scope || data.scopes || ["account_info.read"];
			return createAuthorizationURL({
				id: "twitter",
				options,
				authorizationEndpoint: "https://twitter.com/i/oauth2/authorize",
				scopes: _scopes,
				state: data.state,
				codeVerifier: data.codeVerifier,
			});
		},
		validateAuthorizationCode: async (code, codeVerifier, redirectURI) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI:
					redirectURI || getRedirectURI("twitch", options.redirectURI),
				options,
				tokenEndpoint: "https://id.twitch.tv/oauth2/token",
			});
		},
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<TwitterProfile>(
				"https://api.x.com/2/users/me?user.fields=profile_image_url",
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
			if (!profile.data.email) {
				return null;
			}
			return {
				user: {
					id: profile.data.id,
					name: profile.data.name,
					email: profile.data.email,
					image: profile.data.profile_image_url,
					emailVerified: profile.data.verified || false,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<TwitterProfile>;
};
