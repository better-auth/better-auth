import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { logger } from "../env";
import { APIError, BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL } from "../oauth2";

/**
 * ID token signing algorithms advertised by PayPal's OpenID configuration.
 * Anything outside this allowlist is rejected so each token is only ever
 * verified with the algorithm it was issued for.
 *
 * @see https://www.paypal.com/.well-known/openid-configuration
 */
const PAYPAL_ID_TOKEN_ALGORITHMS = ["RS256", "HS256"] as const;

export interface PayPalProfile {
	sub?: string | undefined;
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

	/**
	 * Issuer and JWKS endpoints used to cryptographically verify ID tokens.
	 *
	 * @see https://www.paypal.com/.well-known/openid-configuration
	 */
	const issuer = isSandbox
		? "https://www.sandbox.paypal.com"
		: "https://www.paypal.com";

	const jwksEndpoint = isSandbox
		? "https://api.sandbox.paypal.com/v1/oauth2/certs"
		: "https://api.paypal.com/v1/oauth2/certs";

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

			// Cryptographically verify the ID token. Decoding alone is not enough:
			// the signature, issuer, audience and expiration must all be checked
			// before the token's claims can be relied on as proof of identity.
			// See https://www.paypal.com/.well-known/openid-configuration

			try {
				const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
				if (!jwtAlg) return false;
				if (
					!PAYPAL_ID_TOKEN_ALGORITHMS.includes(
						jwtAlg as (typeof PAYPAL_ID_TOKEN_ALGORITHMS)[number],
					)
				) {
					return false;
				}

				// PayPal can sign ID tokens either asymmetrically (RS256, verified
				// against the published JWKS) or symmetrically (HS256, verified with
				// the client secret). Selecting the key by algorithm keeps the two
				// paths separate so each algorithm is only verified with its
				// corresponding key type.
				const key =
					jwtAlg === "HS256"
						? new TextEncoder().encode(options.clientSecret)
						: kid
							? await getPayPalPublicKey(kid, jwksEndpoint)
							: undefined;
				if (!key) return false;

				const { payload: jwtClaims } = await jwtVerify(token, key, {
					algorithms: [jwtAlg],
					issuer,
					audience: options.clientId,
					maxTokenAge: "1h",
				});

				if (nonce && jwtClaims.nonce !== nonce) {
					return false;
				}

				return true;
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
				if (token.idToken) {
					let idTokenSubject: string | undefined;
					try {
						idTokenSubject = decodeJwt(token.idToken).sub;
					} catch (error) {
						logger.error("Failed to decode PayPal ID token:", error);
						return null;
					}

					// OIDC binds UserInfo to the ID Token with `sub`. Keep `user_id`
					// as the account id below for existing PayPal account mappings.
					const userInfoSubject = userInfo.sub ?? userInfo.user_id;
					if (!idTokenSubject || userInfoSubject !== idTokenSubject) {
						logger.error(
							"PayPal user info subject does not match ID token subject",
						);
						return null;
					}
				}

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

export const getPayPalPublicKey = async (kid: string, jwksUri: string) => {
	const { data } = await betterFetch<{
		keys: Array<{
			kid: string;
			alg: string;
			kty: string;
			use: string;
			n: string;
			e: string;
		}>;
	}>(jwksUri);

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
};
