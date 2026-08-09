import { betterFetch } from "@better-fetch/fetch";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { logger } from "../env";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	getPrimaryClientId,
	validateAuthorizationCode,
} from "../oauth2";
import type { GenericEndpointContext } from "../types";

/**
 * AgentID is an OpenID Connect provider for AI agents, from AgentMail.
 *
 * Two things make it unlike the other providers here, and both shape the code
 * below:
 *
 *  - **The agent, not a human, completes the sign-in.** The browser lands on a
 *    waiting page showing a request id, and the flow finishes when the agent
 *    that owns the inbox signs that id with a registered key. Nothing in this
 *    file has to do anything about that — it is simply why the authorization
 *    step can take a while.
 *  - **`name` is not guaranteed.** AgentID omits it for an inbox with no display
 *    name set, and does not serve it to every client tier. Better Auth requires
 *    one, so the inbox local part stands in rather than the sign-in failing.
 *
 * PKCE is always sent, and always `S256` — AgentID requires the first and
 * accepts only the second.
 *
 * @see https://auth.agentid.com/docs
 */
const ISSUER = "https://auth.agentid.com";

/**
 * The issuer publishes a discovery document at
 * `${ISSUER}/.well-known/openid-configuration` and recommends deriving these
 * from it. They are inlined here to match the other providers and to keep a
 * network round trip off the authorization path; each is overridable through
 * the standard options for anyone who would rather not trust the constant.
 */
const AUTHORIZATION_ENDPOINT = `${ISSUER}/v0/authorize`;
const TOKEN_ENDPOINT = `${ISSUER}/v0/token`;
const USERINFO_ENDPOINT = `${ISSUER}/v0/userinfo`;
const JWKS_URL = `${ISSUER}/v0/jwks.json`;

/** The only algorithm AgentID signs id_tokens with. */
const ID_TOKEN_ALG = "ES256";

/**
 * Scopes that are served only from `/userinfo`.
 *
 * No id_token carries the owner claims, so holding one of these is what makes
 * the extra request worth making — and not holding them is what makes it
 * wasteful.
 */
const OWNER_SCOPES = ["owner_profile", "owner_email"];

export interface AgentIdProfile {
	/** Stable subject derived from the inbox. The same agent gets the same sub. */
	sub: string;
	iss: string;
	aud: string;
	exp: number;
	iat: number;
	/** Names the single sign-in. */
	jti?: string;
	/** The inbox the agent signed in as, verified live when the token was minted. */
	email: string;
	/** Always true when present. */
	email_verified?: boolean;
	/**
	 * The agent's display name. Follows the `profile` scope, and is omitted when
	 * the inbox has none set.
	 */
	name?: string;
	/** The agent's organization id. Registered clients only. */
	org?: string;
	/** What the sign-in actually granted. Registered clients only. */
	scope?: string;
	/**
	 * The human who owns the organization behind the agent. Follows
	 * `owner_profile`, and arrives from `/userinfo` rather than the id_token.
	 */
	owner_name?: string;
	/** That human's email. Follows `owner_email`, likewise from `/userinfo`. */
	owner_email?: string;
	[claim: string]: unknown;
}

export interface AgentIdOptions extends ProviderOptions<AgentIdProfile> {
	/**
	 * Your client id.
	 *
	 * Either an https URL you control, which needs no registration and is held
	 * to `openid` and `email`, or the opaque id issued by
	 * https://console.agentid.com. An unregistered client id must be https and
	 * its redirect URI must sit on the same origin, so the unregistered tier
	 * cannot run on localhost.
	 */
	clientId: string;
	/**
	 * Your client secret, for a registered client. Leave unset for an
	 * unregistered one — there is nothing to send, and the token request
	 * authenticates with `none`.
	 */
	clientSecret?: string | undefined;
	/**
	 * How the token request authenticates, for a registered client.
	 *
	 * Must match what the registration declared. Defaults to `basic`, which is
	 * what the console registers by default. A mismatch fails the token
	 * exchange *after* the agent has already approved the sign-in, which is a
	 * long way to travel for a configuration error.
	 *
	 * Ignored without a `clientSecret`, where the method is `none`.
	 */
	tokenEndpointAuthentication?: ("basic" | "post") | undefined;
	/**
	 * Override the token endpoint. `authorizationEndpoint` is already a standard
	 * option; this is its counterpart, for pointing the pair at a staging issuer.
	 */
	tokenEndpoint?: string | undefined;
}

/**
 * Everything but the local part of an email, or the whole string if it has no
 * `@`. Used only to give Better Auth a name when AgentID supplies none.
 */
function localPart(email: string): string {
	const at = email.indexOf("@");
	return at > 0 ? email.slice(0, at) : email;
}

