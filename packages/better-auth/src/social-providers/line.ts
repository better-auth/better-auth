import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { validateAuthorizationCode } from "../oauth2";

export interface LineProfile extends Record<string, any> {
	userId: string;
	displayName: string;
	pictureUrl?: string;
	statusMessage?: string;
	email?: string;
	email_verified?: boolean;
}

interface LineOpenIDInfo {
	// Required claims
	/**
	 * Line user ID
	 */
	sub: string;
	/**
	 * Issuer identifier (should be https://access.line.me)
	 */
	iss: string;
	/**
	 * OAuth 2.0 client ID
	 */
	aud: string;
	/**
	 * Expiration time
	 */
	exp: number;
	/**
	 * Issued at time
	 */
	iat: number;

	// Optional standard claims
	name?: string;
	picture?: string;
	email?: string;
	email_verified?: boolean;

	// Line-specific claims
	/**
	 * Authentication methods references
	 */
	amr?: string[];
	/**
	 * Time of authentication
	 */
	auth_time?: number;
	/**
	 * Value used to prevent replay attacks
	 */
	nonce?: string;
}

export interface LineOptions extends ProviderOptions<LineProfile> {
	/**
	 * Users can log in through one of the following authentication methods once they have been redirected to an authorization URL.
	 *
	 * **Note:** Auto login doesn't work on LINE for PC. [Learn more here](https://developers.line.biz/en/faq/#how-does-auto-login-work)
	 *
	 * @default "SSO"
	 */
	// authentication_method?: "auto-login" | "email-address" | "QR-code" | "SSO";
	prompt?: "none" | "consent";
	/**
	 * If set to true, auto login will be disabled. The default value is false.
	 * When this value is true, Single Sign On (SSO) login will be displayed if SSO is available, and log in with email address will be displayed if it is not available.
	 */
	disable_auto_login?: boolean;
	/**
	 * If set to true, auto login will be disabled in iOS. The default value is false. We recommend using the disable_auto_login parameter, which was added later.
	 */
	disable_ios_auto_login?: boolean;
	/**
	 * If `lineqr` is specified, Log in with QR code will be displayed by default instead of Log in with email address.
	 */
	initial_amr_display?: String;
	/**
	 * If set to `false`, hide the buttons for changing the login method, such as "Log in with email" or "QR code login". The default value is `true`.
	 */
	switch_amr?: boolean;
	/**
	 * Display language for LINE Login screens. Specify as one or more [RFC 5646 (BCP 47)](https://datatracker.ietf.org/doc/html/rfc5646)
	 * language tags, separated by spaces, in order of preference.
	 * Corresponds to the ui_locales parameter defined in the "Authentication Request" section of [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html).
	 */
	ui_locales?: string;
	/**
	 * The allowable elapsed time in seconds since the last time the user was authenticated.
	 * Corresponds to the max_age parameter defined in the "Authentication Request" section of [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html).
	 */
	max_age?: number;
	/**
	 * A string used to prevent [replay attacks](https://en.wikipedia.org/wiki/Replay_attack).
	 * This value is returned in an [ID token](https://developers.line.biz/en/docs/line-login/verify-id-token/#id-tokens).
	 */
	nonce?: string;
}

export const line = (options: LineOptions) => {
	return {
		id: "line",
		name: "Line",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			// Make sure we request openid and email scopes
			const _scopes = scopes || ["profile", "openid", "email"];
			options.scope && _scopes.push(...options.scope);
			return new URL(
				`https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${
					options.clientId
				}&redirect_uri=${encodeURIComponent(
					options.redirectURI || redirectURI,
				)}&state=${state}&scope=${_scopes.join(" ")}&prompt=${
					options.prompt || "none"
				}`,
			);
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint: "https://api.line.me/oauth2/v2.1/token",
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			// First get basic profile
			const { data: profile, error } = await betterFetch<LineProfile>(
				"https://api.line.me/v2/profile",
				{
					headers: {
						authorization: `Bearer ${token.accessToken}`,
					},
				},
			);

			if (error) {
				// console.error("Failed to fetch Line profile info:", openIdError);

				return null;
			}

			// Then get OpenID user info which includes email
			const { data: openIdInfo, error: openIdError } =
				await betterFetch<LineOpenIDInfo>(
					"https://api.line.me/oauth2/v2.1/userinfo",
					{
						headers: {
							authorization: `Bearer ${token.accessToken}`,
						},
					},
				);

			if (openIdError) {
				// console.error("Failed to fetch Line OpenID info:", openIdError);
				return null;
			}

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.userId,
					name: profile.displayName,
					email: openIdInfo?.email || profile.email,
					image: profile.pictureUrl,
					emailVerified: openIdInfo?.email_verified || false,
					...userMap,
				},
				data: {
					...profile,
					...openIdInfo,
				},
			};
		},
	} satisfies OAuthProvider<LineProfile>;
};
