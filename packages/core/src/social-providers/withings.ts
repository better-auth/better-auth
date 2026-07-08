import { betterFetch } from "@better-fetch/fetch";
import type { OAuth2Tokens, OAuthProvider, ProviderOptions } from "../oauth2";

/**
 * Withings user profile information.
 *
 * Withings does not expose a rich identity endpoint. The unique account
 * identifier (`userid`) is returned alongside the access token during the
 * token exchange.
 * @see https://developer.withings.com/api-reference/
 */
export interface WithingsProfile extends Record<string, any> {
	/**
	 * Unique Withings user identifier.
	 */
	userid: string | number;
	/**
	 * Granted scopes, comma-delimited.
	 */
	scope?: string;
}

export interface WithingsOptions extends ProviderOptions<WithingsProfile> {
	/**
	 * Withings client ID.
	 */
	clientId: string;
	/**
	 * Withings client secret.
	 */
	clientSecret: string;
}

/**
 * Shape of Withings' wrapped token responses.
 *
 * Withings always responds with HTTP 200 and wraps the payload in a
 * `{ status, body }` envelope, deviating from the OAuth2 spec.
 */
interface WithingsTokenResponse {
	status: number;
	body?: {
		userid?: string | number;
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		scope?: string;
		token_type?: string;
	};
	error?: string;
}

const tokenEndpoint = "https://wbsapi.withings.net/v2/oauth2";

export const withings = (options: WithingsOptions) => {
	const parseTokenResponse = (
		data: WithingsTokenResponse | null,
		error: unknown,
		context: string,
	): OAuth2Tokens => {
		if (error || !data || data.status !== 0 || !data.body) {
			throw new Error(
				`Failed to ${context}: ${
					data?.error ||
					(error instanceof Error ? error.message : "Unknown error")
				}`,
			);
		}
		const body = data.body;
		return {
			tokenType: body.token_type || "Bearer",
			accessToken: body.access_token,
			refreshToken: body.refresh_token,
			accessTokenExpiresAt: body.expires_in
				? new Date(Date.now() + body.expires_in * 1000)
				: undefined,
			scopes: body.scope ? body.scope.split(",") : undefined,
			// Withings only returns the account id during the token exchange, so
			// we carry it on the token for `getUserInfo`.
			userid: body.userid,
		} as OAuth2Tokens & { userid?: string | number };
	};

	return {
		id: "withings",
		name: "Withings",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["user.info"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			// Withings deviates from the RFC and uses comma-delimited scopes.
			const url = new URL(
				options.authorizationEndpoint ||
					"https://account.withings.com/oauth2_user/authorize2",
			);
			url.searchParams.set("response_type", "code");
			url.searchParams.set("client_id", options.clientId);
			url.searchParams.set("state", state);
			if (_scopes.length > 0) {
				url.searchParams.set("scope", _scopes.join(","));
			}
			url.searchParams.set("redirect_uri", options.redirectURI || redirectURI);
			return url;
		},

		// Withings uses a non-standard token exchange: it requires an `action`
		// parameter, always returns HTTP 200, and wraps the payload in a
		// `{ status, body }` envelope, so the shared helpers cannot be used.
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			const body = new URLSearchParams({
				action: "requesttoken",
				grant_type: "authorization_code",
				code,
				redirect_uri: options.redirectURI || redirectURI,
				client_id: options.clientId,
				client_secret: options.clientSecret,
			});

			const { data, error } = await betterFetch<WithingsTokenResponse>(
				tokenEndpoint,
				{
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
						accept: "application/json",
					},
					body,
				},
			);

			return parseTokenResponse(data, error, "validate authorization code");
		},

		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					const body = new URLSearchParams({
						action: "requesttoken",
						grant_type: "refresh_token",
						refresh_token: refreshToken,
						client_id: options.clientId,
						client_secret: options.clientSecret,
					});

					const { data, error } = await betterFetch<WithingsTokenResponse>(
						tokenEndpoint,
						{
							method: "POST",
							headers: {
								"content-type": "application/x-www-form-urlencoded",
								accept: "application/json",
							},
							body,
						},
					);

					return parseTokenResponse(data, error, "refresh access token");
				},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const userid = (token as OAuth2Tokens & { userid?: string | number })
				.userid;

			if (userid === undefined || userid === null || userid === "") {
				return null;
			}

			const id = String(userid);
			const profile: WithingsProfile = {
				userid,
				scope: token.scopes?.join(","),
			};

			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id,
					name: "",
					// Withings does not return an email, and the OAuth callback rejects a
					// missing one, so the default sign-in would always fail. Synthesize a
					// stable, non-routable placeholder (RFC 2606 `.invalid`) keyed to the
					// user's Withings id, left unverified. Applications that collect a real
					// email override it via `mapProfileToUser`.
					email: `${id}@withings.invalid`,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<WithingsProfile, WithingsOptions>;
};