export const agentid = (options: AgentIdOptions) => {
	const tokenEndpoint = options.tokenEndpoint ?? TOKEN_ENDPOINT;

	/**
	 * Cached across calls so a key rotation is picked up without a redeploy:
	 * `createRemoteJWKSet` refetches on an unseen `kid`, which is what makes
	 * AgentID's rotation overlap window work.
	 */
	let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
	const getJwks = () => (jwks ??= createRemoteJWKSet(new URL(JWKS_URL)));

	return {
		id: "agentid",
		name: "AgentID",

		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!getPrimaryClientId(options.clientId)) {
				logger.error(
					"clientId is required for AgentID. Use an https URL you control, or the id from console.agentid.com.",
				);
				throw new Error("CLIENT_ID_REQUIRED");
			}

			/**
			 * `openid email` is the whole of what an unregistered client may have,
			 * so it is the default. A registered client adds `profile` and the
			 * owner pair through `scope`.
			 *
			 * Worth knowing which way each of those fails: the owner scopes are
			 * refused outright with `invalid_scope` when the client has not
			 * registered for them, while `profile` is accepted from a client that
			 * cannot have it and simply pays out no `name`.
			 */
			const _scopes = options.disableDefaultScope ? [] : ["openid", "email"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "agentid",
				options,
				authorizationEndpoint:
					options.authorizationEndpoint ?? AUTHORIZATION_ENDPOINT,
				scopes: _scopes,
				state,
				/**
				 * Never conditional. AgentID refuses any authorization request
				 * without a `code_challenge`, and `S256` — the method
				 * `createAuthorizationURL` sends whenever it is given a verifier —
				 * is the only one it accepts. There is no configuration in which
				 * omitting it is correct, so there is no option to omit it.
				 *
				 * Note that the requirement is not discoverable: metadata has no
				 * field for "PKCE required", so `code_challenge_methods_supported`
				 * advertises support rather than obligation. A client that reads
				 * discovery and defaults PKCE off — which Better Auth's own generic
				 * OAuth plugin does — learns the rule by failing.
				 */
				codeVerifier,
				redirectURI,
			});
		},

		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
				/**
				 * With no secret this must be `post`: that sends `client_id` in the
				 * body and nothing else, which is `token_endpoint_auth_method: none`.
				 * `basic` would send an Authorization header with an empty password
				 * and be read as a failed `client_secret_basic`.
				 */
				authentication: options.clientSecret
					? (options.tokenEndpointAuthentication ?? "basic")
					: "post",
			});
		},

		async verifyIdToken(token, nonce, ctx?: GenericEndpointContext) {
			if (options.disableIdTokenSignIn) {
				return false;
			}
			if (options.verifyIdToken) {
				return options.verifyIdToken(token, nonce, ctx);
			}
			try {
				const { payload } = await jwtVerify(token, getJwks(), {
					issuer: ISSUER,
					audience: options.clientId,
					algorithms: [ID_TOKEN_ALG],
				});
				if (nonce && payload.nonce !== nonce) {
					return false;
				}
				return true;
			} catch (error) {
				logger.error("Failed to verify AgentID id_token:", error);
				return false;
			}
		},

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
				logger.error("Failed to decode AgentID id_token:", error);
				return null;
			}
			if (!profile?.sub || !profile.email) {
				return null;
			}

			/**
			 * The owner claims live only on `/userinfo`, so this is the one call
			 * that can add anything the id_token could not carry. Skipped unless
			 * an owner scope was actually asked for, and never allowed to cost a
			 * sign-in the agent has already approved.
			 */
			const requestedScopes = [
				...(options.scope ?? []),
				...(token.scopes ?? []),
			];
			if (
				token.accessToken &&
				OWNER_SCOPES.some((scope) => requestedScopes.includes(scope))
			) {
				try {
					const { data: userinfo } = await betterFetch<AgentIdProfile>(
						USERINFO_ENDPOINT,
						{ headers: { Authorization: `Bearer ${token.accessToken}` } },
					);
					/**
					 * OIDC Core § 5.3.2: the UserInfo `sub` must match the id_token's,
					 * and the response must not be used otherwise. Skipping this would
					 * let a substituted access token attach another subject's owner
					 * identity to this user.
					 */
					if (userinfo && userinfo.sub === profile.sub) {
						profile = { ...profile, ...userinfo };
					} else if (userinfo) {
						logger.error(
							"AgentID /userinfo returned a different subject than the id_token; ignoring it.",
						);
					}
				} catch (error) {
					logger.error("Failed to fetch AgentID userinfo:", error);
				}
			}

			/**
			 * `name` is optional. AgentID omits it for an inbox with no display name
			 * set, and which client tiers are served it has changed before and may
			 * again — so this reads the claim rather than reasoning about who
			 * should have received one.
			 *
			 * `user.name` is `required` in the schema, so a profile without one
			 * fails on the NOT NULL constraint, as a raw database error rather
			 * than an OAuth one.
			 *
			 * Most providers here fall back to `""`, but they reach that only after
			 * one or two alternatives that nearly always exist (`login`,
			 * `username`, `global_name`). AgentID has no second name-ish field to
			 * try, so `""` would land far more often than it does elsewhere. The
			 * inbox local part is the agent's actual identifier
			 * and is derived from something AgentID did send.
			 */
			const name = profile.name || localPart(profile.email);

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.sub,
					name,
					email: profile.email,
					/**
					 * AgentID verifies the inbox live when it mints the token, and
					 * only ever sends `true`. Absent means the `email` scope was not
					 * granted, which is not the same as unverified.
					 */
					emailVerified: profile.email_verified === true,
					...userMap,
				},
				data: profile,
			};
		},

		options,
	} satisfies OAuthProvider<AgentIdProfile>;
};
