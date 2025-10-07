import { betterFetch } from "@better-fetch/fetch";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";

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
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

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

			return {
				user: {
					id: profile.user_id,
					name: profile.name,
					email: profile.email,
					image: profile.profile_picture,
					emailVerified: true,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<KickProfile>;
};
