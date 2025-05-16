import type { ProviderOptions } from "../oauth2";
import {
	validateAuthorizationCode,
	createAuthorizationURL,
	refreshAccessToken,
} from "../oauth2";
import type { OAuthProvider } from "../oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../utils/logger";
import { decodeJwt } from "jose";
import { base64 } from "@better-auth/utils/base64";

export interface MicrosoftEntraIDProfile extends Record<string, any> {
	sub: string;
	name: string;
	email: string;
	picture: string;
}

export interface MicrosoftOptions
	extends ProviderOptions<MicrosoftEntraIDProfile> {
	/**
	 * The tenant ID of the Microsoft account
	 * @default "common"
	 */
	tenantId?: string;
	/**
	 * The size of the profile photo
	 * @default 48
	 */
	profilePhotoSize?: 48 | 64 | 96 | 120 | 240 | 360 | 432 | 504 | 648;
	/**
	 * Disable profile photo
	 */
	disableProfilePhoto?: boolean;
}

export const microsoft = (options: MicrosoftOptions) => {
	const tenant = options.tenantId || "common";
	const authorizationEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
	const tokenEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
	return {
		id: "microsoft",
		name: "Microsoft EntraID",
		createAuthorizationURL(data) {
			const scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "email", "User.Read"];
			options.scope && scopes.push(...options.scope);
			data.scopes && scopes.push(...scopes);
			return createAuthorizationURL({
				id: "microsoft",
				options,
				authorizationEndpoint,
				state: data.state,
				codeVerifier: data.codeVerifier,
				scopes,
				redirectURI: data.redirectURI,
				prompt: options.prompt,
			});
		},
		validateAuthorizationCode({ code, codeVerifier, redirectURI }) {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
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
			const user = decodeJwt(token.idToken) as MicrosoftEntraIDProfile;
			const profilePhotoSize = options.profilePhotoSize || 48;
			await betterFetch<ArrayBuffer>(
				`https://graph.microsoft.com/v1.0/me/photos/${profilePhotoSize}x${profilePhotoSize}/$value`,
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
					async onResponse(context) {
						if (options.disableProfilePhoto || !context.response.ok) {
							return;
						}
						try {
							const response = context.response.clone();
							const pictureBuffer = await response.arrayBuffer();
							const pictureBase64 = base64.encode(pictureBuffer);
							user.picture = `data:image/jpeg;base64, ${pictureBase64}`;
						} catch (e) {
							logger.error(
								e && typeof e === "object" && "name" in e
									? (e.name as string)
									: "",
								e,
							);
						}
					},
				},
			);
			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified: true,
					...userMap,
				},
				data: user,
			};
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
		options,
	} satisfies OAuthProvider;
};
