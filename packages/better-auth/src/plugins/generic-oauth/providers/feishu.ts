import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

const OAUTH_SCOPE_SPLIT_RE = /\s+/;
const FEISHU_OPEN_ID_SANITIZE_RE = /[^a-zA-Z0-9._-]/g;

interface FeishuEndpoints {
	authorizationUrl: string;
	tokenUrl: string;
	userInfoUrl: string;
}

interface FeishuTokenData {
	access_token?: string | undefined;
	expires_in?: number | undefined;
	refresh_token?: string | undefined;
	refresh_token_expires_in?: number | undefined;
	scope?: string | undefined;
	token_type?: string | undefined;
}

interface FeishuTokenResponse extends FeishuTokenData {
	code?: number | undefined;
	msg?: string | undefined;
	error?: string | undefined;
	error_description?: string | undefined;
	data?: FeishuTokenData | undefined;
}

/**
 * Feishu/Lark user profile information.
 *
 * @see https://open.feishu.cn/document/server-docs/authentication-management/login-state-management/get
 */
export interface FeishuProfile extends Record<string, unknown> {
	code: number;
	msg?: string | undefined;
	data?: {
		/** User display name */
		name?: string | undefined;
		/** User English display name */
		en_name?: string | undefined;
		/** User avatar URL */
		avatar_url?: string | undefined;
		/** User thumbnail avatar URL */
		avatar_thumb?: string | undefined;
		/** User middle-size avatar URL */
		avatar_middle?: string | undefined;
		/** User large avatar URL */
		avatar_big?: string | undefined;
		/** User's unique Open ID */
		open_id?: string | undefined;
		/** User's Union ID across apps from the same developer */
		union_id?: string | undefined;
		/** User's app-scoped User ID */
		user_id?: string | undefined;
		/** User email, if granted */
		email?: string | undefined;
		/** User enterprise email, if granted */
		enterprise_email?: string | undefined;
		/** User mobile number, if granted */
		mobile?: string | undefined;
	};
}

export interface FeishuOptions extends BaseOAuthProviderOptions {}
export interface LarkOptions extends BaseOAuthProviderOptions {}

const feishuEndpoints: FeishuEndpoints = {
	authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
	tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
	userInfoUrl: "https://open.feishu.cn/open-apis/authen/v1/user_info",
};

const larkEndpoints: FeishuEndpoints = {
	authorizationUrl:
		"https://accounts.larksuite.com/open-apis/authen/v1/authorize",
	tokenUrl: "https://open.larksuite.com/open-apis/authen/v2/oauth/token",
	userInfoUrl: "https://open.larksuite.com/open-apis/authen/v1/user_info",
};

function getTokenData(response: FeishuTokenResponse) {
	return response.data || response;
}

function getTokenError(response: FeishuTokenResponse) {
	return (
		response.error_description ||
		response.error ||
		response.msg ||
		`OAuth token request failed with code ${response.code}`
	);
}

function formatTokenResponse(response: FeishuTokenResponse): OAuth2Tokens {
	const tokenData = getTokenData(response);
	if (!tokenData.access_token) {
		throw new Error("Failed to request Feishu/Lark OAuth token: Missing token");
	}

	const tokens: OAuth2Tokens = {
		accessToken: tokenData.access_token,
		refreshToken: tokenData.refresh_token,
		tokenType: tokenData.token_type,
		scopes: tokenData.scope
			?.split(OAUTH_SCOPE_SPLIT_RE)
			.filter((scope) => scope.length > 0),
		raw: response as Record<string, unknown>,
	};

	if (tokenData.expires_in !== undefined) {
		tokens.accessTokenExpiresAt = new Date(
			Date.now() + tokenData.expires_in * 1000,
		);
	}

	if (tokenData.refresh_token_expires_in !== undefined) {
		tokens.refreshTokenExpiresAt = new Date(
			Date.now() + tokenData.refresh_token_expires_in * 1000,
		);
	}

	return tokens;
}

