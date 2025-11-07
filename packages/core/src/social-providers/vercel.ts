import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface VercelProfile {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string;
	picture: string;
	preferred_username: string;
	aud: string;
	exp: number;
	iat: number;
	iss: string;
	jti: string;
	nbf: number;
	nonce?: string;
}

export interface VercelOptions extends ProviderOptions<VercelProfile> {
	clientId: string;
}

export const vercel = (options: VercelOptions) => {
	return {
		id: "vercel",
		name: "Vercel",
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			loginHint,
		}) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Vercel. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Vercel");
			}
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "email", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "vercel",
				options,
				authorizationEndpoint: "https://vercel.com/oauth/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				loginHint,
				prompt: options.prompt,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://vercel.com/api/login/oauth/token",
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
						tokenEndpoint: "https://vercel.com/api/login/oauth/token",
					});
				},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}

			const decoded = decodeJwt(token) as VercelProfile;
			const isValid =
				decoded.aud === options.clientId &&
				decoded.iss === "https://vercel.com";
			return isValid;
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const user = decodeJwt(token.idToken) as VercelProfile;
			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified: user.email_verified,
					...userMap,
				},
				data: user,
			};
		},
		options,
	} satisfies OAuthProvider<VercelProfile>;
};
