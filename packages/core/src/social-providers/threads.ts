import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

/**
 * Threads (Meta) profile returned by
 * `GET https://graph.threads.net/v1.0/me`.
 *
 * [More info](https://developers.facebook.com/docs/threads/get-started/get-profiles-and-content)
 */
export interface ThreadsProfile extends Record<string, any> {
	/** Stable, unique Threads account id. Never reassigned. */
	id: string;
	/** The account handle. Mutable: the user can rename it at any time. */
	username: string;
	/** Display name, if the user set one. */
	name?: string;
	/** URL of the profile picture. */
	threads_profile_picture_url?: string;
	/** The user's bio. */
	threads_biography?: string;
}

export interface ThreadsOptions extends ProviderOptions<ThreadsProfile> {
	clientId: string;
	clientSecret: string;
}

export const threads = (options: ThreadsOptions) => {
	// Threads separates the human-facing authorize host (threads.net) from the
	// Graph API host used for token exchange and profile reads (graph.threads.net).
	const authorizationEndpoint = "https://threads.net/oauth/authorize";
	const tokenEndpoint = "https://graph.threads.net/oauth/access_token";
	return {
		id: "threads",
		name: "Threads",
		// Threads' immutable account id is the stable subject. It never changes,
		// unlike the handle, so identity is keyed on it.
		accountSubject: ({ profile }) => profile.id,
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["threads_basic"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "threads",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				redirectURI,
				// Threads expects comma-separated scopes (Meta convention), not spaces.
				scopeJoiner: ",",
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			// Step 1: standard authorization-code exchange. Threads returns a
			// SHORT-LIVED token (~1h) with no `expires_in` and no `refresh_token`,
			// so better-auth would otherwise record no expiry at all.
			const tokens = await validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options: {
					clientId: options.clientId,
					clientSecret: options.clientSecret,
				},
				tokenEndpoint,
				authentication: "post",
			});

			// Step 2: immediately upgrade to a LONG-LIVED token (60 days). This
			// two-step is Threads-specific and is the main reason a first-class
			// provider beats a hand-rolled generic-OAuth setup: it is encapsulated
			// here instead of every integration reimplementing it.
			if (tokens.accessToken) {
				const { data: longLived } = await betterFetch<{
					access_token: string;
					token_type?: string;
					expires_in?: number;
				}>(
					`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${options.clientSecret}&access_token=${tokens.accessToken}`,
				);
				if (longLived?.access_token) {
					tokens.accessToken = longLived.access_token;
					// Threads has no OAuth refresh token: a long-lived token is its
					// own refresh credential. Persist it as the refresh token so
					// better-auth's refresh machinery can drive the self-refresh below.
					tokens.refreshToken = longLived.access_token;
					if (longLived.expires_in) {
						tokens.accessTokenExpiresAt = new Date(
							Date.now() + longLived.expires_in * 1000,
						);
					}
				}
			}

			return tokens;
		},
		// A long-lived token (older than 24h) is refreshed by presenting ITSELF to
		// th_refresh_access_token, which returns a fresh 60-day token. There is no
		// separate refresh token, so the returned token is stored as both the
		// access token and the refresh credential for the next cycle.
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					const { data, error } = await betterFetch<{
						access_token: string;
						token_type?: string;
						expires_in?: number;
					}>(
						`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_access_token&access_token=${refreshToken}`,
					);
					if (error || !data?.access_token) {
						throw error || new Error("Failed to refresh Threads access token");
					}
					return {
						accessToken: data.access_token,
						refreshToken: data.access_token,
						accessTokenExpiresAt: data.expires_in
							? new Date(Date.now() + data.expires_in * 1000)
							: undefined,
					};
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const fields = [
				"id",
				"username",
				"name",
				"threads_profile_picture_url",
				"threads_biography",
			];
			const { data: profile, error } = await betterFetch<ThreadsProfile>(
				`https://graph.threads.net/v1.0/me?fields=${fields.join(",")}&access_token=${token.accessToken}`,
			);
			if (error || !profile?.id) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					name: profile.name ?? profile.username,
					// The threads_basic scope returns no email. Synthesize a stable
					// placeholder keyed on the immutable `id`, never the handle: a
					// handle-keyed address goes stale the moment its owner renames and
					// two accounts could then mint the same address, colliding on the
					// unique email constraint and breaking sign-in. The `.invalid` TLD
					// is reserved (RFC 2606) so the address can never route real mail.
					// Override with `mapProfileToUser` to supply a real email.
					email: `${profile.id}@threads.invalid`,
					image: profile.threads_profile_picture_url,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<ThreadsProfile, ThreadsOptions>;
};
