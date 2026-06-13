import { betterFetch } from "@better-fetch/fetch";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	getPrimaryClientId,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";
export interface FacebookProfile {
	id: string;
	name: string;
	email?: string;
	email_verified?: boolean;
	picture: {
		data: {
			height: number;
			is_silhouette: boolean;
			url: string;
			width: number;
		};
	};
}

interface FacebookDebugTokenData {
	app_id?: string;
	is_valid?: boolean;
	user_id?: string;
}

/**
 * Validate an opaque Facebook access token against the configured app.
 *
 * Facebook access tokens are not audience-bound at the Graph `/me` endpoint: a
 * token minted for any Facebook app returns that app's profile. Without this
 * check, a token issued to an unrelated app could be presented to this
 * app's direct sign-in path and accepted as proof of identity. We call the
 * `debug_token` endpoint and require the token to be valid, bound to one of the
 * configured client ids, and tied to a user.
 *
 * @see https://developers.facebook.com/docs/facebook-login/guides/access-tokens/debugging
 *
 * @returns the inspected token's `user_id` when the token is valid and bound to
 * the configured app, otherwise `null`.
 */
async function verifyFacebookAccessToken(
	accessToken: string,
	options: FacebookOptions,
): Promise<string | null> {
	const primaryClientId = getPrimaryClientId(options.clientId);
	if (!primaryClientId || !options.clientSecret) {
		return null;
	}
	const clientIds = Array.isArray(options.clientId)
		? options.clientId
		: [options.clientId];
	const appAccessToken = `${primaryClientId}|${options.clientSecret}`;
	const { data, error } = await betterFetch<{ data?: FacebookDebugTokenData }>(
		"https://graph.facebook.com/debug_token",
		{
			query: {
				input_token: accessToken,
				access_token: appAccessToken,
			},
		},
	);
	if (error || !data?.data) {
		return null;
	}
	const { is_valid, app_id, user_id } = data.data;
	if (is_valid !== true || !app_id || !clientIds.includes(app_id) || !user_id) {
		return null;
	}
	return user_id;
}

export interface FacebookOptions extends ProviderOptions<FacebookProfile> {
	clientId: string | string[];
	/**
	 * Extend list of fields to retrieve from the Facebook user profile.
	 *
	 * @default ["id", "name", "email", "picture"]
	 */
	fields?: string[] | undefined;

	/**
	 * The config id to use when undergoing oauth
	 */
	configId?: string | undefined;
}

export const facebook = (options: FacebookOptions) => {
	return {
		id: "facebook",
		name: "Facebook",
		async createAuthorizationURL({ state, scopes, redirectURI, loginHint }) {
			if (!getPrimaryClientId(options.clientId) || !options.clientSecret) {
				logger.error(
					"Client ID and client secret are required for Facebook. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			const _scopes = options.disableDefaultScope
				? []
				: ["email", "public_profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "facebook",
				options,
				authorizationEndpoint: "https://www.facebook.com/v24.0/dialog/oauth",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				additionalParams: options.configId
					? {
							config_id: options.configId,
						}
					: {},
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://graph.facebook.com/v24.0/oauth/access_token",
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
				return false;
			}

			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce);
			}

			/* limited login */
			// check is limited token
			if (token.split(".").length === 3) {
				try {
					const { payload: jwtClaims } = await jwtVerify(
						token,
						createRemoteJWKSet(
							// https://developers.facebook.com/docs/facebook-login/limited-login/token/#jwks
							new URL(
								"https://limited.facebook.com/.well-known/oauth/openid/jwks/",
							),
						),
						{
							algorithms: ["RS256"],
							audience: options.clientId,
							issuer: "https://www.facebook.com",
						},
					);

					if (nonce && jwtClaims.nonce !== nonce) {
						return false;
					}

					return !!jwtClaims;
				} catch {
					return false;
				}
			}

			/* access_token */
			// An opaque access token carries no app binding of its own, so it
			// must be validated against the configured app before it can be
			// trusted as proof of identity.
			return (await verifyFacebookAccessToken(token, options)) !== null;
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
						tokenEndpoint:
							"https://graph.facebook.com/v24.0/oauth/access_token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (token.idToken && token.idToken.split(".").length === 3) {
				const profile = decodeJwt(token.idToken) as {
					sub: string;
					email: string;
					name: string;
					picture: string;
				};

				const user = {
					id: profile.sub,
					name: profile.name,
					email: profile.email,
					picture: {
						data: {
							url: profile.picture,
							height: 100,
							width: 100,
							is_silhouette: false,
						},
					},
				};

				// https://developers.facebook.com/docs/facebook-login/limited-login/permissions
				// Facebook ID token does not include email_verified claim.
				// We default to false for security consistency.
				const userMap = await options.mapProfileToUser?.({
					...user,
					email_verified: false,
				});

				return {
					user: {
						...user,
						emailVerified: false,
						...userMap,
					},
					data: profile,
				};
			}

			// The profile is fetched with `accessToken`, which is the credential
			// that actually proves identity here — and a separate request field
			// from the `idToken`/token validated by `verifyIdToken`. Since an
			// opaque token is not app-bound at `/me`, validate this exact token
			// against the configured app before trusting the profile it returns.
			const accessToken = token.accessToken;
			if (!accessToken) {
				return null;
			}
			const tokenUserId = await verifyFacebookAccessToken(accessToken, options);
			if (!tokenUserId) {
				return null;
			}

			const fields = [
				"id",
				"name",
				"email",
				"picture",
				...(options?.fields || []),
			];
			const { data: profile, error } = await betterFetch<FacebookProfile>(
				"https://graph.facebook.com/me?fields=" + fields.join(","),
				{
					auth: {
						type: "Bearer",
						token: accessToken,
					},
				},
			);
			if (error) {
				return null;
			}
			// Bind the validated token to the profile it returned.
			if (profile.id !== tokenUserId) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.name,
					email: profile.email,
					image: profile.picture.data.url,
					emailVerified: profile.email_verified ?? false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<FacebookProfile>;
};
