import type { Awaitable } from "@better-auth/core";
import type { OAuthMappedUser } from "@better-auth/core/oauth2";
import type { InferOptionSchema } from "../../types";
import type { SolidDpopKeyPair } from "./dpop";
import type { schema } from "./schema";

/**
 * The `.well-known/openid-configuration` members this plugin consumes.
 *
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
 * @see https://solidproject.org/TR/oidc#discovery
 */
export interface SolidProviderMetadata {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	jwks_uri: string;
	userinfo_endpoint?: string | undefined;
	end_session_endpoint?: string | undefined;
	registration_endpoint?: string | undefined;
	scopes_supported?: string[] | undefined;
	id_token_signing_alg_values_supported?: string[] | undefined;
	dpop_signing_alg_values_supported?: string[] | undefined;
	code_challenge_methods_supported?: string[] | undefined;
	solid_oidc_supported?: string | undefined;
}

/**
 * Identity a Solid OpenID Provider asserted, after ID-token verification and
 * WebID/issuer confirmation.
 */
export interface SolidOidcProfile {
	/** The user's WebID: their stable, global identifier in Solid. */
	webid: string;
	/** The provider's own subject identifier for this user. */
	sub: string;
	/** The validated issuer that asserted this identity. */
	iss: string;
	/** Authorized party, when the provider set it. */
	azp?: string | undefined;
	/** `name` claim, when the provider set one. */
	name?: string | undefined;
	/** Issuers the WebID document named, empty when confirmation was skipped. */
	webIdIssuers: string[];
	/** How the WebID/issuer relationship was established. */
	webIdIssuerConfirmation: "webid-document" | "issuer-hosted" | "skipped";
	/** Every claim from the verified ID token. */
	claims: Record<string, unknown>;
}

export interface SolidClientIdDocumentConfig {
	/**
	 * The public URL the Client Identifier Document is served from, which is
	 * also the `client_id` sent to the provider.
	 *
	 * Defaults to `<baseURL>/solid/client-id/<providerId>`. Set it explicitly
	 * when the provider must reach Better Auth on a different public origin than
	 * the configured `baseURL` — behind a proxy, or on a separate ingress.
	 */
	clientId?: string | undefined;
	/** `client_name` shown on the provider's consent screen. */
	clientName?: string | undefined;
	/** `client_uri`, the application's home page. */
	clientURI?: string | undefined;
	/** `logo_uri` shown on the provider's consent screen. */
	logoURI?: string | undefined;
	/** `tos_uri`, the application's terms of service. */
	tosURI?: string | undefined;
	/** `policy_uri`, the application's privacy policy. */
	policyURI?: string | undefined;
	/** `contacts`, e-mail addresses responsible for the client. */
	contacts?: string[] | undefined;
	/** `post_logout_redirect_uris` for RP-initiated logout. */
	postLogoutRedirectURIs?: string[] | undefined;
	/** Extra members merged into the document, overriding generated ones. */
	additionalMetadata?: Record<string, unknown> | undefined;
}

export interface SolidOidcDpopConfig {
	/**
	 * JWS algorithm used to sign DPoP proofs.
	 *
	 * @default "ES256"
	 */
	algorithm?: "ES256" | "ES512" | "PS256" | "RS256" | "EdDSA" | undefined;
	/**
	 * Persist the DPoP key each refresh token is bound to, so a refresh can
	 * replay the same proof key. Disable only for a deployment that never
	 * refreshes — the token exchange still uses DPoP either way.
	 *
	 * @default true
	 */
	persistRefreshKeys?: boolean | undefined;
	/**
	 * Reject a token response whose `token_type` is not `DPoP`.
	 *
	 * A Solid provider that answers with a bearer token has not bound the token
	 * to the proof key, which silently drops the sender constraint, so this
	 * fails the sign-in by default.
	 *
	 * @default true
	 */
	requireDpopBoundTokens?: boolean | undefined;
}

