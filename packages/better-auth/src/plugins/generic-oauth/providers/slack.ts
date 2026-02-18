import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface SlackOptions extends BaseOAuthProviderOptions {}

interface SlackProfile {
	sub: string;
	"https://slack.com/user_id": string;
	"https://slack.com/team_id": string;
	email: string;
	email_verified: boolean;
	name: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
	locale?: string;
	"https://slack.com/team_name"?: string;
	"https://slack.com/team_domain"?: string;
	"https://slack.com/user_image_512"?: string;
	[key: string]: any;
}

/**
 * Slack OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, slack } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         slack({
 *           clientId: process.env.SLACK_CLIENT_ID,
 *           clientSecret: process.env.SLACK_CLIENT_SECRET,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function slack(options: SlackOptions): GenericOAuthConfig {
	const defaultScopes = ["openid", "profile", "email"];

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<SlackProfile>(
			"https://slack.com/api/openid.connect.userInfo",
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
			id: profile["https://slack.com/user_id"] ?? profile.sub,
			name: profile.name,
			email: profile.email,
			image: profile.picture ?? profile["https://slack.com/user_image_512"],
			emailVerified: profile.email_verified ?? false,
		};
	};

	return {
		providerId: "slack",
		authorizationUrl: "https://slack.com/openid/connect/authorize",
		tokenUrl: "https://slack.com/api/openid.connect.token",
		userInfoUrl: "https://slack.com/api/openid.connect.userInfo",
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
