import { OAuth2Tokens } from "arctic";
import type { OAuthProvider, ProviderOptions } from ".";
import { parseJWT } from "oslo/jwt";
import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error/better-auth-error";
import { getRedirectURI, validateAuthorizationCode } from "./utils";
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

export interface AppleOptions extends ProviderOptions {}

export const apple = (options: AppleOptions) => {
	const tokenEndpoint = "https://appleid.apple.com/auth/token";
	return {
		id: "apple",
		name: "Apple",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scope = options.scope || scopes || ["email", "name", "openid"];
			return new URL(
				`https://appleid.apple.com/auth/authorize?client_id=${
					options.clientId
				}&response_type=code&redirect_uri=${
					redirectURI || options.redirectURI
				}&scope=${_scope.join(" ")}&state=${state}`,
			);
		},
		validateAuthorizationCode: async (code, codeVerifier, redirectURI) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI:
					redirectURI || getRedirectURI("apple", options.redirectURI),
				options,
				tokenEndpoint,
			});
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
