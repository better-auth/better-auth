import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";
import { logger } from "@better-auth/core/env";
import { refreshAccessToken } from "@better-auth/core/oauth2";
import { APIError } from "better-call";

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
	clientId: string;
	/**
	 * The Cognito domain (e.g., "your-app.auth.us-east-1.amazoncognito.com")
	 */
	domain: string;
	/**
	 * AWS region where User Pool is hosted (e.g., "us-east-1")
	 */
	region: string;
	userPoolId: string;
	requireClientSecret?: boolean;
}

export const cognito = (options: CognitoOptions) => {
	if (!options.domain || !options.region || !options.userPoolId) {
		logger.error(
			"Domain, region and userPoolId are required for Amazon Cognito. Make sure to provide them in the options.",
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
			if (!options.clientId) {
				logger.error(
					"ClientId is required for Amazon Cognito. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}

			if (options.requireClientSecret && !options.clientSecret) {
				logger.error(
					"Client Secret is required when requireClientSecret is true. Make sure to provide it in the options.",
				);
				throw new BetterAuthError("CLIENT_SECRET_REQUIRED");
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
				const decodedHeader = decodeProtectedHeader(token);
				const { kid, alg: jwtAlg } = decodedHeader;
				if (!kid || !jwtAlg) return false;

				const publicKey = await getCognitoPublicKey(
					kid,
					options.region,
					options.userPoolId,
				);
				const expectedIssuer = `https://cognito-idp.${options.region}.amazonaws.com/${options.userPoolId}`;

				const { payload: jwtClaims } = await jwtVerify(token, publicKey, {
					algorithms: [jwtAlg],
					issuer: expectedIssuer,
					audience: options.clientId,
					maxTokenAge: "1h",
				});

				if (nonce && jwtClaims.nonce !== nonce) {
					return false;
				}
				return true;
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
					const profile = decodeJwt<CognitoProfile>(token.idToken);
					if (!profile) {
						return null;
					}
					const name =
						profile.name ||
						profile.given_name ||
						profile.username ||
						profile.email;
					const enrichedProfile = {
						...profile,
						name,
					};
					const userMap = await options.mapProfileToUser?.(enrichedProfile);

					return {
						user: {
							id: profile.sub,
							name: enrichedProfile.name,
							email: profile.email,
							image: profile.picture,
							emailVerified: profile.email_verified,
							...userMap,
						},
						data: enrichedProfile,
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

export const getCognitoPublicKey = async (
	kid: string,
	region: string,
	userPoolId: string,
) => {
	const COGNITO_JWKS_URI = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;

	try {
		const { data } = await betterFetch<{
			keys: Array<{
				kid: string;
				alg: string;
				kty: string;
				use: string;
				n: string;
				e: string;
			}>;
		}>(COGNITO_JWKS_URI);

		if (!data?.keys) {
			throw new APIError("BAD_REQUEST", {
				message: "Keys not found",
			});
		}

		const jwk = data.keys.find((key) => key.kid === kid);
		if (!jwk) {
			throw new Error(`JWK with kid ${kid} not found`);
		}

		return await importJWK(jwk, jwk.alg);
	} catch (error) {
		logger.error("Failed to fetch Cognito public key:", error);
		throw error;
	}
};
