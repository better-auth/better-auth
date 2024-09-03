import { Google } from "arctic";
import { parseJWT } from "oslo/jwt";
import type { OAuthProvider } from ".";
import { getRedirectURI } from "./utils";
import { BetterAuthError } from "../error/better-auth-error";

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
	/*s*
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

export interface GoogleOptions {
	clientId: string;
	clientSecret: string;
	redirectURI?: string;
}

export const google = ({
	clientId,
	clientSecret,
	redirectURI,
}: GoogleOptions) => {
	const googleArctic = new Google(
		clientId,
		clientSecret,
		getRedirectURI("google", redirectURI),
	);
	return {
		id: "google",
		name: "Google",
		createAuthorizationURL({ state, scopes, codeVerifier }) {
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Google");
			}
			const _scopes = scopes || ["email", "profile"];
			return googleArctic.createAuthorizationURL(state, codeVerifier, _scopes);
		},
		validateAuthorizationCode: async (code, codeVerifier) => {
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Google");
			}
			return googleArctic.validateAuthorizationCode(code, codeVerifier);
		},
		async getUserInfo(token) {
			if (!token.idToken) {
				return null;
			}
			const user = parseJWT(token.idToken())?.payload as GoogleProfile;
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified: user.email_verified,
				},
				data: user,
			};
		},
	} satisfies OAuthProvider<GoogleProfile>;
};
