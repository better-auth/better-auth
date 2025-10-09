import { betterFetch } from "@better-fetch/fetch";
import type {
	OAuth2Tokens,
	OAuthProvider,
	ProviderOptions,
} from "@better-auth/core/oauth2";

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
	/** @note Email is currently unsupported by WeChat  */
	email?: string;
	/**
	 * Error information if the request failed
	 */
	error?: {
		/**
		 * Error code
		 */
		errcode?: number;
		/**
		 * Error message
		 */
		errmsg?: string;
	};
}

export interface WeChatOptions extends ProviderOptions {
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
}

export const wechat = (options: WeChatOptions) => {
	return {
		id: "wechat",
		name: "WeChat",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["snsapi_login"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			const baseUrl = "https://open.weixin.qq.com/connect/qrconnect";

			return new URL(
				`${baseUrl}?scope=${_scopes.join(
					",",
				)}&response_type=code&appid=${options.clientId}&redirect_uri=${encodeURIComponent(
					options.redirectURI || redirectURI,
				)}&state=${state}&lang=${options.lang || "cn"}#wechat_redirect`,
			);
		},

		validateAuthorizationCode: async ({ code, redirectURI }) => {
			const params = new URLSearchParams({
				appid: options.clientId,
				secret: options.clientSecret,
				code: code,
				grant_type: "authorization_code",
			});

			const { data: tokenData, error } = await betterFetch<{
				access_token: string;
				// How long the access token is valid, in seconds
				expires_in: number;
				refresh_token: string;
				openid: string;
				scope: string;
				unionid?: string;
				errcode?: number;
				errmsg?: string;
			}>(
				"https://api.weixin.qq.com/sns/oauth2/access_token?" +
					params.toString(),
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
						"https://api.weixin.qq.com/sns/oauth2/refresh_token?" +
							params.toString(),
						{
							method: "GET",
						},
					);

					if (error || !tokenData || tokenData.errcode) {
						throw new Error(
							`Failed to refresh access token: ${tokenData?.errmsg || error?.message || "Unknown error"}`,
						);
					}

					const tokens = {
						tokenType: "Bearer" as const,
						accessToken: tokenData.access_token,
						refreshToken: tokenData.refresh_token,
						accessTokenExpiresAt: new Date(
							Date.now() + tokenData.expires_in * 1000,
						),
						scopes: tokenData.scope.split(","),
					};

					// Attach openid to the token if available from refresh response
					if (tokenData.openid) {
						(tokens as OAuth2Tokens & { openid: string }).openid =
							tokenData.openid;
					}

					return tokens;
				},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			// Get the openid from the token data
			const openid = (token as OAuth2Tokens & { openid: string }).openid;

			if (!openid) {
				return null;
			}

			const params = new URLSearchParams({
				access_token: token.accessToken || "",
				openid: openid,
				lang: "zh_CN",
			});

			const { data: profile, error } = await betterFetch<WeChatProfile>(
				"https://api.weixin.qq.com/sns/userinfo?" + params.toString(),
				{
					method: "GET",
				},
			);

			if (error || !profile || profile.error?.errcode) {
				return null;
			}

			return {
				user: {
					id: profile.unionid || profile.openid || openid,
					name: profile.nickname,
					email: profile.email || profile.nickname,
					image: profile.headimgurl,
					/** @note WeChat does not provide emailVerified or even email*/
					emailVerified: profile.email ? true : false,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<WeChatProfile, WeChatOptions>;
};
