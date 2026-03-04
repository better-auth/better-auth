import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { logger } from "../env";
import { APIError, BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface TelegramProfile {
	/** Issuer — always "https://oauth.telegram.org" */
	iss: string;
	/** Audience — your bot's Client ID */
	aud: string;
	/** Subject — unique Telegram user identifier (string) */
	sub: string;
	/** Issued-at timestamp */
	iat: number;
	/** Expiration timestamp */
	exp: number;
	/** Telegram user ID (numeric) */
	id: number;
	/** User's full name */
	name?: string;
	/** Telegram username */
	preferred_username?: string;
	/** Profile photo URL */
	picture?: string;
	/** Verified phone number (requires "phone" scope) */
	phone_number?: string;
}

export interface TelegramOptions extends ProviderOptions<TelegramProfile> {
	clientId: string;
	clientSecret: string;
}

export const telegram = (options: TelegramOptions) => {
	return {
		id: "telegram",
		name: "Telegram",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Telegram. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Telegram");
			}
			const _scopes = options.disableDefaultScope ? [] : ["openid", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			const url = await createAuthorizationURL({
				id: "telegram",
				options,
				authorizationEndpoint: "https://oauth.telegram.org/auth",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
			});
			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://oauth.telegram.org/token",
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
				const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
				if (!kid || !jwtAlg) return false;

				const publicKey = await getTelegramPublicKey(kid);
				const { payload: jwtClaims } = await jwtVerify(token, publicKey, {
					algorithms: [jwtAlg],
					issuer: "https://oauth.telegram.org",
					audience: String(options.clientId),
				});

				if (nonce && jwtClaims.nonce !== nonce) {
					return false;
				}

				return true;
			} catch {
				return false;
			}
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const profile = decodeJwt(token.idToken) as TelegramProfile;
			const userMap = await options.mapProfileToUser?.(profile);
			// Telegram does not provide email or email_verified claim.
			// We default to false for security consistency.
			return {
				user: {
					id: profile.sub,
					name: profile.name || profile.preferred_username || "",
					image: profile.picture,
					email: `${profile.sub}@telegram.user`, // Telegram does not provide email
					emailVerified: false,
					...userMap,
				},
				data: {
					...profile,
				},
			};
		},
		options,
	} satisfies OAuthProvider<TelegramProfile>;
};

export const getTelegramPublicKey = async (kid: string) => {
	const { data } = await betterFetch<{
		keys: Array<{
			kid: string;
			alg: string;
			kty: string;
			use: string;
			n: string;
			e: string;
		}>;
	}>("https://oauth.telegram.org/.well-known/jwks.json");

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
