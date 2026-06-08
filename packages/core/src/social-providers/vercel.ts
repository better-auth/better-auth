import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import type { ProviderOptions, UpstreamProvider } from "../oauth2";
import {
	createAuthorizationURL,
	resolveRequestedScopes,
	validateAuthorizationCode,
} from "../oauth2";

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

const VERCEL_DEFAULT_SCOPES: string[] = [];

export const vercel = (options: VercelOptions) => {
	return {
		id: "vercel",
		name: "Vercel",
		callbackPath: "/callback/vercel",
		createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			additionalParams,
		}) {
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Vercel");
			}

			const requestedScopes = resolveRequestedScopes(
				options,
				VERCEL_DEFAULT_SCOPES,
				scopes,
			);

			return createAuthorizationURL({
				id: "vercel",
				options,
				authorizationEndpoint: "https://vercel.com/oauth/authorize",
				scopes: requestedScopes,
				state,
				codeVerifier,
				redirectURI,
				additionalParams,
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
					name: profile.name ?? profile.preferred_username ?? "",
					email: profile.email,
					image: profile.picture,
					emailVerified: profile.email_verified ?? false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies UpstreamProvider<VercelProfile>;
};
