import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

/**
 * Telegram OIDC ID token payload.
 *
 * Telegram's token endpoint returns an `id_token` (JWT) with user info.
 * There is no separate userinfo endpoint — all profile data lives in this token.
 *
 * @see https://core.telegram.org/bots/telegram-login
 */
export interface TelegramProfile extends Record<string, any> {
	/** Telegram user ID (numeric, returned as string or number in the `sub` claim) */
	sub: string | number;
	/** User's first name, or full display name */
	name?: string;
	/** Telegram username (without @) */
	preferred_username?: string;
	/** URL to the user's profile photo */
	picture?: string;
	/** Phone number in international format (requires `phone` scope) */
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
		createAuthorizationURL(data) {
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "phone"];
			if (options.scope) _scopes.push(...options.scope);
			if (data.scopes) _scopes.push(...data.scopes);
			return createAuthorizationURL({
				id: "telegram",
				options,
				authorizationEndpoint: "https://oauth.telegram.org/auth",
				scopes: _scopes,
				state: data.state,
				codeVerifier: data.codeVerifier,
				redirectURI: data.redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				authentication: "basic",
				tokenEndpoint: "https://oauth.telegram.org/token",
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const idToken = token.idToken;
			if (!idToken) {
				return null;
			}

			// Decode the JWT payload (Telegram returns user info in the id_token)
			const segments = idToken.split(".");
			const payloadSegment = segments[1];
			if (!payloadSegment) {
				return null;
			}

			const base64 = payloadSegment
				.replace(/-/g, "+")
				.replace(/_/g, "/")
				.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
			const payloadJson = atob(base64);
			const profile = JSON.parse(payloadJson) as TelegramProfile;

			if (!profile.sub) {
				return null;
			}

			const userId = String(profile.sub);
			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: userId,
					name: profile.name || profile.preferred_username || `tg_${userId}`,
					email: profile.phone_number
						? `${profile.phone_number}@telegram.local`
						: null,
					image: profile.picture,
					emailVerified: true,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<TelegramProfile>;
};
