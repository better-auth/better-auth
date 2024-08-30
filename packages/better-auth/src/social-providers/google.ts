import { betterFetch } from "@better-fetch/fetch";
import { Google } from "arctic";
import { parseJWT } from "oslo/jwt";
import { toBetterAuthProvider } from "./to-provider";

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

export const google = toBetterAuthProvider("google", Google, {
	async getUserInfo(token) {
		if (!token.idToken) {
			return null;
		}
		const user = parseJWT(token.idToken)?.payload as GoogleProfile;
		return {
			id: user.sub,
			name: user.name,
			email: user.email,
			image: user.picture,
			emailVerified: user.email_verified,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	},
});
