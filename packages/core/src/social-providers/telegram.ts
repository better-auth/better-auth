import { decodeJwt } from "jose";
import { logger } from "../env";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface TelegramProfile {
	/** Unique Telegram user ID (subject claim) */
	sub: string;
	/** User's full display name */
	name?: string;
	/** User's given / first name */
	given_name?: string;
	/** User's family / last name */
	family_name?: string;
	/** Telegram @username handle */
	preferred_username?: string;
	/** User profile photo / avatar URL */
	picture?: string;
	/** Token issuer ("https://oauth.telegram.org") */
	iss?: string;
	/** Audience (Client ID) */
	aud?: string;
	/** Expiration timestamp */
	exp?: number;
	/** Issued-at timestamp */
	iat?: number;
}

export interface TelegramOptions extends ProviderOptions<TelegramProfile> {
	clientId: string;
	clientSecret: string;
}

export const telegram = (options: TelegramOptions) => {
	const authorizationEndpoint = "https://oauth.telegram.org/auth";
	const tokenEndpoint = "https://oauth.telegram.org/token";

	return {
		id: "telegram",
		name: "Telegram",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["openid", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "telegram",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
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
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (!token.idToken) {
				logger.error("Telegram OIDC: ID Token missing from token response.");
				return null;
			}

			const profile = decodeJwt(token.idToken) as unknown as TelegramProfile;

			if (!profile || !profile.sub) {
				logger.error("Telegram OIDC: Invalid profile claims in ID token.");
				return null;
			}

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.sub,
					name:
						profile.name ||
						[profile.given_name, profile.family_name]
							.filter(Boolean)
							.join(" ") ||
						profile.preferred_username ||
						profile.sub,
					email: `${profile.sub}@telegram.invalid`,
					image: profile.picture || undefined,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<TelegramProfile>;
};
