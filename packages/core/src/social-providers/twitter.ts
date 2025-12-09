import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface TwitterProfile {
	data: {
		/**
		 * Unique identifier of this user. This is returned as a string in order to avoid complications with languages and tools
		 * that cannot handle large integers.
		 */
		id: string;
		/** The friendly name of this user, as shown on their profile. */
		name: string;
		/** The email address of this user. */
		email?: string | undefined;
		/** The Twitter handle (screen name) of this user. */
		username: string;
		/**
		 * The location specified in the user's profile, if the user provided one.
		 * As this is a freeform value, it may not indicate a valid location, but it may be fuzzily evaluated when performing searches with location queries.
		 *
		 * To return this field, add `user.fields=location` in the authorization request's query parameter.
		 */
		location?: string | undefined;
		/**
		 * This object and its children fields contain details about text that has a special meaning in the user's description.
		 *
		 *To return this field, add `user.fields=entities` in the authorization request's query parameter.
		 */
		entities?:
			| {
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
			  }
			| undefined;
		/**
		 * Indicate if this user is a verified Twitter user.
		 *
		 * To return this field, add `user.fields=verified` in the authorization request's query parameter.
		 */
		verified?: boolean | undefined;
		/**
		 * The text of this user's profile description (also known as bio), if the user provided one.
		 *
		 * To return this field, add `user.fields=description` in the authorization request's query parameter.
		 */
		description?: string | undefined;
		/**
		 * The URL specified in the user's profile, if present.
		 *
		 * To return this field, add `user.fields=url` in the authorization request's query parameter.
		 */
		url?: string | undefined;
		/** The URL to the profile image for this user, as shown on the user's profile. */
		profile_image_url?: string | undefined;
		protected?: boolean | undefined;
		/**
		 * Unique identifier of this user's pinned Tweet.
		 *
		 *  You can obtain the expanded object in `includes.tweets` by adding `expansions=pinned_tweet_id` in the authorization request's query parameter.
		 */
		pinned_tweet_id?: string | undefined;
		created_at?: string | undefined;
	};
	includes?:
		| {
				tweets?: Array<{
					id: string;
					text: string;
				}>;
		  }
		| undefined;
	[claims: string]: unknown;
}

export interface TwitterOption extends ProviderOptions<TwitterProfile> {
	clientId: string;
}

export const twitter = (options: TwitterOption) => {
	return {
		id: "twitter",
		name: "Twitter",
		createAuthorizationURL(data) {
			const _scopes = options.disableDefaultScope
				? []
				: ["users.read", "tweet.read", "offline.access", "users.email"];
			if (options.scope) _scopes.push(...options.scope);
			if (data.scopes) _scopes.push(...data.scopes);
			return createAuthorizationURL({
				id: "twitter",
				options,
				authorizationEndpoint: "https://x.com/i/oauth2/authorize",
				scopes: _scopes,
				state: data.state,
				codeVerifier: data.codeVerifier,
				redirectURI: data.redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				authentication: "basic",
				redirectURI,
				options,
				tokenEndpoint: "https://api.x.com/2/oauth2/token",
			});
		},

		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientKey: options.clientKey,
							clientSecret: options.clientSecret,
						},
						authentication: "basic",
						tokenEndpoint: "https://api.x.com/2/oauth2/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error: profileError } =
				await betterFetch<TwitterProfile>(
					"https://api.x.com/2/users/me?user.fields=profile_image_url",
					{
						method: "GET",
						headers: {
							Authorization: `Bearer ${token.accessToken}`,
						},
					},
				);

			if (profileError) {
				return null;
			}

			const { data: emailData, error: emailError } = await betterFetch<{
				data: { confirmed_email: string };
			}>("https://api.x.com/2/users/me?user.fields=confirmed_email", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token.accessToken}`,
				},
			});
			let emailVerified = false;
			if (!emailError && emailData?.data?.confirmed_email) {
				profile.data.email = emailData.data.confirmed_email;
				emailVerified = true;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.data.id,
					name: profile.data.name,
					email: profile.data.email || profile.data.username || null,
					image: profile.data.profile_image_url,
					emailVerified: emailVerified,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<TwitterProfile>;
};
