import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
	refreshAccessToken,
} from "../oauth2";
import { decodeJwt } from "jose";

export interface LineProfile {
	iss: string;
	sub: string;
	aud: string;
	exp: number;
	iat: number;
	auth_time: number;
	nonce: string;
	amr: string[];
	name: string;
	picture: string;
	email: string;
}

export interface LineOptions extends ProviderOptions<LineProfile> {
	duration?: string;
}

export const line = (options: LineOptions) => {
	return {
		id: "line",
		name: "LINE",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["profile", "email", "openid"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "line",
				options,
				authorizationEndpoint: "https://access.line.me/oauth2/v2.1/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				duration: options.duration,
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
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}
			const { data: tokenInfo } = await betterFetch<{
				iss: string;
				sub: string;
				aud: string;
				exp: number;
				iat: number;
				auth_time: number;
				nonce: string;
				amr: string[];
				name: string;
				picture: string;
				email: string;
			}>("https://api.line.me/oauth2/v2.1/verify", {
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
				body: {
					id_token: token,
					client_id: options.clientId,
					nonce,
				},
			});
			if (!tokenInfo) {
				return false;
			}
			const isValid =
				tokenInfo.aud === options.clientId &&
				tokenInfo.iss === "https://access.line.me";
			return isValid;
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
						tokenEndpoint: "https://api.line.me/oauth2/v2.1/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const user = decodeJwt(token.idToken) as LineProfile;
			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified: !!user.email,
					...userMap,
				},
				data: user,
			};
		},
		options,
	} satisfies OAuthProvider<LineProfile>;
};
