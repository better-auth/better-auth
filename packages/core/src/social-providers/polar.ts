import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

/** Claims returned by Polar's OAuth userinfo endpoint for a user or organization. */
export interface PolarProfile {
	sub: string;
	name?: string | null | undefined;
	email?: string | null | undefined;
	email_verified?: boolean | null | undefined;
}

export interface PolarOptions extends ProviderOptions<PolarProfile> {}

export const polar = (options: PolarOptions) => {
	const tokenEndpoint = "https://api.polar.sh/v1/oauth2/token";
	return {
		id: "polar",
		name: "Polar",
		accountSubject: ({ profile }) => profile.sub,
		createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			additionalParams,
		}) {
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
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
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
						tokenEndpoint,
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
					name: profile.name ?? "",
					email: profile.email,
					emailVerified: profile.email_verified ?? false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<PolarProfile>;
};
