import { betterFetch } from "@better-fetch/fetch";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";
export interface FacebookProfile {
	id: string;
	name: string;
	email: string;
	email_verified: boolean;
	picture: {
		data: {
			height: number;
			is_silhouette: boolean;
			url: string;
			width: number;
		};
	};
}

export interface FacebookOptions extends ProviderOptions<FacebookProfile> {
	clientId: string;
	/**
	 * Extend list of fields to retrieve from the Facebook user profile.
	 *
	 * @default ["id", "name", "email", "picture"]
	 */
	fields?: string[] | undefined;

	/**
	 * The config id to use when undergoing oauth
	 */
	configId?: string | undefined;
}

export const facebook = (options: FacebookOptions) => {
	return {
		id: "facebook",
		name: "Facebook",
		async createAuthorizationURL({ state, scopes, redirectURI, loginHint }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["email", "public_profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "facebook",
				options,
				authorizationEndpoint: "https://www.facebook.com/v21.0/dialog/oauth",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				additionalParams: options.configId
					? {
							config_id: options.configId,
						}
					: {},
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://graph.facebook.com/oauth/access_token",
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}

			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}

			/* limited login */
			// check is limited token
			if (token.split(".").length === 3) {
				try {
					const { payload: jwtClaims } = await jwtVerify(
						token,
						createRemoteJWKSet(
							// https://developers.facebook.com/docs/facebook-login/limited-login/token/#jwks
							new URL(
								"https://limited.facebook.com/.well-known/oauth/openid/jwks/",
							),
						),
						{
							algorithms: ["RS256"],
							audience: options.clientId,
							issuer: "https://www.facebook.com",
						},
					);

					if (nonce && jwtClaims.nonce !== nonce) {
						return false;
					}

					return !!jwtClaims;
				} catch (error) {
					return false;
				}
			}

			/* access_token */
			return true;
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
						tokenEndpoint:
							"https://graph.facebook.com/v18.0/oauth/access_token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (token.idToken && token.idToken.split(".").length === 3) {
				const profile = decodeJwt(token.idToken) as {
					sub: string;
					email: string;
					name: string;
					picture: string;
				};

				const user = {
					id: profile.sub,
					name: profile.name,
					email: profile.email,
					picture: {
						data: {
							url: profile.picture,
							height: 100,
							width: 100,
							is_silhouette: false,
						},
					},
				};

				// https://developers.facebook.com/docs/facebook-login/limited-login/permissions
				// Facebook ID token does not include email_verified claim.
				// We default to false for security consistency.
				const userMap = await options.mapProfileToUser?.({
					...user,
					email_verified: false,
				});

				return {
					user: {
						...user,
						emailVerified: false,
						...userMap,
					},
					data: profile,
				};
			}

			const fields = [
				"id",
				"name",
				"email",
				"picture",
				...(options?.fields || []),
			];
			const { data: profile, error } = await betterFetch<FacebookProfile>(
				"https://graph.facebook.com/me?fields=" + fields.join(","),
				{
					auth: {
						type: "Bearer",
						token: token.accessToken,
					},
				},
			);
			if (error) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.name,
					email: profile.email,
					image: profile.picture.data.url,
					emailVerified: profile.email_verified,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<FacebookProfile>;
};
