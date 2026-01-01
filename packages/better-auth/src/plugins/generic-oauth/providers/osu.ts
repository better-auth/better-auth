import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";
import { betterFetch } from "@better-fetch/fetch";

export interface OsuOptions extends BaseOAuthProviderOptions {}

interface OsuProfile {
	id: number;
	avatar_url: string;
	username: string;
	email: null;
	email_verified: false;
}

export function osu(options: OsuOptions): GenericOAuthConfig {
	const defaultScopes = ["public", "identify"];

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<OsuProfile>(
			"https://osu.ppy.sh/api/v2/me",
			{
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		return {
			id: profile.id,
			name: profile.username,
			email: profile.email,
			emailVerified: profile.email_verified,
			image: profile.avatar_url,
		};
	};

	return {
		providerId: "osu",
		authorizationUrl: "https://osu.ppy.sh/oauth/authorize",
		tokenUrl: "https://osu.ppy.sh/oauth/token",
		responseMode: "form_post",
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
