import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

const authorizationEndpoint = "https://backboard.railway.com/oauth/auth";
const tokenEndpoint = "https://backboard.railway.com/oauth/token";
const userinfoEndpoint = "https://backboard.railway.com/oauth/me";

export interface RailwayProfile {
	/** The user's unique ID (OAuth `sub` claim). */
	sub: string;
	/** The user's email address. */
	email: string;
	/** The user's display name. */
	name: string;
	/** URL of the user's profile picture. */
	picture: string;
}

export interface RailwayOptions extends ProviderOptions<RailwayProfile> {
	clientId: string;
}

export const railway = (options: RailwayOptions) => {
	return {
		id: "railway",
		name: "Railway",
		createAuthorizationURL: async ({
			state,
			scopes,
			codeVerifier,
			redirectURI,
		}) => {
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "email", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "railway",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI, codeVerifier }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				codeVerifier,
				tokenEndpoint,
				authentication: "basic",
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
			const { data: profile, error } = await betterFetch<RailwayProfile>(
				userinfoEndpoint,
				{ headers: { authorization: `Bearer ${token.accessToken}` } },
			);
			if (error || !profile) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name,
					email: profile.email,
					image: profile.picture,
					emailVerified: true,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<RailwayProfile>;
};
