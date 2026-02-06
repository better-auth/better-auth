import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface AsgardeoOptions extends BaseOAuthProviderOptions {
	issuer: string;
}

export interface AsgardeoProfile {
	sub: string;
	email?: string;
	username?: string;
	name?: string;
	given_name?: string;
	middle_name?: string;
	family_name?: string;
	preferred_username?: string;
	nickname?: string;
	picture?: string;
	profile?: string;
	website?: string;
	phone_number?: string;
	locale?: string;
	birthdate?: string;
	gender?: string;
	email_verified?: boolean;
	phone_number_verified?: boolean;
	address?: {
		street_address?: string;
		locality?: string;
		region?: string;
		postal_code?: string;
		country?: string;
	};
	updated_at?: number;
}

const issuerToEndpoints = (issuer: string) => ({
	authorizationEndpoint: `${issuer}/oauth2/authorize`,
	tokenEndpoint: `${issuer}/oauth2/token`,
	userInfoEndpoint: `${issuer}/oauth2/userinfo`,
});

/**
 * Asgardeo OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, asgardeo } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         asgardeo({
 *           clientId: process.env.ASGARDEO_CLIENT_ID,
 *           clientSecret: process.env.ASGARDEO_CLIENT_SECRET,
 *           issuer: process.env.ASGARDEO_ISSUER,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function asgardeo(options: AsgardeoOptions): GenericOAuthConfig {
	const { authorizationEndpoint, tokenEndpoint, userInfoEndpoint } =
		issuerToEndpoints(options.issuer.replace(/\/+$/, ""));
	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<AsgardeoProfile>(
			userInfoEndpoint,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		return {
			id: profile.sub,
			name: profile.name ?? profile.given_name,
			email: profile.email,
			image: profile.picture,
			emailVerified: profile.email_verified ?? false,
		};
	};

	const defaultScopes = ["openid", "profile", "email"];

	return {
		providerId: "asgardeo",
		authorizationUrl: authorizationEndpoint,
		tokenUrl: tokenEndpoint,
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
