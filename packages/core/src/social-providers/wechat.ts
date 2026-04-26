import { betterFetch } from "@better-fetch/fetch";
import type { OAuth2Tokens, OAuthProvider, ProviderOptions } from "../oauth2";

/**
 * WeChat user profile information
 * @see https://developers.weixin.qq.com/doc/oplatform/en/Website_App/WeChat_Login/Wechat_Login.html
 */
export interface WeChatProfile extends Record<string, any> {
	/**
	 * User's unique OpenID
	 */
	openid: string;
	/**
	 * User's nickname
	 */
	nickname: string;
	/**
	 * User's avatar image URL
	 */
	headimgurl: string;
	/**
	 * User's privileges
	 */
	privilege: string[];
	/**
	 * User's UnionID (unique across the developer's various applications)
	 */
	unionid?: string;
	/** @note Email is currently unsupported by WeChat */
	email?: string;
}

export interface WeChatOptions extends ProviderOptions<WeChatProfile> {
	/**
	 * WeChat App ID
	 */
	clientId: string;
	/**
	 * WeChat App Secret
	 */
	clientSecret: string;
	/**
	 * Platform type for WeChat login
	 * - Currently only supports "WebsiteApp" for WeChat Website Application (网站应用)
	 * @default "WebsiteApp"
	 */
	platformType?: "WebsiteApp";

	/**
	 * UI language for the WeChat login page
	 * cn for Simplified Chinese, en for English
	 * @default "cn" if left undefined
	 */
	lang?: "cn" | "en";
	/**
	 * Custom refresh token endpoint URL.
	 * WeChat uses a separate refresh endpoint from the authorization code exchange.
	 */
	refreshTokenEndpoint?: string;
}

export const wechat = (options: WeChatOptions) => {
	return {
		id: "wechat",
		name: "WeChat",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["snsapi_login"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			// WeChat uses non-standard OAuth2 parameters (appid instead of client_id)
			// and requires a fragment (#wechat_redirect), so we construct the URL manually.
			const url = new URL(
				options.authorizationEndpoint ??
					"https://open.weixin.qq.com/connect/qrconnect",
			);
			url.searchParams.set("scope", _scopes.join(","));
			url.searchParams.set("response_type", "code");
			url.searchParams.set("appid", options.clientId);
			url.searchParams.set("redirect_uri", options.redirectURI || redirectURI);
			url.searchParams.set("state", state);
			url.searchParams.set("lang", options.lang || "cn");
			url.hash = "wechat_redirect";

			return url;
		},

		// WeChat uses non-standard token exchange (appid/secret instead of
		// client_id/client_secret, GET instead of POST), so shared helpers
		// like validateAuthorizationCode/getOAuth2Tokens cannot be used directly.
		validateAuthorizationCode: async ({ code }) => {
			const params = new URLSearchParams({
				appid: options.clientId,
				secret: options.clientSecret,
				code: code,
				grant_type: "authorization_code",
			});

			const { data: tokenData, error } = await betterFetch<{
				access_token: string;
				expires_in: number;
				refresh_token: string;
				openid: string;
				scope: string;
				unionid?: string;
				errcode?: number;
				errmsg?: string;
			}>(
				`${
					options.tokenEndpoint ??
					"https://api.weixin.qq.com/sns/oauth2/access_token"
				}?${params.toString()}`,
				{
					method: "GET",
				},
			);

			if (error || !tokenData || tokenData.errcode) {
				throw new Error(
					`Failed to validate authorization code: ${tokenData?.errmsg || error?.message || "Unknown error"}`,
				);
			}

			return {
				tokenType: "Bearer" as const,
				accessToken: tokenData.access_token,
				refreshToken: tokenData.refresh_token,
				accessTokenExpiresAt: new Date(
					Date.now() + tokenData.expires_in * 1000,
				),
				scopes: tokenData.scope.split(","),
				// WeChat requires openid for the userinfo endpoint, which is
				// returned alongside the access token.
				openid: tokenData.openid,
				unionid: tokenData.unionid,
			};
		},

		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					const params = new URLSearchParams({
						appid: options.clientId,
						grant_type: "refresh_token",
						refresh_token: refreshToken,
					});

					const { data: tokenData, error } = await betterFetch<{
						access_token: string;
						expires_in: number;
						refresh_token: string;
						openid: string;
						scope: string;
						errcode?: number;
						errmsg?: string;
					}>(
						`${
							options.refreshTokenEndpoint ??
							"https://api.weixin.qq.com/sns/oauth2/refresh_token"
						}?${params.toString()}`,
						{
							method: "GET",
						},
					);

					if (error || !tokenData || tokenData.errcode) {
						throw new Error(
							`Failed to refresh access token: ${tokenData?.errmsg || error?.message || "Unknown error"}`,
						);
					}

					return {
						tokenType: "Bearer" as const,
						accessToken: tokenData.access_token,
						refreshToken: tokenData.refresh_token,
						accessTokenExpiresAt: new Date(
							Date.now() + tokenData.expires_in * 1000,
						),
						scopes: tokenData.scope.split(","),
					};
				},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const openid = (token as OAuth2Tokens & { openid?: string }).openid;

			if (!openid) {
				return null;
			}

			const params = new URLSearchParams({
				access_token: token.accessToken || "",
				openid: openid,
				lang: "zh_CN",
			});

			const { data: profile, error } = await betterFetch<
				WeChatProfile & { errcode?: number; errmsg?: string }
			>(
				`${
					options.userInfoEndpoint ?? "https://api.weixin.qq.com/sns/userinfo"
				}?${params.toString()}`,
				{
					method: "GET",
				},
			);

			if (error || !profile || profile.errcode) {
				return null;
			}

			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.unionid || profile.openid || openid,
					name: profile.nickname,
					email: profile.email || null,
					image: profile.headimgurl,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<WeChatProfile, WeChatOptions>;
};
