import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface LineOptions extends BaseOAuthProviderOptions {
	/**
	 * Unique provider identifier for this LINE channel.
	 * Use different providerIds for different countries/channels (e.g., "line-jp", "line-th", "line-tw").
	 * @default "line"
	 */
	providerId?: string;
}

interface LineIdTokenPayload {
	iss: string;
	sub: string;
	aud: string;
	exp: number;
	iat: number;
	name?: string;
	picture?: string;
	email?: string;
	amr?: string[];
	nonce?: string;
}

interface LineUserInfo {
	sub: string;
	name?: string;
	picture?: string;
	email?: string;
}

/**
 * LINE OAuth provider helper
 *
 * LINE requires separate channels for different countries (Japan, Thailand, Taiwan, etc.).
 * Each channel has its own clientId and clientSecret. To support multiple countries,
 * call this function multiple times with different providerIds and credentials.
 *
 * @example
 * ```ts
 * import { genericOAuth, line } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         // Japan channel
 *         line({
 *           providerId: "line-jp",
 *           clientId: process.env.LINE_JP_CLIENT_ID,
 *           clientSecret: process.env.LINE_JP_CLIENT_SECRET,
 *         }),
 *         // Thailand channel
 *         line({
 *           providerId: "line-th",
 *           clientId: process.env.LINE_TH_CLIENT_ID,
 *           clientSecret: process.env.LINE_TH_CLIENT_SECRET,
 *         }),
 *         // Taiwan channel
 *         line({
 *           providerId: "line-tw",
 *           clientId: process.env.LINE_TW_CLIENT_ID,
 *           clientSecret: process.env.LINE_TW_CLIENT_SECRET,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function line(options: LineOptions): GenericOAuthConfig {
	const defaultScopes = ["openid", "profile", "email"];
	const authorizationUrl = "https://access.line.me/oauth2/v2.1/authorize";
	const tokenUrl = "https://api.line.me/oauth2/v2.1/token";
	const userInfoUrl = "https://api.line.me/oauth2/v2.1/userinfo";
	const verifyIdTokenUrl = "https://api.line.me/oauth2/v2.1/verify";

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		let profile: LineUserInfo | LineIdTokenPayload | null = null;

		if (tokens.idToken) {
			try {
				profile = decodeJwt(tokens.idToken) as LineIdTokenPayload;
			} catch {
				// If ID token decoding fails, fall back to UserInfo endpoint
			}
		}

		if (!profile) {
			const { data, error } = await betterFetch<LineUserInfo>(userInfoUrl, {
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			});

			if (error || !data) {
				return null;
			}

			profile = data;
		}

		if (!profile) {
			return null;
		}

		return {
			id: profile.sub,
			name: profile.name,
			email: profile.email,
			image: profile.picture,
			emailVerified: false,
		};
	};

	return {
		providerId: options.providerId ?? "line",
		authorizationUrl,
		tokenUrl,
		userInfoUrl,
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		scopes: options.scopes ?? defaultScopes,
		redirectURI: options.redirectURI,
		pkce: options.pkce,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
		getUserInfo,
	};
}
