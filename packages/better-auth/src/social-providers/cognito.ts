import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";
import { logger } from "../utils/logger";
import { refreshAccessToken } from "../oauth2/refresh-access-token";

export interface CognitoProfile {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string;
	given_name?: string;
	family_name?: string;
	picture?: string;
	username?: string;
	locale?: string;
	phone_number?: string;
	phone_number_verified?: boolean;
	aud: string;
	iss: string;
	exp: number;
	iat: number;
	// Custom attributes from Cognito can be added here
	[key: string]: any;
}

export interface CognitoOptions extends ProviderOptions<CognitoProfile> {
	/**
	 * The Cognito domain (e.g., "your-app.auth.us-east-1.amazoncognito.com")
	 */
	domain: string;
	/**
	 * AWS region where User Pool is hosted (e.g., "us-east-1")
	 */
	region: string;
	userPoolId: string;
}

export const cognito = (options: CognitoOptions) => {
	if (!options.domain || !options.region) {
		logger.error(
			"Domain and region are required for AWS Cognito. Make sure to provide them in the options.",
		);
		throw new BetterAuthError("DOMAIN_AND_REGION_REQUIRED");
	}

	const cleanDomain = options.domain.replace(/^https?:\/\//, "");
	const authorizationEndpoint = `https://${cleanDomain}/oauth2/authorize`;
	const tokenEndpoint = `https://${cleanDomain}/oauth2/token`;
	const userInfoEndpoint = `https://${cleanDomain}/oauth2/userinfo`;

	return {
		id: "cognito",
		name: "Cognito",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret || !options.userPoolId) {
				logger.error(
					"Client Id and Client Secret is required for AWS Cognito. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}

			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "email"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			const url = await createAuthorizationURL({
				id: "cognito",
				options: {
					...options,
				},
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
			});
			return url;
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

		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}

			try {
				const decoded = decodeJwt(token) as CognitoProfile;
				const expectedIssuer = `https://cognito-idp.${options.region}.amazonaws.com/${options.userPoolId}`;
				const isValidIssuer = decoded.iss === expectedIssuer;

				const isValidAudience = decoded.aud === options.clientId;
				const now = Math.floor(Date.now() / 1000);
				const isNotExpired = decoded.exp > now;

				return isValidIssuer && isValidAudience && isNotExpired;
			} catch (error) {
				logger.error("Failed to verify ID token:", error);
				return false;
			}
		},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (token.idToken) {
				try {
					const user = decodeJwt(token.idToken) as CognitoProfile;
					const userMap = await options.mapProfileToUser?.(user);

					return {
						user: {
							id: user.sub,
							name: user.name || user.given_name || user.username,
							email: user.email,
							image: user.picture,
							emailVerified: user.email_verified,
							...userMap,
						},
						data: user,
					};
				} catch (error) {
					logger.error("Failed to decode ID token:", error);
				}
			}

			if (token.accessToken) {
				try {
					const { data: userInfo } = await betterFetch<CognitoProfile>(
						userInfoEndpoint,
						{
							headers: {
								Authorization: `Bearer ${token.accessToken}`,
							},
						},
					);

					if (userInfo) {
						const userMap = await options.mapProfileToUser?.(userInfo);
						return {
							user: {
								id: userInfo.sub,
								name: userInfo.name || userInfo.given_name || userInfo.username,
								email: userInfo.email,
								image: userInfo.picture,
								emailVerified: userInfo.email_verified,
								...userMap,
							},
							data: userInfo,
						};
					}
				} catch (error) {
					logger.error("Failed to fetch user info from Cognito:", error);
				}
			}

			return null;
		},

		options,
	} satisfies OAuthProvider<CognitoProfile>;
};
