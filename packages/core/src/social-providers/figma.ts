import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";
import { globalLog } from "../env";
import { refreshAccessToken } from "../oauth2";

export interface FigmaProfile {
	id: string;
	email: string;
	handle: string;
	img_url: string;
}

export interface FigmaOptions extends ProviderOptions<FigmaProfile> {
	clientId: string;
}

export const figma = (options: FigmaOptions) => {
	return {
		id: "figma",
		name: "Figma",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				globalLog(
					"error",
					"Client Id and Client Secret are required for Figma. Make sure to provide them in the options.",
					null,
				); // Can't set the better auth's logger options here!
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Figma");
			}

			const _scopes = options.disableDefaultScope ? [] : ["file_read"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			const url = await createAuthorizationURL({
				id: "figma",
				options,
				authorizationEndpoint: "https://www.figma.com/oauth",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
			});

			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://www.figma.com/api/oauth/token",
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
						tokenEndpoint: "https://www.figma.com/api/oauth/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			try {
				const { data: profile } = await betterFetch<FigmaProfile>(
					"https://api.figma.com/v1/me",
					{
						headers: {
							Authorization: `Bearer ${token.accessToken}`,
						},
					},
				);

				if (!profile) {
					globalLog("error", "Failed to fetch user from Figma", null); // Can't set the better auth's logger options here!
					return null;
				}

				const userMap = await options.mapProfileToUser?.(profile);

				return {
					user: {
						id: profile.id,
						name: profile.handle,
						email: profile.email,
						image: profile.img_url,
						emailVerified: !!profile.email,
						...userMap,
					},
					data: profile,
				};
			} catch (error) {
				globalLog(
					"error",
					"Failed to fetch user info from Figma:",
					null,
					error,
				); // Can't set the better auth's logger options here!
				return null;
			}
		},
		options,
	} satisfies OAuthProvider<FigmaProfile>;
};
