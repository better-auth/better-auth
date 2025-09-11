import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";
import { logger } from "../utils/logger";
import { refreshAccessToken } from "../oauth2/refresh-access-token";

export interface GoogleProfile {
	aud: string;
	azp: string;
	email: string;
	email_verified: boolean;
	exp: number;
	/**
	 * The family name of the user, or last name in most
	 * Western languages.
	 */
	family_name: string;
	/**
	 * The given name of the user, or first name in most
	 * Western languages.
	 */
	given_name: string;
	hd?: string;
	iat: number;
	iss: string;
	jti?: string;
	locale?: string;
	name: string;
	nbf?: number;
	picture: string;
	sub: string;
}

export interface GoogleOptions
	extends Omit<ProviderOptions<GoogleProfile>, "clientId"> {
	/**
	 * The client ID(s) of your application
	 * Can be a single client ID string or an array of client IDs for cross-platform support
	 */
	clientId: string | string[];
	/**
	 * The access type to use for the authorization code request
	 */
	accessType?: "offline" | "online";
	/**
	 * The display mode to use for the authorization code request
	 */
	display?: "page" | "popup" | "touch" | "wap";
	/**
	 * The hosted domain of the user
	 */
	hd?: string;
}

export const google = (options: GoogleOptions) => {
	return {
		id: "google",
		name: "Google",
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			loginHint,
			display,
		}) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Google. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Google");
			}

			// Use the first client ID for authorization URL creation
			const primaryClientId = Array.isArray(options.clientId)
				? options.clientId[0] ||
					(() => {
						logger.error("Google clientId array cannot be empty");
						throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
					})()
				: options.clientId;

			const _scopes = options.disableDefaultScope
				? []
				: ["email", "profile", "openid"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			const url = await createAuthorizationURL({
				id: "google",
				options: {
					...options,
					clientId: primaryClientId,
				},
				authorizationEndpoint: "https://accounts.google.com/o/oauth2/auth",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
				accessType: options.accessType,
				display: display || options.display,
				loginHint,
				hd: options.hd,
				additionalParams: {
					include_granted_scopes: "true",
				},
			});
			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			// Use the first client ID for token exchange
			const primaryClientId = Array.isArray(options.clientId)
				? options.clientId[0] ||
					(() => {
						logger.error("Google clientId array cannot be empty");
						throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
					})()
				: options.clientId;

			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options: {
					...options,
					clientId: primaryClientId,
				},
				tokenEndpoint: "https://oauth2.googleapis.com/token",
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					// Use the first client ID for token refresh
					const primaryClientId = Array.isArray(options.clientId)
						? options.clientId[0] ||
							(() => {
								logger.error("Google clientId array cannot be empty");
								throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
							})()
						: options.clientId;

					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: primaryClientId,
							clientKey: options.clientKey,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint: "https://www.googleapis.com/oauth2/v4/token",
					});
				},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}
			const googlePublicKeyUrl = `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`;
			const { data: tokenInfo } = await betterFetch<{
				aud: string;
				iss: string;
				email: string;
				email_verified: boolean;
				name: string;
				picture: string;
				sub: string;
			}>(googlePublicKeyUrl);
			if (!tokenInfo) {
				return false;
			}

			// Check if the token's audience matches any of the configured client IDs
			const clientIds = Array.isArray(options.clientId)
				? options.clientId
				: [options.clientId];

			const isValid =
				clientIds.includes(tokenInfo.aud) &&
				(tokenInfo.iss === "https://accounts.google.com" ||
					tokenInfo.iss === "accounts.google.com");
			return isValid;
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const user = decodeJwt(token.idToken) as GoogleProfile;
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
		options: options as any,
	} satisfies OAuthProvider<GoogleProfile>;
};
