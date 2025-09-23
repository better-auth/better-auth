import { betterFetch } from "@better-fetch/fetch";

import {
	createAuthorizationURL,
	validateAuthorizationCode,
	refreshAccessToken,
} from "../oauth2";

import type { OAuthProvider, ProviderOptions } from "../oauth2";

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
	address: {
		street_address?: string;
		locality?: string;
		region?: string;
		postal_code?: string;
		country?: string;
	};
	updated_at?: number;
}

export interface AsgardeoOptions extends ProviderOptions {
	issuer: string;
}

const issuerToEndpoints = (issuer: string) => ({
	authorizationEndpoint: `${issuer}/oauth2/authorize`,
	tokenEndpoint: `${issuer}/oauth2/token`,
	userInfoEndpoint: `${issuer}/oauth2/userinfo`,
});

export const asgardeo = (options: AsgardeoOptions) => {
	const { authorizationEndpoint, tokenEndpoint, userInfoEndpoint } =
		issuerToEndpoints(options.issuer);

	const issuerId = "asgardeo";
	const issuerName = "Asgardeo";

	return {
		id: issuerId,
		name: issuerName,
		createAuthorizationURL: async ({
			state,
			scopes,
			codeVerifier,
			loginHint,
			redirectURI,
		}) => {
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "email"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			return createAuthorizationURL({
				id: issuerId,
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
				loginHint,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				options,
				tokenEndpoint,
				code,
				codeVerifier,
				redirectURI,
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) =>
					refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientKey: options.clientKey,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint,
					}),
		async getUserInfo(token) {
			if (options.getUserInfo) return options.getUserInfo(token);
			const { data: profile, error } = await betterFetch<AsgardeoProfile>(
				userInfoEndpoint,
				{ headers: { Authorization: `Bearer ${token.accessToken}` } },
			);
			if (error) return null;

			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.name ?? profile.given_name,
					email: profile.email,
					emailVerified: profile.email_verified ?? false,
					image: profile.picture,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<AsgardeoProfile>;
};
