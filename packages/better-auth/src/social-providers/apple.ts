import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-call";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { parseJWT } from "oslo/jwt";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { validateAuthorizationCode } from "../oauth2";
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
	/**
	 * The URL to the user's profile picture.
	 */
	picture: string;
	user?: AppleNonConformUser;
}

/**
 * This is the shape of the `user` query parameter that Apple sends the first
 * time the user consents to the app.
 * @see https://developer.apple.com/documentation/sign_in_with_apple/request_an_authorization_to_the_sign_in_with_apple_server#4066168
 */
export interface AppleNonConformUser {
	name: {
		firstName: string;
		lastName: string;
	};
	email: string;
}

export interface AppleOptions extends ProviderOptions<AppleProfile> {}

export const apple = (options: AppleOptions) => {
	const tokenEndpoint = "https://appleid.apple.com/auth/token";
	return {
		id: "apple",
		name: "Apple",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scope = scopes || ["email", "name"];
			options.scope && _scope.push(...options.scope);
			return new URL(
				`https://appleid.apple.com/auth/authorize?client_id=${
					options.clientId
				}&response_type=code&redirect_uri=${
					redirectURI || options.redirectURI
				}&scope=${_scope.join(" ")}&state=${state}&response_mode=form_post`,
			);
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint,
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}
			const decodedHeader = decodeProtectedHeader(token);
			const { kid, alg: jwtAlg } = decodedHeader;
			if (!kid || !jwtAlg) return false;
			const publicKey = await getApplePublicKey(kid);
			const { payload: jwtClaims } = await jwtVerify(token, publicKey, {
				algorithms: [jwtAlg],
				issuer: "https://appleid.apple.com",
				audience: options.clientId,
				maxTokenAge: "1h",
			});
			["email_verified", "is_private_email"].forEach((field) => {
				if (jwtClaims[field] !== undefined) {
					jwtClaims[field] = Boolean(jwtClaims[field]);
				}
			});
			if (nonce && jwtClaims.nonce !== nonce) {
				return false;
			}
			return !!jwtClaims;
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const profile = parseJWT(token.idToken)?.payload as AppleProfile | null;
			if (!profile) {
				return null;
			}
			const name = profile.user
				? `${profile.user.name.firstName} ${profile.user.name.lastName}`
				: profile.email;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: name,
					emailVerified: false,
					email: profile.email,
					...userMap,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<AppleProfile>;
};

export const getApplePublicKey = async (kid: string) => {
	const APPLE_BASE_URL = "https://appleid.apple.com";
	const JWKS_APPLE_URI = "/auth/keys";
	const { data } = await betterFetch<{
		keys: Array<{
			kid: string;
			alg: string;
			kty: string;
			use: string;
			n: string;
			e: string;
		}>;
	}>(`${APPLE_BASE_URL}${JWKS_APPLE_URI}`);
	if (!data?.keys) {
		throw new APIError("BAD_REQUEST", {
			message: "Keys not found",
		});
	}
	const jwk = data.keys.find((key) => key.kid === kid);
	if (!jwk) {
		throw new Error(`JWK with kid ${kid} not found`);
	}
	return await importJWK(jwk, jwk.alg);
};
