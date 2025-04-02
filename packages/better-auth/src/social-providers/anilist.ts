import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
} from "../oauth2";

export interface AniListProfile {
	id: number;
	name: string;
	about: string | null;
	avatar: {
		large: string;
		medium: string;
	};
	bannerImage: string | null;
	isFollowing: boolean;
	isFollower: boolean;
	isBlocked: boolean;
	bans: string[];
	options: {
		titleLanguage: string;
		displayAdultContent: boolean;
		airingNotifications: boolean;
		profileColor: string;
		notificationOptions: any[];
	};
	mediaListOptions: {
		scoreFormat: string;
		rowOrder: string;
		animeList: {
			sectionOrder: string[];
			splitCompletedSectionByFormat: boolean;
			customLists: string[];
			advancedScoring: string[];
			advancedScoringEnabled: boolean;
		};
		mangaList: {
			sectionOrder: string[];
			splitCompletedSectionByFormat: boolean;
			customLists: string[];
			advancedScoring: string[];
			advancedScoringEnabled: boolean;
		};
	};
	siteUrl: string;
}

export interface AniListUserResponse {
	data: {
		Viewer: AniListProfile;
	};
}

export interface AniListOptions extends ProviderOptions<AniListProfile> {}

/**
 * AniList OAuth2 authentication provider.
 *
 * Note: AniList's OAuth2 implementation has these special characteristics:
 * - Scopes are not supported - tokens provide full access to user data
 * - Access tokens are long-lived (valid for 1 year)
 * - Refresh tokens are not supported
 */
export const anilist = (options: AniListOptions) => {
	const tokenEndpoint = "https://anilist.co/api/v2/oauth/token";

	return {
		id: "anilist",
		name: "AniList",
		createAuthorizationURL({ state, redirectURI }) {
			return createAuthorizationURL({
				id: "anilist",
				options,
				authorizationEndpoint: "https://anilist.co/api/v2/oauth/authorize",
				scopes: [],
				state,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint,
			});
		},
		// AniList doesn't support refresh tokens - this function won't be used
		// but is required by the OAuthProvider interface
		refreshAccessToken: async (refreshToken) => {
			return {
				accessToken: "",
				refreshToken: ""
			};
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const query = `
				{
					Viewer {
						id
						name
						about
						avatar {
							large
							medium
						}
						bannerImage
						isFollowing
						isFollower
						isBlocked
						bans
						options {
							titleLanguage
							displayAdultContent
							airingNotifications
							profileColor
							notificationOptions
						}
						mediaListOptions {
							scoreFormat
							rowOrder
							animeList {
								sectionOrder
								splitCompletedSectionByFormat
								customLists
								advancedScoring
								advancedScoringEnabled
							}
							mangaList {
								sectionOrder
								splitCompletedSectionByFormat
								customLists
								advancedScoring
								advancedScoringEnabled
							}
						}
						siteUrl
					}
				}
			`;

			const { data, error } = await betterFetch<AniListUserResponse>(
				"https://graphql.anilist.co",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Accept": "application/json",
						"Authorization": `Bearer ${token.accessToken}`,
					},
					body: JSON.stringify({
						query,
					}),
				},
			);

			if (error || !data) {
				return null;
			}

			const profile = data.data.Viewer;
			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.id.toString(),
					name: profile.name,
					email: null,
					image: profile.avatar.large,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<AniListProfile>;
};
