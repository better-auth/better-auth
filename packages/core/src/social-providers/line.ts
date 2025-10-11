import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";

export interface LineIdTokenPayload {
	iss: string;
	sub: string;
	aud: string;
	exp: number;
	iat: number;
	name?: string;
	picture?: string;
	email?: string;
	amr?: string[];
	nonce?: string;
}

export interface LineUserInfo {
	sub: string;
	name?: string;
	picture?: string;
	email?: string;
}

export interface LineOptions
	extends ProviderOptions<LineUserInfo | LineIdTokenPayload> {
	clientId: string;
}

/**
 * LINE Login v2.1
 * - Authorization endpoint: https://access.line.me/oauth2/v2.1/authorize
 * - Token endpoint: https://api.line.me/oauth2/v2.1/token
 * - UserInfo endpoint: https://api.line.me/oauth2/v2.1/userinfo
 * - Verify ID token: https://api.line.me/oauth2/v2.1/verify
 *
 * Docs: https://developers.line.biz/en/reference/line-login/#issue-access-token
 */
export const line = (options: LineOptions) => {
	const authorizationEndpoint = "https://access.line.me/oauth2/v2.1/authorize";
	const tokenEndpoint = "https://api.line.me/oauth2/v2.1/token";
	const userInfoEndpoint = "https://api.line.me/oauth2/v2.1/userinfo";
	const verifyIdTokenEndpoint = "https://api.line.me/oauth2/v2.1/verify";

	return {
		id: "line",
		name: "LINE",
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			loginHint,
		}) {
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "email"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "line",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				loginHint,
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
							clientSecret: options.clientSecret,
						},
						tokenEndpoint,
					});
				},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}
			const body = new URLSearchParams();
			body.set("id_token", token);
			body.set("client_id", options.clientId);
			if (nonce) body.set("nonce", nonce);
			const { data, error } = await betterFetch<LineIdTokenPayload>(
				verifyIdTokenEndpoint,
				{
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
					},
					body,
				},
			);
			if (error || !data) {
				return false;
			}
			// aud must match clientId; nonce (if provided) must also match
			if (data.aud !== options.clientId) return false;
			if (nonce && data.nonce && data.nonce !== nonce) return false;
			return true;
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			let profile: LineUserInfo | LineIdTokenPayload | null = null;
			// Prefer ID token if available
			if (token.idToken) {
				try {
					profile = decodeJwt(token.idToken) as LineIdTokenPayload;
				} catch {}
			}
			// Fallback to UserInfo endpoint
			if (!profile) {
				const { data } = await betterFetch<LineUserInfo>(userInfoEndpoint, {
					headers: {
						authorization: `Bearer ${token.accessToken}`,
					},
				});
				profile = data || null;
			}
			if (!profile) return null;
			const userMap = await options.mapProfileToUser?.(profile as any);
			// ID preference order
			const id = (profile as any).sub || (profile as any).userId;
			const name = (profile as any).name || (profile as any).displayName;
			const image =
				(profile as any).picture || (profile as any).pictureUrl || undefined;
			const email = (profile as any).email;
			return {
				user: {
					id,
					name,
					email,
					image,
					// LINE does not expose email verification status in ID token/userinfo
					emailVerified: false,
					...userMap,
				},
				data: profile as any,
			};
		},
		options,
	} satisfies OAuthProvider<LineUserInfo | LineIdTokenPayload, LineOptions>;
};
