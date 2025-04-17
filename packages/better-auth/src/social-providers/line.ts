import { createAuthorizationURL, validateAuthorizationCode, refreshAccessToken } from "../oauth2"; // adjust import paths
import { decodeJwt, jwtVerify, createRemoteJWKSet } from "jose";
import type { ProviderOptions, OAuthProvider } from "../oauth2";
import { betterFetch } from "@better-fetch/fetch";

export interface LineProfile {
	userId: string;
	displayName: string;
	email?: string;
	pictureUrl?: string;
	statusMessage?: string;
}

export interface LineOptions extends ProviderOptions<LineProfile> {
	botPrompt?: "normal" | "aggressive";
}

export const line = (options: LineOptions) => {
	return {
		id: "line",
		name: "Line",
		async createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["profile", "openid"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return await createAuthorizationURL({
				id: "line",
				options,
				authorizationEndpoint: "https://access.line.me/oauth2/v2.1/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				additionalParams: options.botPrompt ? {
					bot_prompt: options.botPrompt,
				} : {},
			});
		},

		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://api.line.me/oauth2/v2.1/token",
			});
		},

		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) return false;
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}

			try {
				const { payload: jwtClaims } = await jwtVerify(
					token,
					createRemoteJWKSet(new URL("https://access.line.me/.well-known/openid-configuration/jwks")),
					{
						algorithms: ["RS256"],
						audience: options.clientId,
						issuer: "https://access.line.me",
					}
				);

				if (nonce && jwtClaims.nonce !== nonce) {
					return false;
				}
				return !!jwtClaims;
			} catch (err) {
				return false;
			}
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
						tokenEndpoint: "https://api.line.me/oauth2/v2.1/token",
					});
			  },

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data: profile, error } = await betterFetch<LineProfile>(
				"https://api.line.me/v2/profile",
				{
					auth: {
						type: "Bearer",
						token: token.accessToken,
					},
				}
			);

			if (error) return null;

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.userId,
					name: profile.displayName,
					email: profile.email ?? `${profile.userId}@line.com`, // LINE may not always return email unless explicitly requested
					image: profile.pictureUrl,
                    emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},

		options,
	} satisfies OAuthProvider<LineProfile>;
};
