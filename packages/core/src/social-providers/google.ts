import { betterFetch } from "@better-fetch/fetch";
import type { JWTPayload } from "jose";
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { logger } from "../env";
import { APIError, BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	getPrimaryClientId,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

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
	hd?: string | undefined;
	iat: number;
	iss: string;
	jti?: string | undefined;
	locale?: string | undefined;
	name: string;
	nbf?: number | undefined;
	picture: string;
	sub: string;
}

export interface GoogleOptions extends ProviderOptions<GoogleProfile> {
	clientId: string | string[];
	/**
	 * The access type to use for the authorization code request
	 */
	accessType?: ("offline" | "online") | undefined;
	/**
	 * The display mode to use for the authorization code request
	 */
	display?: ("page" | "popup" | "touch" | "wap") | undefined;
	/**
	 * The hosted domain (Google Workspace) the user must belong to.
	 *
	 * This is sent to Google as the `hd` authorization hint and, when set, is
	 * also enforced against the `hd` claim of the returned id token/profile.
	 * Set `hd: "*"` to require any Workspace hosted-domain claim. Sign-in is
	 * rejected when the claim is missing or does not satisfy this restriction.
	 */
	hd?: string | undefined;
}

const GOOGLE_ID_TOKEN_MAX_AGE = "1h";

export interface VerifyGoogleIdTokenOptions {
	token: string;
	audience: string | string[];
	nonce?: string | undefined;
}

/**
 * Verifies a Google ID token against Google's issuer, audience, signature,
 * expiry, and maximum token age.
 */
export const verifyGoogleIdToken = async ({
	token,
	audience,
	nonce,
}: VerifyGoogleIdTokenOptions): Promise<JWTPayload | null> => {
	try {
		const { kid, alg: jwtAlg } = decodeProtectedHeader(token);
		if (!kid || !jwtAlg) return null;

		const publicKey = await getGooglePublicKey(kid);
		const { payload: jwtClaims } = await jwtVerify(token, publicKey, {
			algorithms: [jwtAlg],
			issuer: ["https://accounts.google.com", "accounts.google.com"],
			audience,
			maxTokenAge: GOOGLE_ID_TOKEN_MAX_AGE,
		});

		if (nonce && jwtClaims.nonce !== nonce) {
			return null;
		}

		return jwtClaims;
	} catch {
		return null;
	}
};

/**
 * Checks whether Google's verified `hd` claim satisfies the configured hosted
 * domain restriction. `hd: "*"` accepts any Google Workspace hosted domain.
 */
export const isGoogleHostedDomainAllowed = (
	configuredHostedDomain: string | undefined,
	tokenHostedDomain: unknown,
) => {
	if (!configuredHostedDomain) return true;
	if (typeof tokenHostedDomain !== "string" || !tokenHostedDomain) {
		return false;
	}
	if (configuredHostedDomain === "*") return true;
	return tokenHostedDomain === configuredHostedDomain;
};

export const google = (options: GoogleOptions) => {
	return {
		id: "google",
		name: "Google",
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			loginHint,
			display,
		}) {
			if (!getPrimaryClientId(options.clientId) || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Google. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Google");
			}
			const _scopes = options.disableDefaultScope
				? []
				: ["email", "profile", "openid"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			const url = await createAuthorizationURL({
				id: "google",
				options,
				authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
				accessType: options.accessType,
				display: display || options.display,
				loginHint,
				hd: options.hd,
				additionalParams: {
					include_granted_scopes: "true",
				},
			});
			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://oauth2.googleapis.com/token",
			});
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
						tokenEndpoint: "https://oauth2.googleapis.com/token",
					});
				},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}

			const jwtClaims = await verifyGoogleIdToken({
				token,
				audience: options.clientId,
				nonce,
			});
			if (!jwtClaims) {
				return false;
			}

			return isGoogleHostedDomainAllowed(options.hd, jwtClaims.hd);
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const user = decodeJwt(token.idToken) as GoogleProfile;
			// Enforce the configured hosted domain on the callback profile path.
			// The authorization-time `hd` value is only a UI hint; the verified
			// token/profile claim is the authoritative Workspace signal.
			if (!isGoogleHostedDomainAllowed(options.hd, user.hd)) {
				logger.error(
					`Google sign-in rejected: id token hosted domain (hd) "${
						user.hd ?? "<missing>"
					}" does not satisfy the configured "hd" option "${options.hd}".`,
				);
				return null;
			}
			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified: user.email_verified,
					...userMap,
				},
				data: user,
			};
		},
		options,
	} satisfies OAuthProvider<GoogleProfile>;
};

export const getGooglePublicKey = async (kid: string) => {
	const { data } = await betterFetch<{
		keys: Array<{
			kid: string;
			alg: string;
			kty: string;
			use: string;
			n: string;
			e: string;
		}>;
	}>("https://www.googleapis.com/oauth2/v3/certs");

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
