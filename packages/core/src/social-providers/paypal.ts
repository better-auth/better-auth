import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL } from "../oauth2";

export interface PayPalProfile {
	user_id: string;
	name: string;
	given_name: string;
	family_name: string;
	middle_name?: string | undefined;
	picture?: string | undefined;
	email: string;
	email_verified: boolean;
	gender?: string | undefined;
	birthdate?: string | undefined;
	zoneinfo?: string | undefined;
	locale?: string | undefined;
	phone_number?: string | undefined;
	address?:
		| {
				street_address?: string;
				locality?: string;
				region?: string;
				postal_code?: string;
				country?: string;
		  }
		| undefined;
	verified_account?: boolean | undefined;
	account_type?: string | undefined;
	age_range?: string | undefined;
	payer_id?: string | undefined;
}

export interface PayPalTokenResponse {
	scope?: string | undefined;
	access_token: string;
	refresh_token?: string | undefined;
	token_type: "Bearer";
	id_token?: string | undefined;
	expires_in: number;
	nonce?: string | undefined;
}

export interface PayPalOptions extends ProviderOptions<PayPalProfile> {
	clientId: string;
	/**
	 * PayPal environment - 'sandbox' for testing, 'live' for production
	 * @default 'sandbox'
	 */
	environment?: ("sandbox" | "live") | undefined;
	/**
	 * Whether to request shipping address information
	 * @default false
	 */
	requestShippingAddress?: boolean | undefined;
}

export const paypal = (options: PayPalOptions) => {
	const environment = options.environment || "sandbox";
	const isSandbox = environment === "sandbox";

	const authorizationEndpoint = isSandbox
		? "https://www.sandbox.paypal.com/signin/authorize"
		: "https://www.paypal.com/signin/authorize";

	const tokenEndpoint = isSandbox
		? "https://api-m.sandbox.paypal.com/v1/oauth2/token"
		: "https://api-m.paypal.com/v1/oauth2/token";

	const userInfoEndpoint = isSandbox
		? "https://api-m.sandbox.paypal.com/v1/identity/oauth2/userinfo"
		: "https://api-m.paypal.com/v1/identity/oauth2/userinfo";

	return {
		id: "paypal",
		name: "PayPal",
		async createAuthorizationURL({ state, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for PayPal. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}

			/**
			 * Log in with PayPal doesn't use traditional OAuth2 scopes
			 * Instead, permissions are configured in the PayPal Developer Dashboard
			 * We don't pass any scopes to avoid "invalid scope" errors
			 **/

			const _scopes: string[] = [];

			const url = await createAuthorizationURL({
				id: "paypal",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
			});
			return url;
		},

		validateAuthorizationCode: async ({ code, redirectURI }) => {
			/**
			 * PayPal requires Basic Auth for token exchange
			 **/

			const credentials = base64.encode(
				`${options.clientId}:${options.clientSecret}`,
			);

			try {
				const response = await betterFetch(tokenEndpoint, {
					method: "POST",
					headers: {
						Authorization: `Basic ${credentials}`,
						Accept: "application/json",
						"Accept-Language": "en_US",
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						grant_type: "authorization_code",
						code: code,
						redirect_uri: redirectURI,
					}).toString(),
				});

				if (!response.data) {
					throw new BetterAuthError("FAILED_TO_GET_ACCESS_TOKEN");
				}

				const data = response.data as PayPalTokenResponse;

				const result = {
					accessToken: data.access_token,
					refreshToken: data.refresh_token,
					accessTokenExpiresAt: data.expires_in
						? new Date(Date.now() + data.expires_in * 1000)
						: undefined,
					idToken: data.id_token,
				};

				return result;
			} catch (error) {
				logger.error("PayPal token exchange failed:", error);
				throw new BetterAuthError("FAILED_TO_GET_ACCESS_TOKEN");
			}
		},

		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					const credentials = base64.encode(
						`${options.clientId}:${options.clientSecret}`,
					);

					try {
						const response = await betterFetch(tokenEndpoint, {
							method: "POST",
							headers: {
								Authorization: `Basic ${credentials}`,
								Accept: "application/json",
								"Accept-Language": "en_US",
								"Content-Type": "application/x-www-form-urlencoded",
							},
							body: new URLSearchParams({
								grant_type: "refresh_token",
								refresh_token: refreshToken,
							}).toString(),
						});

						if (!response.data) {
							throw new BetterAuthError("FAILED_TO_REFRESH_ACCESS_TOKEN");
						}

						const data = response.data as any;
						return {
							accessToken: data.access_token,
							refreshToken: data.refresh_token,
							accessTokenExpiresAt: data.expires_in
								? new Date(Date.now() + data.expires_in * 1000)
								: undefined,
						};
					} catch (error) {
						logger.error("PayPal token refresh failed:", error);
						throw new BetterAuthError("FAILED_TO_REFRESH_ACCESS_TOKEN");
					}
				},

		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}
			try {
				const payload = decodeJwt(token);
				return !!payload.sub;
			} catch (error) {
				logger.error("Failed to verify PayPal ID token:", error);
				return false;
			}
		},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (!token.accessToken) {
				logger.error("Access token is required to fetch PayPal user info");
				return null;
			}

			try {
				const response = await betterFetch<PayPalProfile>(
					`${userInfoEndpoint}?schema=paypalv1.1`,
					{
						headers: {
							Authorization: `Bearer ${token.accessToken}`,
							Accept: "application/json",
						},
					},
				);

				if (!response.data) {
					logger.error("Failed to fetch user info from PayPal");
					return null;
				}

				const userInfo = response.data;
				const userMap = await options.mapProfileToUser?.(userInfo);

				const result = {
					user: {
						id: userInfo.user_id,
						name: userInfo.name,
						email: userInfo.email,
						image: userInfo.picture,
						emailVerified: userInfo.email_verified,
						...userMap,
					},
					data: userInfo,
				};

				return result;
			} catch (error) {
				logger.error("Failed to fetch user info from PayPal:", error);
				return null;
			}
		},

		options,
	} satisfies OAuthProvider<PayPalProfile>;
};
