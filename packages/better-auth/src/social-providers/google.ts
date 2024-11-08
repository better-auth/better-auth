import { parseJWT } from "oslo/jwt";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { BetterAuthError } from "../error";
import { logger } from "../utils/logger";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";
import { betterFetch } from "@better-fetch/fetch";

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

export interface GoogleOptions extends ProviderOptions {
	accessType?: "offline" | "online";
	prompt?: "none" | "consent" | "select_account";
}

export const google = (options: GoogleOptions) => {
	return {
		id: "google",
		name: "Google",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Google. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Google");
			}
			const _scopes = scopes || ["email", "profile", "openid"];
			options.scope && _scopes.push(...options.scope);

			const url = await createAuthorizationURL({
				id: "google",
				options,
				authorizationEndpoint: "https://accounts.google.com/o/oauth2/auth",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
			});
			options.accessType &&
				url.searchParams.set("access_type", options.accessType);
			options.prompt && url.searchParams.set("prompt", options.prompt);
			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint: "https://oauth2.googleapis.com/token",
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
			const isValid =
				tokenInfo.aud === options.clientId &&
				tokenInfo.iss === "https://accounts.google.com";
			return isValid;
		},
		async getUserInfo(token) {
			if (!token.idToken) {
				return null;
			}
			const user = parseJWT(token.idToken)?.payload as GoogleProfile;
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified: user.email_verified,
				},
				data: user,
			};
		},
	} satisfies OAuthProvider<GoogleProfile>;
};
