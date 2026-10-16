import { errors as joseErrors } from "jose";
import { logger } from "../env";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
	validateToken,
} from "../oauth2";
import { ID_TOKEN_CLOCK_TOLERANCE_SECONDS } from "../oauth2/verify-id-token";

/**
 * @see https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/#requesting-claims
 */
export interface TwitchProfile {
	/**
	 * The sub of the user
	 */
	sub: string;
	/**
	 * The preferred username of the user
	 */
	preferred_username: string;
	/**
	 * The email of the user
	 */
	email: string;
	/**
	 * Indicate if this user has a verified email.
	 */
	email_verified: boolean;
	/**
	 * The picture of the user
	 */
	picture: string;
}

export interface TwitchOptions extends ProviderOptions<TwitchProfile> {
	clientId: string;
	claims?: string[] | undefined;
}
export const twitch = (options: TwitchOptions) => {
	const tokenEndpoint = "https://id.twitch.tv/oauth2/token";
	return {
		id: "twitch",
		name: "Twitch",
		accountSubject: ({ profile }) => profile.sub,
		createAuthorizationURL({ state, scopes, redirectURI, additionalParams }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["user:read:email", "openid"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "twitch",
				redirectURI,
				options,
				authorizationEndpoint: "https://id.twitch.tv/oauth2/authorize",
				scopes: _scopes,
				state,
				claims: options.claims || [
					"email",
					"email_verified",
					"preferred_username",
					"picture",
				],
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
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
			const idToken = token.idToken;
			if (!idToken) {
				logger.error("No idToken found in token");
				return null;
			}
			let profile: TwitchProfile;
			try {
				const { payload } = await validateToken<TwitchProfile>(
					idToken,
					"https://id.twitch.tv/oauth2/keys",
					{
						issuer: "https://id.twitch.tv/oauth2",
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
				profile = payload;
			} catch (error) {
				try {
					logger.warn("Twitch ID token verification failed", {
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
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					name: profile.preferred_username,
					email: profile.email,
					image: profile.picture,
					emailVerified: profile.email_verified,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<TwitchProfile>;
};
