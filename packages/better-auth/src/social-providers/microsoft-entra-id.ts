import type { ProviderOptions } from "../oauth2";
import { validateAuthorizationCode, createAuthorizationURL } from "../oauth2";
import type { OAuthProvider } from "../oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { parseJWT } from "oslo/jwt";
import { logger } from "../utils/logger";

export interface MicrosoftEntraIDProfile extends Record<string, any> {
	sub: string;
	name: string;
	email: string;
	picture: string;
}

export interface MicrosoftOptions extends ProviderOptions {
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
			const scopes = data.scopes || ["openid", "profile", "email", "User.Read"];
			options.scope && scopes.push(...options.scope);

			return createAuthorizationURL({
				id: "microsoft",
				options,
				authorizationEndpoint,
				state: data.state,
				codeVerifier: data.codeVerifier,
				scopes,
				redirectURI: data.redirectURI,
			});
		},
		validateAuthorizationCode({ code, codeVerifier, redirectURI }) {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint,
			});
		},
		async getUserInfo(token) {
			if (!token.idToken) {
				return null;
			}
			const user = parseJWT(token.idToken)?.payload as MicrosoftEntraIDProfile;
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
							const pictureBase64 =
								Buffer.from(pictureBuffer).toString("base64");
							user.picture = `data:image/jpeg;base64, ${pictureBase64}`;
						} catch (e) {
							logger.error(e);
						}
					},
				},
			);
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified: true,
				},
				data: user,
			};
		},
	} satisfies OAuthProvider;
};
