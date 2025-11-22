import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface PolarProfile {
	id: string;
	email: string;
	username: string;
	avatar_url: string;
	github_username?: string | undefined;
	account_id?: string | undefined;
	public_name?: string | undefined;
	email_verified?: boolean | undefined;
	profile_settings?:
		| {
				profile_settings_enabled?: boolean;
				profile_settings_public_name?: string;
				profile_settings_public_avatar?: string;
				profile_settings_public_bio?: string;
				profile_settings_public_location?: string;
				profile_settings_public_website?: string;
				profile_settings_public_twitter?: string;
				profile_settings_public_github?: string;
				profile_settings_public_email?: string;
		  }
		| undefined;
}

export interface PolarOptions extends ProviderOptions<PolarProfile> {}

export const polar = (options: PolarOptions) => {
	return {
		id: "polar",
		name: "Polar",
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "email"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "polar",
				options,
				authorizationEndpoint: "https://polar.sh/oauth2/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://api.polar.sh/v1/oauth2/token",
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
						tokenEndpoint: "https://api.polar.sh/v1/oauth2/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<PolarProfile>(
				"https://api.polar.sh/v1/oauth2/userinfo",
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
			// Polar may provide email_verified claim, but it's not guaranteed.
			// We check for it first, then default to false for security consistency.
			return {
				user: {
					id: profile.id,
					name: profile.public_name || profile.username,
					email: profile.email,
					image: profile.avatar_url,
					emailVerified: profile.email_verified ?? false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<PolarProfile>;
};
