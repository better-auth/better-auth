import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface HubSpotOptions extends BaseOAuthProviderOptions {
	/**
	 * OAuth scopes to request.
	 * @default ["oauth"]
	 */
	scopes?: string[];
}

/**
 * HubSpot access token information response.
 * Based on: https://legacydocs.hubspot.com/docs/methods/oauth2/get-access-token-information
 *
 * The API may return additional fields, but we only use the fields needed for user identification.
 */
interface HubSpotProfile extends Record<string, any> {
	user: string;
	user_id: string;
	hub_domain: string;
	hub_id: string;
	signed_access_token?: {
		userId?: string;
		[key: string]: any;
	};
}

/**
 * HubSpot OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, hubspot } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         hubspot({
 *           clientId: process.env.HUBSPOT_CLIENT_ID,
 *           clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
 *           scopes: ["oauth", "contacts"],
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function hubspot(options: HubSpotOptions): GenericOAuthConfig {
	const defaultScopes = ["oauth"];

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const tokenInfoUrl = `https://api.hubapi.com/oauth/v1/access-tokens/${tokens.accessToken}`;

		const { data: profile, error } = await betterFetch<HubSpotProfile>(
			tokenInfoUrl,
			{
				headers: {
					"Content-Type": "application/json",
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		// Note: HubSpot's OAuth API only returns the email address in the 'user' field.
		// It does NOT provide a display name or profile picture. This is a known limitation.
		// See: https://community.hubspot.com/t5/APIs-Integrations/Profile-photo-is-not-retrieved-with-User-API/m-p/325521
		const id = profile.user_id ?? profile.signed_access_token?.userId;

		if (!id) {
			return null;
		}

		return {
			id,
			name: profile.user,
			email: profile.user,
			image: undefined,
			emailVerified: false,
		};
	};

	return {
		providerId: "hubspot",
		authorizationUrl: "https://app.hubspot.com/oauth/authorize",
		tokenUrl: "https://api.hubapi.com/oauth/v1/token",
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		scopes: options.scopes ?? defaultScopes,
		redirectURI: options.redirectURI,
		authentication: "post",
		pkce: options.pkce,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
		getUserInfo,
	};
}
