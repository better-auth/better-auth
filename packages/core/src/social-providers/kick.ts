import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface KickProfile {
	/**
	 * The user id of the user
	 */
	user_id: string;
	/**
	 * The name of the user
	 */
	name: string;
	/**
	 * The email of the user
	 */
	email: string;
	/**
	 * The picture of the user
	 */
	profile_picture: string;
}

export interface KickOptions extends ProviderOptions<KickProfile> {
	clientId: string;
}

export const kick = (options: KickOptions) => {
	return {
		id: "kick",
		name: "Kick",
		createAuthorizationURL({ state, scopes, redirectURI, codeVerifier }) {
			const _scopes = options.disableDefaultScope ? [] : ["user:read"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "kick",
				redirectURI,
				options,
				authorizationEndpoint: "https://id.kick.com/oauth/authorize",
				scopes: _scopes,
				codeVerifier,
				state,
			});
		},
		async validateAuthorizationCode({ code, redirectURI, codeVerifier }) {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://id.kick.com/oauth/token",
				codeVerifier,
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data, error } = await betterFetch<{
				data: KickProfile[];
			}>("https://api.kick.com/public/v1/users", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token.accessToken}`,
				},
			});

			if (error) {
				return null;
			}

			const profile = data.data[0]!;

			const userMap = await options.mapProfileToUser?.(profile);
			// Kick does not provide email_verified claim.
			// We default to false for security consistency.
			return {
				user: {
					id: profile.user_id,
					name: profile.name,
					email: profile.email,
					image: profile.profile_picture,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<KickProfile>;
};
