import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
	refreshAccessToken,
} from "../oauth2";

export interface StravaProfile {
	id: number;
	username: string;
	resource_state: number;
	firstname: string;
	lastname: string;
	bio: string;
	city: string;
	state: string;
	country: string;
	sex: "M" | "F";
	premium: boolean;
	summit: boolean;
	created_at: string;
	updated_at: string;
	badge_type_id: number;
	weight: number;
	profile_medium: string;
	profile: string;
	friend: string | null;
	follower: string | null;
}

export interface StravaOptions extends ProviderOptions<StravaProfile> {}

export const strava = (options: StravaOptions) => {
	return {
		id: "strava",
		name: "Strava",
		createAuthorizationURL({ state, scopes, redirectURI, loginHint }) {
			const _scopes = options.disableDefaultScope ? [] : ["read"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "strava",
				options,
				authorizationEndpoint: "https://www.strava.com/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://www.strava.com/oauth/token",
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
						tokenEndpoint: "https://www.strava.com/oauth/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<StravaProfile>(
				"https://www.strava.com/api/v3/athlete",
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
				},
			);
			if (error) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id.toString(),
					name: `${profile.firstname} ${profile.lastname}`.trim() || profile.username,
					email: "", // Strava doesn't provide email in the athlete endpoint
					image: profile.profile_medium || profile.profile,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<StravaProfile>;
};
