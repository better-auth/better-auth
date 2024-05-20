import { parseJWT } from "../jwt";
import type { Provider, ProviderOptions } from "./types";

export interface GoogleProfile {
	aud: string;
	azp: string;
	email: string;
	email_verified: boolean;
	exp: number;
	/**
	 * The family name of the user, or last name in most
	 * Western languages.
	 */
	family_name: string;
	/**
	 * The given name of the user, or first name in most
	 * Western languages.
	 */
	given_name: string;
	hd?: string;
	iat: number;
	iss: string;
	jti?: string;
	locale?: string;
	name: string;
	nbf?: number;
	picture: string;
	sub: string;
}

interface GoogleOptions extends ProviderOptions<GoogleProfile> {}

export const google = (options: GoogleOptions) => {
	return {
		id: "google" as const,
		name: "Google",
		type: "oidc",
		nonce: true,
		params: {
			clientId: options.clientId,
			clientSecret: options.clientSecret,
			linkAccounts: options.linkAccounts,
			redirectURL: options.redirectURL,
			tokenEndpoint: "https://oauth2.googleapis.com/token",
			authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
		},
		issuer: "https://accounts.google.com",
		scopes: options.scopes || ["openid", "email", "profile"],
		pkCodeVerifier: true,
		async getUserInfo(tokens) {
			const idToken = tokens?.id_token;
			const user = parseJWT(idToken as string) as GoogleProfile;
			const profile = {
				...user,
				id: user.sub,
			};
			return profile;
		},
	} satisfies Provider<GoogleProfile>;
};
