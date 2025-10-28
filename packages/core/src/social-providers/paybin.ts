import { decodeJwt } from "jose";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface PaybinProfile {
	sub: string;
	email: string;
	email_verified?: boolean | undefined;
	name?: string | undefined;
	preferred_username?: string | undefined;
	picture?: string | undefined;
	given_name?: string | undefined;
	family_name?: string | undefined;
}

export interface PaybinOptions extends ProviderOptions<PaybinProfile> {
	clientId: string;
	/**
	 * The issuer URL of your Paybin OAuth server
	 * @default "https://idp.paybin.io"
	 */
	issuer?: string | undefined;
}

export const paybin = (options: PaybinOptions) => {
	const issuer = options.issuer || "https://idp.paybin.io";
	const authorizationEndpoint = `${issuer}/oauth2/authorize`;
	const tokenEndpoint = `${issuer}/oauth2/token`;

	return {
		id: "paybin",
		name: "Paybin",
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			loginHint,
		}) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Paybin. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Paybin");
			}
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "email", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			const url = await createAuthorizationURL({
				id: "paybin",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
				loginHint,
			});
			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
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
						tokenEndpoint,
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const user = decodeJwt(token.idToken) as PaybinProfile;
			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					id: user.sub,
					name:
						user.name ||
						user.preferred_username ||
						(user.email ? user.email.split("@")[0] : "User") ||
						"User",
					email: user.email,
					image: user.picture,
					emailVerified: user.email_verified || false,
					...userMap,
				},
				data: user,
			};
		},
		options,
	} satisfies OAuthProvider<PaybinProfile>;
};
