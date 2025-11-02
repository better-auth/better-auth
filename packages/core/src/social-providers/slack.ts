import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { refreshAccessToken, validateAuthorizationCode } from "../oauth2";

export interface SlackProfile extends Record<string, any> {
	ok: boolean;
	sub: string;
	"https://slack.com/user_id": string;
	"https://slack.com/team_id": string;
	email: string;
	email_verified: boolean;
	date_email_verified: number;
	name: string;
	picture: string;
	given_name: string;
	family_name: string;
	locale: string;
	"https://slack.com/team_name": string;
	"https://slack.com/team_domain": string;
	"https://slack.com/user_image_24": string;
	"https://slack.com/user_image_32": string;
	"https://slack.com/user_image_48": string;
	"https://slack.com/user_image_72": string;
	"https://slack.com/user_image_192": string;
	"https://slack.com/user_image_512": string;
	"https://slack.com/team_image_34": string;
	"https://slack.com/team_image_44": string;
	"https://slack.com/team_image_68": string;
	"https://slack.com/team_image_88": string;
	"https://slack.com/team_image_102": string;
	"https://slack.com/team_image_132": string;
	"https://slack.com/team_image_230": string;
	"https://slack.com/team_image_default": boolean;
}

export interface SlackOptions extends ProviderOptions<SlackProfile> {
	clientId: string;
}

export const slack = (options: SlackOptions) => {
	return {
		id: "slack",
		name: "Slack",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "email"];
			if (scopes) _scopes.push(...scopes);
			if (options.scope) _scopes.push(...options.scope);
			const url = new URL("https://slack.com/openid/connect/authorize");
			url.searchParams.set("scope", _scopes.join(" "));
			url.searchParams.set("response_type", "code");
			url.searchParams.set("client_id", options.clientId);
			url.searchParams.set("redirect_uri", options.redirectURI || redirectURI);
			url.searchParams.set("state", state);
			return url;
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://slack.com/api/openid.connect.token",
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
						tokenEndpoint: "https://slack.com/api/openid.connect.token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<SlackProfile>(
				"https://slack.com/api/openid.connect.userInfo",
				{
					headers: {
						authorization: `Bearer ${token.accessToken}`,
					},
				},
			);

			if (error) {
				return null;
			}

			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile["https://slack.com/user_id"],
					name: profile.name || "",
					email: profile.email,
					emailVerified: profile.email_verified,
					image: profile.picture || profile["https://slack.com/user_image_512"],
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<SlackProfile>;
};