export interface SolidOidcConfig {
	/**
	 * Provider ID used in `signIn.social({ provider })`, the callback path, and
	 * the account record.
	 *
	 * @default "solid"
	 */
	providerId?: string | undefined;
	/** Display name for the provider. */
	name?: string | undefined;
	/**
	 * The Solid Protocol Server's issuer identifier, usually the origin it is
	 * served from, e.g. `https://solid.example`.
	 *
	 * This is the authoritative value: it defines the account namespace and the
	 * discovery document must agree with it.
	 */
	issuer: string;
	/**
	 * Discovery document URL.
	 *
	 * @default "<issuer>/.well-known/openid-configuration"
	 */
	discoveryUrl?: string | undefined;
	/** Extra headers sent when fetching the discovery document. */
	discoveryHeaders?: Record<string, string> | undefined;
	/**
	 * Pre-registered client ID. Omit to identify the client by the Client
	 * Identifier Document this plugin serves.
	 */
	clientId?: string | undefined;
	/**
	 * Client secret for a statically registered client. A client identified by a
	 * Client Identifier Document has no secret.
	 */
	clientSecret?: string | undefined;
	/**
	 * How the client authenticates at the token endpoint.
	 *
	 * @default "none" without a `clientSecret`, `client_secret_basic` with one
	 */
	tokenEndpointAuthMethod?:
		| ("none" | "client_secret_basic" | "client_secret_post")
		| undefined;
	/**
	 * Client Identifier Document configuration, or `false` to serve none — for a
	 * provider where the client is statically registered.
	 */
	clientIdDocument?: SolidClientIdDocumentConfig | false | undefined;
	/**
	 * Scopes requested from the provider.
	 *
	 * @default ["openid", "webid", "offline_access"]
	 */
	scopes?: string[] | undefined;
	/** Overrides the callback URL sent to the provider. */
	redirectURI?: string | undefined;
	/** `prompt` parameter added to the authorization request. */
	prompt?:
		| (
				| "select_account"
				| "consent"
				| "login"
				| "none"
				| "select_account consent"
		  )
		| undefined;
	/** Extra query parameters added to the authorization request. */
	authorizationUrlParams?: Record<string, string> | undefined;
	/** DPoP behavior. */
	dpop?: SolidOidcDpopConfig | undefined;
	/**
	 * Confirm that the WebID in the ID token names this provider as a trusted
	 * issuer before accepting the identity.
	 *
	 * With this off, any provider you configure can assert any WebID, including
	 * one belonging to a user of a different pod. Turn it off only for a
	 * provider that is the sole authority for every WebID it issues.
	 *
	 * @default true
	 * @see https://solidproject.org/TR/oidc#webid-issuer
	 */
	requireWebIdIssuerConfirmation?: boolean | undefined;
	/**
	 * Accept the issuer when the WebID is hosted on the same scheme, host, and
	 * port as the issuer, without reading the WebID document.
	 *
	 * A provider that serves the WebID document is already in a position to
	 * choose its contents, so reading it back adds no guarantee.
	 *
	 * @default true
	 */
	trustIssuerHostedWebId?: boolean | undefined;
	/**
	 * Replaces the built-in WebID document lookup, for a deployment that
	 * resolves issuers from an RDF library, a registry, or a cache instead.
	 */
	getWebIdIssuers?:
		| ((input: { webId: string; issuer: string }) => Awaitable<string[]>)
		| undefined;
	/** Maps the verified Solid identity onto the local user record. */
	mapProfileToUser?:
		| ((profile: SolidOidcProfile) => Awaitable<OAuthMappedUser>)
		| undefined;
	/**
	 * Called after a successful token exchange with the DPoP key the tokens are
	 * bound to, for a deployment that maintains its own key store or needs the
	 * key to talk to a pod.
	 */
	onTokenExchange?:
		| ((input: {
				providerId: string;
				keyPair: SolidDpopKeyPair;
				accessToken?: string | undefined;
				refreshToken?: string | undefined;
		  }) => Awaitable<void>)
		| undefined;
	/**
	 * Fallback access-token lifetime, in seconds, for a provider that omits
	 * `expires_in`. Without it Better Auth cannot tell the token is stale and
	 * never refreshes it.
	 */
	accessTokenExpiresIn?: number | undefined;
	/** Overwrite the stored user with provider data on every sign-in. */
	overrideUserInfo?: boolean | undefined;
	/** Disable sign up for new users on this provider. */
	disableSignUp?: boolean | undefined;
	/** Require `requestSignUp` for new users on this provider. */
	disableImplicitSignUp?: boolean | undefined;
	/** Disable RP-initiated logout at the provider. */
	disableProviderLogout?: boolean | undefined;
	/** Default `post_logout_redirect_uri` for RP-initiated logout. */
	postLogoutRedirectURI?: string | undefined;
}

export interface SolidOidcOptions {
	/** One entry per Solid OpenID Provider. */
	config: SolidOidcConfig[];
	/**
	 * Base path the Client Identifier Documents are served from, relative to the
	 * Better Auth base URL. Each provider's document is served at
	 * `<basePath>/<providerId>`.
	 *
	 * @default "/solid/client-id"
	 */
	clientIdDocumentPath?: string | undefined;
	/** Override the generated table and column names. */
	schema?: InferOptionSchema<typeof schema> | undefined;
}
