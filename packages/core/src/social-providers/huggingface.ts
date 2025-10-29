import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface HuggingFaceProfile {
	sub: string;
	name: string;
	preferred_username: string;
	profile: string;
	picture: string;
	website?: string | undefined;
	email?: string | undefined;
	email_verified?: boolean | undefined;
	isPro: boolean;
	canPay?: boolean | undefined;
	orgs?:
		| {
				sub: string;
				name: string;
				picture: string;
				preferred_username: string;
				isEnterprise: boolean | "plus";
				canPay?: boolean;
				roleInOrg?: "admin" | "write" | "contributor" | "read";
				pendingSSO?: boolean;
				missingMFA?: boolean;
				resourceGroups?: {
					sub: string;
					name: string;
					role: "admin" | "write" | "contributor" | "read";
				}[];
		  }
		| undefined;
}

export interface HuggingFaceOptions
	extends ProviderOptions<HuggingFaceProfile> {
	clientId: string;
}

export const huggingface = (options: HuggingFaceOptions) => {
	return {
		id: "huggingface",
		name: "Hugging Face",
		createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "email"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "huggingface",
				options,
				authorizationEndpoint: "https://huggingface.co/oauth/authorize",
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
				tokenEndpoint: "https://huggingface.co/oauth/token",
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
						tokenEndpoint: "https://huggingface.co/oauth/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<HuggingFaceProfile>(
				"https://huggingface.co/oauth/userinfo",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
				},
			);
			if (error) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name || profile.preferred_username,
					email: profile.email,
					image: profile.picture,
					emailVerified: profile.email_verified ?? false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<HuggingFaceProfile>;
};
