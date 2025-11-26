import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface VercelProfile {
	sub: string;
	name?: string;
	preferred_username?: string;
	email?: string;
	email_verified?: boolean;
	picture?: string;
}

export interface VercelOptions extends ProviderOptions<VercelProfile> {
	clientId: string;
}

export const vercel = (options: VercelOptions) => {
	return {
		id: "vercel",
		name: "Vercel",
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Vercel");
			}

			let _scopes: string[] | undefined = undefined;
			if (options.scope !== undefined || scopes !== undefined) {
				_scopes = [];
				if (options.scope) _scopes.push(...options.scope);
				if (scopes) _scopes.push(...scopes);
			}

			return createAuthorizationURL({
				id: "vercel",
				options,
				authorizationEndpoint: "https://vercel.com/oauth/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://api.vercel.com/login/oauth/token",
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data: profile, error } = await betterFetch<VercelProfile>(
				"https://api.vercel.com/login/oauth/userinfo",
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
				},
			);

			if (error || !profile) {
				return null;
			}

			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name ?? profile.preferred_username,
					email: profile.email,
					image: profile.picture,
					emailVerified: profile.email_verified ?? false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<VercelProfile>;
};
