import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt, importJWK } from "jose";
import { logger } from "../env";
import { APIError, BetterAuthError } from "../error";
import type { ProviderOptions, UpstreamProvider } from "../oauth2";
import {
	createAuthorizationURL,
	getPrimaryClientId,
	refreshAccessToken,
	resolveRequestedScopes,
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
	 * The hosted domain of the user
	 */
	hd?: string | undefined;
	/**
	 * Enable incremental authorization via Google's `include_granted_scopes`
	 * parameter. When enabled, Google reports the user's full granted scope set
	 * in the token response.
	 *
	 * @default true
	 */
	includeGrantedScopes?: boolean | undefined;
}

const GOOGLE_DEFAULT_SCOPES = ["email", "profile", "openid"];

export const google = (options: GoogleOptions) => {
	return {
		id: "google",
		name: "Google",
		callbackPath: "/callback/google",
		grantAuthority:
			options.includeGrantedScopes !== false ? "full-grant" : "projection",
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			loginHint,
			display,
			additionalParams,
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
			const requestedScopes = resolveRequestedScopes(
				options,
				GOOGLE_DEFAULT_SCOPES,
				scopes,
			);
			return createAuthorizationURL({
				id: "google",
				options,
				authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
				scopes: requestedScopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
				accessType: options.accessType,
				display: display || options.display,
				loginHint,
				hd: options.hd,
				additionalParams:
					options.includeGrantedScopes === false
						? { ...(additionalParams ?? {}) }
						: {
								...(additionalParams ?? {}),
								// Not caller-overridable: the emitted param must stay in
								// lockstep with `grantAuthority` (driven by the option), or
								// the callback would treat a non-authoritative grant as full.
								include_granted_scopes: "true",
							},
			});
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
		idToken: {
			// https://developers.google.com/identity/sign-in/web/backend-auth#verify-the-integrity-of-the-id-token
			jwks: (header) => getGooglePublicKey(header.kid!),
			issuer: ["https://accounts.google.com", "accounts.google.com"],
			audience: options.clientId,
			maxTokenAge: "1h",
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const user = decodeJwt(token.idToken) as GoogleProfile;
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
	} satisfies UpstreamProvider<GoogleProfile>;
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
