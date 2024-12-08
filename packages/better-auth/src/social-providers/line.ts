import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { validateAuthorizationCode } from "../oauth2";

export interface LineProfile extends Record<string, any> {
    iss: string;
    sub: string;
    aud: string;
    exp: string;
    iat: number;
    auth_time?: number;
    nonce?: string;
    amr: string[];

    name?: string;
    picture?: string;
    email?: string;
}

export interface LineOptions extends ProviderOptions<LineProfile> {
	/**
	 * Users can log in through one of the following authentication methods once they have been redirected to an authorization URL.
	 *
	 * **Note:** Auto login doesn't work on LINE for PC. [Learn more here](https://developers.line.biz/en/faq/#how-does-auto-login-work)
	 *
	 * @default "SSO"
	 */
	authentication_method?: "auto-login" | "email-address" | "QR-code" | "SSO";
}

export const line = (options: LineOptions) => {
	return {
		id: "line",
		name: "Line",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = scopes || ["profile", "openid", "email"];
			options.scope && _scopes.push(...options.scope);
			return new URL(
				`https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${
					options.clientId
				}&redirect_uri=${encodeURIComponent(
					options.redirectURI || redirectURI,
				)}&state=${state}&scope=${_scopes.join("+")}`,
			);
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint: `"https://api.line.me/oauth2/v2.1/token`,
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<LineProfile>(
				"https://api.line.me/oauth2/v2.1/verify",
				{
					headers: {
						"Content-Type": `application/x-www-form-urlencoded`,
						authorization: `Bearer ${token.accessToken}`,
					},
					body: {
						id_token: token.idToken,
						client_id: options.clientId,
					},
				},
			);

			if (error) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.id,
					name: profile.display_name || profile.username || "",
					email: profile.email,
					emailVerified: profile.verified,
					image: profile.image_url,
					...userMap,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<LineProfile>;
};
