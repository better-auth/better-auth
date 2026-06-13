import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface YandexOptions extends BaseOAuthProviderOptions {}

interface YandexProfile {
	login: string;
	id: string;
	client_id: string;
	/* cspell:disable-next-line */
	psuid: string;
	emails?: string[];
	default_email?: string;
	is_avatar_empty?: boolean;
	default_avatar_id?: string;
	birthday?: string | null;
	first_name?: string;
	last_name?: string;
	display_name?: string;
	real_name?: string;
	sex?: "male" | "female" | null;
	default_phone?: { id: number; number: string };
}

/**
 * Yandex OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, yandex } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         yandex({
 *           clientId: process.env.YANDEX_CLIENT_ID,
 *           clientSecret: process.env.YANDEX_CLIENT_SECRET,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function yandex(options: YandexOptions): GenericOAuthConfig {
	const defaultScopes = ["login:info", "login:email", "login:avatar"];

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<YandexProfile>(
			"https://login.yandex.ru/info?format=json",
			{
				method: "GET",
				headers: {
					Authorization: `OAuth ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		return {
			id: profile.id,
			name:
				profile.display_name ??
				profile.real_name ??
				profile.first_name ??
				profile.login,
			email: profile.default_email,
			emailVerified: !!profile.default_email,
			image:
				!profile.is_avatar_empty && profile.default_avatar_id
					? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
					: undefined,
		};
	};

	return {
		providerId: "yandex",
		authorizationUrl: "https://oauth.yandex.com/authorize",
		tokenUrl: "https://oauth.yandex.com/token",
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
