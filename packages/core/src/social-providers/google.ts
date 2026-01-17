import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { logger } from "../env";
import { APIError, BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

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
	hd?: string | undefined;
	iat: number;
	iss: string;
	jti?: string | undefined;
	locale?: string | undefined;
	name: string;
	nbf?: number | undefined;
	picture: string;
	sub: string;
}

export interface GoogleOptions extends ProviderOptions<GoogleProfile> {
	/**
	 * The client ID of your application. Can be a single string or an array of strings.
	 *
	 * Use an array to support multiple platforms (Android, iOS, Chrome extensions, Web)
	 * with different client IDs in a single provider configuration. When using an array,
	 * the first client ID will be used for OAuth flows, and all client IDs will be
	 * validated when verifying ID tokens.
	 *
	 * Example:
	 * ```ts
	 * clientId: [
	 *   "web-client-id.apps.googleusercontent.com",
	 *   "android-client-id.apps.googleusercontent.com",
	 *   "ios-client-id.apps.googleusercontent.com"
	 * ]
	 * ```
	 */
	clientId: string | string[];
	/**
	 * Skip nonce verification when validating ID tokens.
	 * This is useful for development or when using native mobile SDKs that
	 * don't support nonce verification.
	 *
	 * @default false
	 * @warning Only enable this in development or if you understand the security implications.
	 */
	skipNonceCheck?: boolean | undefined;
	/**
	 * The access type to use for the authorization code request
	 */
	accessType?: ("offline" | "online") | undefined;
	/**
	 * The display mode to use for the authorization code request
	 */
	display?: ("page" | "popup" | "touch" | "wap") | undefined;
	/**
	 * The hosted domain of the user
	 */
	hd?: string | undefined;
}

export const google = (options: GoogleOptions) => {
	const getPrimaryClientId = () => {
		return Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
	};

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
			const primaryClientId = getPrimaryClientId();
			if (!primaryClientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Google. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Google");
			}
			const normalizedOptions = {
				...options,
				clientId: getPrimaryClientId(),
			};
			const _scopes = options.disableDefaultScope
				? []
				: ["email", "profile", "openid"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			const url = await createAuthorizationURL({
				id: "google",
				options: normalizedOptions,
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
			const normalizedOptions = {
				...options,
				clientId: getPrimaryClientId(),
			};
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options: normalizedOptions,
				tokenEndpoint: "https://oauth2.googleapis.com/token",
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

			// Verify JWT integrity
			// See https://developers.google.com/identity/sign-in/web/backend-auth#verify-the-integrity-of-the-id-token

			const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
			if (!kid || !jwtAlg) return false;

			const publicKey = await getGooglePublicKey(kid);
			const { payload: jwtClaims } = await jwtVerify(token, publicKey, {
				algorithms: [jwtAlg],
				issuer: ["https://accounts.google.com", "accounts.google.com"],
				audience: options.clientId,
				maxTokenAge: "1h",
			});

			if (!options.skipNonceCheck && nonce && jwtClaims.nonce !== nonce) {
				return false;
			}

			return true;
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
		options,
	} satisfies OAuthProvider<GoogleProfile>;
};

export const getGooglePublicKey = async (kid: string) => {
	const { data } = await betterFetch<{
		keys: Array<{
			kid: string;
			alg: string;
			kty: string;
			use: string;
			n: string;
			e: string;
		}>;
	}>("https://www.googleapis.com/oauth2/v3/certs");

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
