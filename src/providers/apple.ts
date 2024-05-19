import { parseJWT } from "../jwt";
import type { Provider, ProviderOptions } from "./types";

interface AppleProfile {
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

interface AppleOption extends ProviderOptions<AppleProfile> {}

export const apple = (options: AppleOption) => {
	const authorizationEndpoint = "https://appleid.apple.com/auth/authorize";
	const tokenEndpoint = "https://appleid.apple.com/auth/token";
	return {
		id: "apple" as const,
		name: "Apple",
		type: "oidc",
		params: {
			authorizationEndpoint,
			tokenEndpoint,
			linkAccounts: options.linkAccounts,
			redirectURL: options.redirectURL,
			clientId: options.clientId,
			clientSecret: options.clientSecret,
		},
		issuer: "https://appleid.apple.com",
		scopes: options.scopes || ["email", "name"],
		async getUserInfo(tokens) {
			const idToken = tokens?.id_token;
			const user = parseJWT(idToken as string)?.payload as AppleProfile;
			const profile = {
				...user,
				id: user.sub,
				email: user.email,
				emailVerified: true,
			};
			return profile;
		},
	} satisfies Provider<AppleProfile>;
};