async function requestToken({
	options,
	tokenUrl,
	body,
}: {
	options: FeishuOptions | LarkOptions;
	tokenUrl: string;
	body: Record<string, string>;
}) {
	const { data, error } = await betterFetch<FeishuTokenResponse>(tokenUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json; charset=utf-8",
		},
		body: JSON.stringify({
			client_id: options.clientId,
			client_secret: options.clientSecret,
			...body,
		}),
	});

	if (error || !data || (data.code !== undefined && data.code !== 0)) {
		throw new Error(
			`Failed to request Feishu/Lark OAuth token: ${
				data ? getTokenError(data) : error?.message || "Unknown error"
			}`,
		);
	}

	return formatTokenResponse(data);
}

function mapFeishuProfile(profile: FeishuProfile): OAuth2UserInfo | null {
	if (profile.code !== 0 || !profile.data) {
		return null;
	}

	const data = profile.data;
	const openId = data.open_id;
	if (!openId) {
		return null;
	}
	const email = data.email?.trim() || data.enterprise_email?.trim();
	const name = data.name?.trim() || data.en_name?.trim() || openId;

	return {
		id: data.union_id || openId,
		name,
		email: email || syntheticFeishuEmail(openId),
		image:
			data.avatar_url ||
			data.avatar_big ||
			data.avatar_middle ||
			data.avatar_thumb,
		emailVerified: false,
	};
}

function syntheticFeishuEmail(openId: string): string {
	const safe = openId.replace(FEISHU_OPEN_ID_SANITIZE_RE, "_");
	return `feishu.${safe}@oauth.local`;
}

function createFeishuProvider<ID extends "feishu" | "lark">({
	providerId,
	name,
	endpoints,
	options,
}: {
	providerId: ID;
	name: string;
	endpoints: FeishuEndpoints;
	options: ID extends "feishu" ? FeishuOptions : LarkOptions;
}): GenericOAuthConfig<ID> {
	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<FeishuProfile>(
			endpoints.userInfoUrl,
			{
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		return mapFeishuProfile(profile);
	};

	return {
		providerId,
		name,
		authorizationUrl: endpoints.authorizationUrl,
		tokenUrl: endpoints.tokenUrl,
		userInfoUrl: endpoints.userInfoUrl,
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		scopes: options.scopes,
		redirectURI: options.redirectURI,
		pkce: options.pkce,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
		getToken: async ({ code, redirectURI, codeVerifier }) => {
			const body: Record<string, string> = {
				grant_type: "authorization_code",
				code,
				redirect_uri: options.redirectURI || redirectURI,
			};
			if (codeVerifier) body.code_verifier = codeVerifier;
			return requestToken({
				options,
				tokenUrl: endpoints.tokenUrl,
				body,
			});
		},
		refreshAccessToken: async (refreshToken) => {
			return requestToken({
				options,
				tokenUrl: endpoints.tokenUrl,
				body: {
					grant_type: "refresh_token",
					refresh_token: refreshToken,
				},
			});
		},
		getUserInfo,
	};
}

/**
 * Feishu OAuth provider helper.
 *
 * Use this helper for Feishu China endpoints.
 *
 * @example
 * ```ts
 * import { genericOAuth, feishu } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         feishu({
 *           clientId: process.env.FEISHU_CLIENT_ID,
 *           clientSecret: process.env.FEISHU_CLIENT_SECRET,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function feishu(options: FeishuOptions): GenericOAuthConfig<"feishu"> {
	return createFeishuProvider({
		providerId: "feishu",
		name: "Feishu",
		endpoints: feishuEndpoints,
		options,
	});
}

/**
 * Lark OAuth provider helper.
 *
 * Use this helper for Lark global endpoints.
 *
 * @example
 * ```ts
 * import { genericOAuth, lark } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         lark({
 *           clientId: process.env.LARK_CLIENT_ID,
 *           clientSecret: process.env.LARK_CLIENT_SECRET,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function lark(options: LarkOptions): GenericOAuthConfig<"lark"> {
	return createFeishuProvider({
		providerId: "lark",
		name: "Lark",
		endpoints: larkEndpoints,
		options,
	});
}
