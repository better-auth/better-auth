import { betterFetch } from "@better-fetch/fetch";
import { createRemoteJWKSet, decodeJwt } from "jose";
import { logger } from "../env";
import type {
	OAuthIdTokenConfig,
	OAuthProvider,
	ProviderOptions,
} from "../oauth2";
import {
	createAuthorizationURL,
	getPrimaryClientId,
	validateAuthorizationCode,
	verifyProviderIdToken,
} from "../oauth2";

const ISSUER = "https://auth.agentid.com";

const AUTHORIZATION_ENDPOINT = `${ISSUER}/v0/authorize`;
const TOKEN_ENDPOINT = `${ISSUER}/v0/token`;
const USERINFO_ENDPOINT = `${ISSUER}/v0/userinfo`;
const JWKS_URL = `${ISSUER}/v0/jwks.json`;

const ID_TOKEN_ALG = "ES256";

/** AgentID profile claims. */
export interface AgentIdProfile {
	sub: string;
	iss: string;
	aud: string;
	exp: number;
	iat: number;
	jti?: string;
	email: string;
	email_verified?: boolean;
	name?: string;
	org?: string;
	scope?: string;
	owner_name?: string;
	owner_email?: string;
	[claim: string]: unknown;
}

/** Options for the AgentID social provider. */
export interface AgentIdOptions extends ProviderOptions<AgentIdProfile> {
	/** Registered client ID or an HTTPS URL for an unregistered client. */
	clientId: string;
	/** Registered client secret. Omit for an unregistered client. */
	clientSecret?: string | undefined;
	/**
	 * Registered token authentication method: `basic` (default) or `post`.
	 * Ignored without `clientSecret`.
	 */
	tokenEndpointAuthentication?: ("basic" | "post") | undefined;
	/** Token endpoint override. */
	tokenEndpoint?: string | undefined;
}

function localPart(email: string): string {
	const at = email.indexOf("@");
	return at > 0 ? email.slice(0, at) : email;
}

/** Creates an AgentID social provider. */
export const agentid = (options: AgentIdOptions) => {
	const tokenEndpoint = options.tokenEndpoint ?? TOKEN_ENDPOINT;
	const idToken = {
		jwks: createRemoteJWKSet(new URL(JWKS_URL)),
		issuer: ISSUER,
		audience: options.clientId,
		algorithms: [ID_TOKEN_ALG],
	} satisfies OAuthIdTokenConfig;
	const callbackVerificationOptions = options.disableIdTokenSignIn
		? { ...options, disableIdTokenSignIn: false }
		: options;

	return {
		id: "agentid",
		name: "AgentID",
		accountSubject: ({ profile }) => profile.sub,
		accountIssuer: ISSUER,
		issuer: ISSUER,

		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!getPrimaryClientId(options.clientId)) {
				logger.error(
					"clientId is required for AgentID. Use an HTTPS URL you control or the ID from console.agentid.com.",
				);
				throw new Error("CLIENT_ID_REQUIRED");
			}

			const requestedScopes = new Set(
				options.disableDefaultScope ? [] : ["openid", "email"],
			);
			for (const scope of options.scope ?? []) requestedScopes.add(scope);
			for (const scope of scopes ?? []) requestedScopes.add(scope);

			return createAuthorizationURL({
				id: "agentid",
				options,
				authorizationEndpoint:
					options.authorizationEndpoint ?? AUTHORIZATION_ENDPOINT,
				scopes: [...requestedScopes],
				state,
				codeVerifier,
				redirectURI,
			});
		},

		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			const tokens = await validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
				// Without a secret, `post` sends only `client_id`, implementing `none`.
				authentication: options.clientSecret
					? (options.tokenEndpointAuthentication ?? "basic")
					: "post",
			});
			if (
				!tokens.idToken ||
				!(await verifyProviderIdToken(
					{ idToken, options: callbackVerificationOptions },
					tokens.idToken,
				))
			) {
				return null;
			}
			return tokens;
		},

		idToken,

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}

			let profile: AgentIdProfile;
			try {
				profile = decodeJwt<AgentIdProfile>(token.idToken);
			} catch (error) {
				logger.error("Failed to decode AgentID ID token:", error);
				return null;
			}
			if (!profile?.sub || !profile.email) {
				return null;
			}

			if (token.accessToken) {
				try {
					const { data: userinfo } = await betterFetch<AgentIdProfile>(
						USERINFO_ENDPOINT,
						{ headers: { Authorization: `Bearer ${token.accessToken}` } },
					);
					// OIDC Core §5.3.2 requires UserInfo `sub` to match the ID token.
					if (userinfo && userinfo.sub === profile.sub) {
						profile = { ...profile, ...userinfo };
					} else if (userinfo) {
						logger.error(
							"AgentID UserInfo returned a different subject than the ID token; ignoring it.",
						);
					}
				} catch (error) {
					logger.error("Failed to fetch AgentID UserInfo:", error);
				}
			}

			const name = profile.name || localPart(profile.email);

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					name,
					email: profile.email,
					emailVerified: profile.email_verified === true,
					...userMap,
				},
				data: profile,
			};
		},

		options,
	} satisfies OAuthProvider<AgentIdProfile>;
};
