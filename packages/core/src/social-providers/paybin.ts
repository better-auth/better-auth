import { errors as joseErrors } from "jose";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
	validateToken,
} from "../oauth2";
import { ID_TOKEN_CLOCK_TOLERANCE_SECONDS } from "../oauth2/verify-id-token";

export interface PaybinProfile {
	sub: string;
	email: string;
	email_verified?: boolean | undefined;
	name?: string | undefined;
	preferred_username?: string | undefined;
	picture?: string | undefined;
	given_name?: string | undefined;
	family_name?: string | undefined;
}

export interface PaybinOptions extends ProviderOptions<PaybinProfile> {
	clientId: string;
	/**
	 * The issuer URL of your Paybin OAuth server
	 * @default "https://idp.paybin.io"
	 */
	issuer?: string | undefined;
}

export const paybin = (options: PaybinOptions) => {
	const issuer = options.issuer || "https://idp.paybin.io";
	const authorizationEndpoint = `${issuer}/oauth2/authorize`;
	const tokenEndpoint = `${issuer}/oauth2/token`;

	return {
		id: "paybin",
		name: "Paybin",
		accountSubject: ({ profile }) => profile.sub,
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			loginHint,
			additionalParams,
		}) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Paybin. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Paybin");
			}
			const _scopes = options.disableDefaultScope
				? []
				: ["openid", "email", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			const url = await createAuthorizationURL({
				id: "paybin",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				prompt: options.prompt,
				loginHint,
				additionalParams,
			});
			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
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
						tokenEndpoint,
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			let user: PaybinProfile;
			try {
				const issuerBaseURL = issuer.endsWith("/") ? issuer : `${issuer}/`;
				const jwksEndpoint = new URL(".well-known/jwks.json", issuerBaseURL);
				const { payload } = await validateToken<PaybinProfile>(
					token.idToken,
					jwksEndpoint.href,
					{
						issuer,
						audience: options.clientId,
						algorithms: ["RS256"],
						requiredClaims: ["iss", "sub", "aud", "exp", "iat"],
						clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SECONDS,
					},
				);
				if (
					typeof payload.sub !== "string" ||
					!payload.sub ||
					!Number.isFinite(payload.iat) ||
					!Number.isFinite(payload.exp) ||
					(Array.isArray(payload.aud) &&
						payload.aud.some((audience) => audience !== options.clientId))
				) {
					throw new joseErrors.JWTClaimValidationFailed(
						"Invalid ID token identity claims",
						payload,
					);
				}
				user = payload;
			} catch (error) {
				try {
					logger.warn("Paybin ID token verification failed", {
						code:
							error instanceof joseErrors.JOSEError
								? error.code
								: "JWKS_FETCH_FAILED",
					});
				} catch {
					// Preserve the rejected result if a custom logger throws.
				}
				return null;
			}
			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					name: user.name || user.preferred_username || "",
					email: user.email,
					image: user.picture,
					emailVerified: user.email_verified || false,
					...userMap,
				},
				data: user,
			};
		},
		options,
	} satisfies OAuthProvider<PaybinProfile>;
};
