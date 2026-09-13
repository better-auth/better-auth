import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type {
	OAuthProvider,
	ProviderOptions,
	TokenEndpointAuth,
} from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";
import { fetchRefusingRedirects } from "../oauth2/reject-redirects";

const authorizationEndpoint = "https://login.link.com/auth";
const tokenEndpoint = "https://login.link.com/auth/token";
const revocationEndpoint = "https://login.link.com/auth/revoke";
const userinfoEndpoint = "https://api.link.com/userinfo";

/**
 * The user profile returned by Link's `/userinfo` endpoint.
 */
export interface LinkProfile {
	/**
	 * The email address associated with the Link account.
	 */
	email?: string;
	/** The user's display name. */
	name?: string | null | undefined;
	/** The user's first name. */
	first_name?: string | null | undefined;
	/** The user's last name. */
	last_name?: string | null | undefined;
	/** The user's phone number. */
	phone?: string | null | undefined;
}

/**
 * Options for configuring the Link social provider.
 *
 * @see https://docs.stripe.com/agentic-commerce/link-cli/oauth
 */
export interface LinkOptions extends ProviderOptions<LinkProfile> {
	/** The client ID of your confidential Link OAuth client. */
	clientId: string;
	/** The client secret of your confidential Link OAuth client. */
	clientSecret: string;
	/** The Stripe publishable key associated with your Link OAuth client. */
	publishableKey: string;
}

const requireCodeVerifier = (codeVerifier: string | undefined) => {
	if (!codeVerifier) {
		throw new BetterAuthError("codeVerifier is required for Link");
	}
	return codeVerifier;
};

const getTokenEndpointAuth = (options: LinkOptions) =>
	({
		method: "custom",
		customizeRequest({ body, headers }) {
			body.set("client_id", options.clientId);
			body.set("client_secret", options.clientSecret);
			headers.authorization = `Bearer ${options.publishableKey}`;
		},
	}) satisfies TokenEndpointAuth;

export const link = (options: LinkOptions) => {
	return {
		id: "link",
		name: "Link",
		accountSubject: ({ profile }) => {
			if (!profile.email) {
				throw new BetterAuthError("Link profile email is required");
			}
			return profile.email;
		},
		createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			additionalParams,
		}) {
			if (
				!options.clientId ||
				!options.clientSecret ||
				!options.publishableKey
			) {
				logger.error(
					"Client ID, client secret, and publishable key are required for Link.",
				);
				throw new BetterAuthError(
					"CLIENT_ID_SECRET_AND_PUBLISHABLE_KEY_REQUIRED",
				);
			}

			const _scopes = options.disableDefaultScope
				? []
				: ["payment_methods.agentic", "userinfo:read"];
			if (options.scope?.length) _scopes.push(...options.scope);
			if (scopes?.length) _scopes.push(...scopes);
			if (!_scopes.length) {
				throw new BetterAuthError("At least one scope is required for Link");
			}

			return createAuthorizationURL({
				id: "link",
				options,
				authorizationEndpoint,
				scopes: [...new Set(_scopes)],
				state,
				codeVerifier: requireCodeVerifier(codeVerifier),
				redirectURI,
				additionalParams: {
					...(additionalParams ?? {}),
					key: options.publishableKey,
				},
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier: requireCodeVerifier(codeVerifier),
				redirectURI,
				options,
				tokenEndpoint,
				tokenEndpointAuth: getTokenEndpointAuth(options),
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint,
						tokenEndpointAuth: getTokenEndpointAuth(options),
					});
				},
		async revokeToken(token) {
			const body = new URLSearchParams({
				client_id: options.clientId,
				client_secret: options.clientSecret,
				token,
				token_type_hint: "refresh_token",
			});
			const { error } = await fetchRefusingRedirects(revocationEndpoint, {
				method: "POST",
				headers: {
					accept: "application/json",
					authorization: `Bearer ${options.publishableKey}`,
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
			});
			if (error) throw error;
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data: profile, error } = await betterFetch<LinkProfile>(
				userinfoEndpoint,
				{ headers: { authorization: `Bearer ${token.accessToken}` } },
			);

			if (error || !profile?.email) {
				logger.error(
					"Failed to fetch user info from Link or the profile has no email:",
					error,
				);
				return null;
			}

			const name =
				profile.name ||
				[profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
				profile.email;
			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					name,
					email: profile.email,
					// Link does not expose email verification status.
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<LinkProfile>;
};
