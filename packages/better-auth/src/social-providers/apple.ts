import { OAuth2Tokens } from "arctic";
import type { OAuthProvider } from ".";
import { parseJWT } from "oslo/jwt";
import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error/better-auth-error";
import { getRedirectURI } from "./utils";
export interface AppleProfile {
	/**
	 * The subject registered claim identifies the principal that’s the subject
	 * of the identity token. Because this token is for your app, the value is
	 * the unique identifier for the user.
	 */
	sub: string;
	/**
	 * A String value representing the user's email address.
	 * The email address is either the user's real email address or the proxy
	 * address, depending on their status private email relay service.
	 */
	email: string;
	/**
	 * A string or Boolean value that indicates whether the service verifies
	 * the email. The value can either be a string ("true" or "false") or a
	 * Boolean (true or false). The system may not verify email addresses for
	 * Sign in with Apple at Work & School users, and this claim is "false" or
	 * false for those users.
	 */
	email_verified: true | "true";
	/**
	 * A string or Boolean value that indicates whether the email that the user
	 * shares is the proxy address. The value can either be a string ("true" or
	 * "false") or a Boolean (true or false).
	 */
	is_private_email: boolean;
	/**
	 * An Integer value that indicates whether the user appears to be a real
	 * person. Use the value of this claim to mitigate fraud. The possible
	 * values are: 0 (or Unsupported), 1 (or Unknown), 2 (or LikelyReal). For
	 * more information, see ASUserDetectionStatus. This claim is present only
	 * in iOS 14 and later, macOS 11 and later, watchOS 7 and later, tvOS 14
	 * and later. The claim isn’t present or supported for web-based apps.
	 */
	real_user_status: number;
	/**
	 * The user’s full name in the format provided during the authorization
	 * process.
	 */
	name: string;
}

export interface AppleOptions {
	clientId: string;
	clientSecret: string;
	redirectURI?: string;
}

export const apple = ({
	clientId,
	clientSecret,
	redirectURI,
}: AppleOptions) => {
	const tokenEndpoint = "https://appleid.apple.com/auth/token";
	redirectURI = getRedirectURI("apple", redirectURI);
	return {
		id: "apple",
		name: "Apple",
		createAuthorizationURL({ state, scopes }) {
			const _scope = scopes || ["email", "name", "openid"];
			return new URL(
				`https://appleid.apple.com/auth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectURI}&scope=${_scope.join(
					" ",
				)}&state=${state}`,
			);
		},
		validateAuthorizationCode: async (code) => {
			const data = await betterFetch<OAuth2Tokens>(tokenEndpoint, {
				method: "POST",
				body: new URLSearchParams({
					client_id: clientId,
					client_secret: clientSecret,
					grant_type: "authorization_code",
					code,
				}),
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			});
			if (data.error) {
				throw new BetterAuthError(data.error?.message || "");
			}
			return data.data;
		},
		async getUserInfo(token) {
			const data = parseJWT(token.idToken())?.payload as AppleProfile | null;
			if (!data) {
				return null;
			}
			return {
				user: {
					id: data.sub,
					name: data.name,
					email: data.email,
					emailVerified: data.email_verified === "true",
				},
				data,
			};
		},
	} satisfies OAuthProvider<AppleProfile>;
};
