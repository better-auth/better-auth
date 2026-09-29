import { decodeJwt } from "jose";
import type { GenericOAuthConfig } from "../types";

/** Options for a registered Sign in with ChatGPT website client. */
export interface ChatGPTOptions
	extends Pick<
		GenericOAuthConfig,
		| "clientId"
		| "clientSecret"
		| "redirectURI"
		| "disableImplicitSignUp"
		| "disableSignUp"
		| "overrideUserInfo"
		| "mapProfileToUser"
		| "requireEmailVerification"
	> {
	/**
	 * Authentication provisioned by OpenAI for this client.
	 * Defaults to `client_secret_basic` when a secret is supplied, otherwise
	 * `none`. Set this explicitly for confidential clients so a missing secret
	 * fails initialization instead of selecting public-client authentication.
	 */
	tokenEndpointAuth?:
		| { method: "none" | "client_secret_basic" | "client_secret_post" }
		| undefined;
}

const issuer = "https://auth.openai.com";

/**
 * Sign in with ChatGPT using a registered website OAuth client.
 *
 * Requires OpenAI client registration. ChatGPT plan usage and dynamic client
 * registration use a separate flow and are not supported by this helper.
 *
 * @see https://developers.openai.com/siwc/website
 * @example
 * ```ts
 * genericOAuth({
 *   config: [chatgpt({ clientId })],
 * });
 * ```
 */
export function chatgpt(
	options: ChatGPTOptions,
): GenericOAuthConfig<"chatgpt"> {
	return {
		providerId: "chatgpt",
		name: "ChatGPT",
		discoveryUrl: `${issuer}/.well-known/openid-configuration`,
		requireIdTokenVerification: true,
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		tokenEndpointAuth: options.tokenEndpointAuth ?? {
			method: options.clientSecret ? "client_secret_basic" : "none",
		},
		// OpenAI's website exchange includes client_id for Basic auth too.
		tokenUrlParams: { client_id: options.clientId },
		scopes: ["openid", "profile", "email"],
		pkce: true,
		disableProviderLogout: true,
		redirectURI: options.redirectURI,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
		requireEmailVerification: options.requireEmailVerification,
		mapProfileToUser: options.mapProfileToUser,
		// OpenAI subjects are scoped to the client. Preserve that boundary even
		// if a deployment changes its client registration while keeping its DB.
		accountSubject: ({ profile }) =>
			JSON.stringify([issuer, options.clientId, profile.sub]),
		async getUserInfo(tokens) {
			// Generic OAuth verifies the signature, discovered issuer, audience,
			// expiry, and transaction nonce before calling this profile mapper.
			// Identity-only clients do not need access or refresh tokens.
			if (!tokens.idToken) return null;
			try {
				const profile = decodeJwt(tokens.idToken);
				if (
					profile.iss !== issuer ||
					typeof profile.sub !== "string" ||
					!profile.sub.trim() ||
					typeof profile.exp !== "number" ||
					!Number.isFinite(profile.exp) ||
					typeof profile.iat !== "number" ||
					!Number.isFinite(profile.iat)
				) {
					return null;
				}
				const email =
					typeof profile.email === "string" ? profile.email : undefined;
				return {
					...profile,
					sub: profile.sub,
					name: typeof profile.name === "string" ? profile.name : email,
					email,
					image:
						typeof profile.picture === "string" ? profile.picture : undefined,
					emailVerified: profile.email_verified === true,
				};
			} catch {
				return null;
			}
		},
	};
}
