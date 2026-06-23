import type { GenericEndpointContext, LiteralString } from "@better-auth/core";
import type { JWSAlgorithms } from "better-auth/plugins";
import type { InferOptionSchema, Session, User } from "better-auth/types";
import type { JWTPayload } from "jose";
import type { schema } from "../schema";
import type { Awaitable } from "./helpers";
import type {
	AuthServerMetadata,
	Confirmation,
	GrantType,
	OIDCMetadata,
	TokenEndpointAuthMethod,
	TokenType,
} from "./oauth";
import type { ClientRegistrationRequest } from "./zod";

export type {
	AuthMethod,
	AuthServerMetadata,
	BearerMethodsSupported,
	Confirmation,
	GrantType,
	OAuthClient,
	OIDCMetadata,
	ResourceServerMetadata,
	TokenEndpointAuthMethod,
	TokenType,
} from "./oauth";
export type { ClientRegistrationRequest } from "./zod";

export type StoreTokenType =
	| "access_token"
	| "refresh_token"
	| "authorization_code"
	| (string & {});

type InternallySupportedScopes =
	| "openid"
	| "profile"
	| "email"
	| "offline_access";
export type Scope = LiteralString | InternallySupportedScopes;
export type Prompt = "none" | "consent" | "login" | "create" | "select_account";
export type AuthorizePrompt =
	| Prompt
	| "login consent"
	| "select_account consent";

/**
 * Describes how to resolve a `client_id` from an external source (a URL-based
 * metadata document, a federated registry, an attestation header, etc.) and
 * what fields that source contributes to discovery metadata.
 *
 * Plugins contribute one of these through
 * {@link OAuthProviderExtension.clientDiscovery}. The host walks every
 * configured entry in order and returns the first non-null `resolve()` result.
 */
export interface ClientDiscovery {
	/**
	 * Stable identifier used in error messages and diagnostics. Convention
	 * is to match the plugin id (for example `"cimd"`).
	 */
	readonly id: string;
	/**
	 * Return `true` if this discovery handles the given `client_id`. Called
	 * on every `getClient()` lookup for every configured discovery, so keep
	 * it cheap and synchronous.
	 */
	matches: (clientId: string) => boolean;
	/**
	 * Resolve a client when this discovery matches. Receives the existing DB
	 * record (or `null`) so an implementation can decide between creating,
	 * refreshing, or passing through to the database result.
	 *
	 * Return:
	 * - a client record: `getClient()` returns it (creation / refresh / takeover).
	 * - `null`: `getClient()` falls through to the next matching discovery
	 *   or to the database record (if any).
	 */
	resolve: (
		ctx: GenericEndpointContext,
		clientId: string,
		existing: SchemaClient<Scope[]> | null,
	) => Awaitable<SchemaClient<Scope[]> | null>;
	/**
	 * Fields merged into `/.well-known/oauth-authorization-server` and
	 * `/.well-known/openid-configuration` responses. Useful for advertising
	 * RFC-registered discovery flags like
	 * `client_id_metadata_document_supported`.
	 */
	discoveryMetadata?: Record<string, unknown>;
}

export interface OAuthAuthenticatedClient {
	clientId: string;
	client: SchemaClient<Scope[]>;
	method?: TokenEndpointAuthMethod;
	/**
	 * A sender-constraint the authentication step already proved (for example a
	 * wallet-instance key thumbprint). Pass it to `issueTokens` as
	 * {@link OAuthTokenIssueParams.confirmation} to bind the issued token to it.
	 * The authorization server writes this as token material and does not verify
	 * it again, so a strategy must set it only after proving possession.
	 */
	confirmation?: Confirmation;
}

export interface OAuthClientAuthenticationRequest {
	/**
	 * Scopes to validate against the registered client.
	 */
	scopes?: string[];
	/**
	 * Set to `false` for public extension grants that only require client_id.
	 *
	 * @default true
	 */
	requireCredentials?: boolean;
}

export interface OAuthTokenIssueParams {
	client: SchemaClient<Scope[]>;
	scopes: string[];
	user?: User;
	referenceId?: string;
	sessionId?: string;
	nonce?: string;
	refreshToken?: OAuthRefreshToken<Scope[]> & { id: string };
	authTime?: Date;
	verificationValue?: VerificationValue;
	resources?: string[];
	/** Full original authorized resources for the grant, used to seed refresh tokens. */
	originalResources?: string[];
	/**
	 * OIDC UserInfo claim names requested by the authorization request's
	 * `claims.userinfo` object. The authorization server persists these names so
	 * refresh-token rotation and opaque access tokens continue honoring the same
	 * UserInfo request contract.
	 */
	requestedUserInfoClaims?: string[];
	/**
	 * Additional JWT access-token claims for this single issuance.
	 *
	 * JWT-only: these are baked into the signed token at mint. Opaque access
	 * tokens persist no per-issuance claims, so they do NOT reappear at
	 * introspection. A claim that must be visible at opaque-token introspection
	 * belongs in a grant-type-stable `claims.accessToken` contributor instead,
	 * which the introspection path re-derives. Reserved RFC 9068 claim names stay
	 * owned by the authorization server.
	 */
	accessTokenClaims?: Record<string, unknown>;
	/**
	 * Additional ID-token claims for this single issuance. Additive: they cannot
	 * replace identity, authentication-context, or AS-owned claims.
	 */
	idTokenClaims?: Record<string, unknown>;
	/**
	 * Additional fields for the token response envelope. Standard OAuth token
	 * response fields stay owned by the authorization server.
	 */
	tokenResponse?: Record<string, unknown>;
	/**
	 * Sender-constraint to bind this issuance to (RFC 7800 `cnf`). When set, the
	 * issuer stamps it as the access token's `cnf` and derives `token_type` from
	 * it, instead of leaving the token a bearer token. Use it to carry a
	 * confirmation a client-auth strategy or an out-of-band flow already proved
	 * (see {@link OAuthAuthenticatedClient.confirmation}). `cnf` is AS-owned: it
	 * is stamped after, and cannot be overridden by, contributed claims.
	 */
	confirmation?: Confirmation;
}

export interface OAuthTokenResponse {
	access_token: string;
	expires_in: number;
	expires_at: number;
	token_type: TokenType;
	refresh_token: string | undefined;
	scope: string;
	id_token: string | undefined;
	[key: string]: unknown;
}

export type ActiveAccessTokenPayload = JWTPayload & { active: true };

/**
 * The OAuth Provider's server-side capability surface, bound to a request `ctx`.
 * A grant handler receives one as `provider`; a companion plugin's own endpoint
 * obtains one with `getOAuthProviderApi(ctx, opts, grantType?)`. The same object
 * serves both, so issuance, client resolution, and token verification behave the
 * same inside and outside a grant.
 */
export interface OAuthProviderApi {
	/**
	 * Resolves a registered client by id, consulting extension client-discovery
	 * sources. Returns `null` when no client matches.
	 */
	getClient: (clientId: string) => Awaitable<SchemaClient<Scope[]> | null>;
	/**
	 * Authenticates the calling client from the request (client secret, assertion,
	 * or none). For assertion-based methods, the RFC 7523 audience is bound to the
	 * endpoint serving the request, so an assertion cannot be replayed across
	 * endpoints. Returns the authenticated client, plus any `confirmation` an
	 * assertion strategy proved.
	 */
	authenticateClient: (
		request?: OAuthClientAuthenticationRequest,
	) => Awaitable<OAuthAuthenticatedClient>;
	/**
	 * Issues the token set for this grant (access token, optional refresh token,
	 * optional ID token, resource policy, response envelope, and any
	 * sender-constraint). The grant type is fixed by the `getOAuthProviderApi`
	 * binding (the dispatcher's grant for an in-grant handler, the caller's grant
	 * for an out-of-grant endpoint), so it cannot be mislabeled per issuance.
	 *
	 * Authorization is the caller's responsibility. The authorization server does
	 * NOT re-check that `params.scopes`, `params.user`, or `params.resources` are
	 * a subset of what `authenticateClient` validated: this is a raw minting
	 * primitive, and the built-in grants each validate scopes themselves before
	 * calling it.
	 */
	issueTokens: (params: OAuthTokenIssueParams) => Awaitable<OAuthTokenResponse>;
	/**
	 * Computes the stored lookup key for a token value (the same hash the
	 * provider persists), so a caller can find or revoke a previously issued
	 * opaque token by its value.
	 */
	hashToken: (token: string, type: StoreTokenType) => Awaitable<string>;
	/**
	 * Validates an access token for introspection-style callers. The returned
	 * payload can be inactive; protected-resource endpoints should use
	 * `requireActiveAccessToken`.
	 */
	validateAccessToken: (
		token: string,
		clientId?: string,
	) => Awaitable<JWTPayload>;
	/**
	 * Validates an access token for a protected resource and throws the OAuth
	 * bearer challenge when the token is inactive or unknown.
	 */
	requireActiveAccessToken: (
		token: string,
		clientId?: string,
	) => Awaitable<ActiveAccessTokenPayload>;
}

export interface OAuthExtensionGrantHandlerInput {
	ctx: GenericEndpointContext;
	opts: OAuthOptions<Scope[]>;
	grantType: GrantType;
	/** The provider capability surface, pre-bound to this grant's `grantType`. */
	provider: OAuthProviderApi;
}

export type OAuthExtensionGrantHandler = (
	input: OAuthExtensionGrantHandlerInput,
) => Awaitable<OAuthTokenResponse>;

export interface OAuthClientAuthenticationInput {
	ctx: GenericEndpointContext;
	opts: OAuthOptions<Scope[]>;
	assertion: string;
	assertionType: string;
	clientId?: string;
	/**
	 * The endpoint URL the assertion was presented to. A strategy MUST bind the
	 * assertion to this audience (see {@link OAuthClientAuthenticationStrategy.authenticate}).
	 */
	expectedAudience?: string;
}

export interface OAuthClientAuthenticationResult {
	/** The client id the assertion proved the caller controls. */
	clientId: string;
	/**
	 * A sender-constraint the strategy proved (for example a wallet-instance key
	 * thumbprint). The provider stamps it as the issued token's RFC 7800 `cnf`.
	 * Set it only after proving possession; the authorization server writes it as
	 * token material and does not verify it again.
	 */
	confirmation?: Confirmation;
}

export interface OAuthClientAuthenticationStrategy {
	/**
	 * Assertion type URIs this strategy consumes from `client_assertion_type`.
	 * Values must be absolute URIs per RFC 7521. When omitted, the strategy key
	 * in `OAuthProviderExtension.clientAuthentication` is used and must also be
	 * an absolute URI.
	 */
	assertionTypes?: string[];
	/**
	 * Verifies the presented assertion and returns the proven client id (plus any
	 * sender-constraint it established). The strategy proves the caller controls
	 * `clientId`; it does not supply the authorization record. The provider
	 * resolves and authorizes the client itself, so a strategy cannot influence
	 * the client's grants, scopes, or enabled state.
	 *
	 * The strategy owns the full RFC 7521/7523 verification. After verifying the
	 * signature against its own key source, it MUST enforce the assertion-hygiene
	 * checks the built-in `private_key_jwt` path enforces, or the provider will
	 * accept a forged or replayed assertion:
	 * - bind the assertion to `input.expectedAudience` (RFC 7523 §3 rule 3),
	 * - require a bounded `exp` (RFC 7523 §3 rule 4),
	 * - reject replays via a single-use `jti`.
	 *
	 * The exported `consumeClientAssertion` helper performs the audience,
	 * lifetime, and `jti` single-use checks for a decoded payload; call it after
	 * signature verification so an extension method inherits the same guarantees
	 * as `private_key_jwt`.
	 */
	authenticate: (
		input: OAuthClientAuthenticationInput,
	) => Awaitable<OAuthClientAuthenticationResult>;
}

export interface OAuthMetadataExtensionInput {
	ctx: GenericEndpointContext;
	opts: OAuthOptions<Scope[]>;
	type: "oauth-authorization-server" | "openid-configuration";
	/**
	 * The discovery document the provider assembled (core authorization-server
	 * fields plus any client-discovery metadata). Contributions from other
	 * extensions are merged afterwards and are not reflected here, so a
	 * contributor decides what to add from provider state alone, independent of
	 * extension registration order. The contributor returns the fields to add.
	 */
	document: AuthServerMetadata | OIDCMetadata;
}

export interface OAuthClaimExtensionInput {
	ctx: GenericEndpointContext;
	opts: OAuthOptions<Scope[]>;
	user?: (User & Record<string, unknown>) | null;
	client: SchemaClient<Scope[]>;
	scopes: string[];
	grantType?: GrantType;
	referenceId?: string;
	/**
	 * Session the tokens are issued for, when one is available. Best-effort:
	 * set on the session-backed grants (authorization_code, refresh_token),
	 * undefined otherwise (client_credentials, introspection, or a session that
	 * was deleted or unlinked). Treat as possibly undefined.
	 */
	sessionId?: string;
	resources?: string[];
	/** Parsed client metadata, as returned by `parseClientMetadata`. */
	metadata?: Record<string, unknown>;
}

export interface OAuthUserInfoExtensionInput {
	ctx: GenericEndpointContext;
	opts: OAuthOptions<Scope[]>;
	user: User & Record<string, unknown>;
	scopes: string[];
	jwt: JWTPayload;
	client?: SchemaClient<Scope[]>;
	/**
	 * Claim names explicitly requested through the OIDC `claims.userinfo`
	 * authorization request parameter.
	 */
	requestedClaims: string[];
}

/**
 * What a companion plugin contributes to the OAuth Provider, registered through
 * `extendOAuthProvider(ctx, extension)` (or the `oauthProvider({ extensions })`
 * option).
 *
 * All five kinds live on one object so a single protocol plugin (for example
 * RFC 8693 token exchange, which adds a grant, advertises metadata, and emits
 * claims) registers atomically and the host validates the combined surface in
 * one place. Every field is independently optional, so a single-concern plugin
 * (such as `@better-auth/cimd`, which contributes only `clientDiscovery`) sets
 * just the one it needs. This is the shape every future OAuth RFC plugin copies.
 *
 * Two contribution disciplines:
 * - Dispatched kinds (`grants`, `clientAuthentication`) must be disjoint across
 *   extensions: registering a grant type, auth method, or assertion type that
 *   another extension already registered is rejected at setup, since the second
 *   would otherwise be silently unreachable.
 * - Additive kinds (`metadata`, `claims`) never override authorization-server
 *   core; a key already owned by the provider is kept, and a key two extensions
 *   both contribute resolves to the first-registered extension.
 */
export interface OAuthProviderExtension {
	/**
	 * Token grants keyed by absolute-URI `grant_type`. The token endpoint
	 * dispatches a matching `grant_type` to the handler, which authenticates the
	 * client and issues tokens through the shared `provider`.
	 */
	grants?: Record<string, OAuthExtensionGrantHandler>;
	/**
	 * Assertion-based client authentication, keyed by the advertised
	 * `token_endpoint_auth_method`. Consumes the matching `client_assertion_type`
	 * at the token, introspection, and revocation endpoints. Built-in method
	 * names (`client_secret_basic`/`_post`, `private_key_jwt`, `none`) are
	 * reserved.
	 */
	clientAuthentication?: Record<string, OAuthClientAuthenticationStrategy>;
	/**
	 * Additional discovery metadata fields. Core fields (`issuer`,
	 * `token_endpoint`, advertised grants and auth methods, ...) stay owned by
	 * the provider; only absent keys are added. To advertise the claim names a
	 * claims contributor emits, set `advertisedMetadata.claims_supported`: the
	 * provider owns `claims_supported` and does not infer it from contributors.
	 */
	metadata?: (input: OAuthMetadataExtensionInput) => Record<string, unknown>;
	/**
	 * Additional claims for access tokens, ID tokens, and the UserInfo response.
	 * Strictly additive: a contributor can add new claims but never replace an
	 * identity, authentication-context, reserved RFC 9068, or other AS-owned
	 * claim. Access-token claims are re-derived at opaque-token introspection, so
	 * they must be grant-type-stable (a contributor receives `grantType:
	 * undefined` there). See the claim-authority overview in the docs for the
	 * full per-token precedence ladder.
	 */
	claims?: {
		accessToken?: (
			input: OAuthClaimExtensionInput,
		) => Awaitable<Record<string, unknown>>;
		idToken?: (
			input: OAuthClaimExtensionInput,
		) => Awaitable<Record<string, unknown>>;
		userInfo?: (
			input: OAuthUserInfoExtensionInput,
		) => Awaitable<Record<string, unknown>>;
	};
	/**
	 * Client-id resolution sources consulted by `getClient()`, plus the
	 * discovery-metadata fields they advertise. Entries across all extensions
	 * run in order; the first to return a client wins. A plugin that resolves
	 * clients from an external source (a metadata-document URL, a federated
	 * registry, an attestation header) contributes it here.
	 */
	clientDiscovery?: ClientDiscovery | ClientDiscovery[];
}

/**
 * Result of authorizing an RFC 7591 initial access token, returned by
 * {@link OAuthOptions.validateInitialAccessToken}.
 */
export interface InitialAccessTokenAuthorization {
	/**
	 * Ownership reference to attach to the created OAuth client.
	 *
	 * Associates machine-provisioned clients with an organization, team, tenant,
	 * or other application-level owner. Omit to create an unowned client (the
	 * client is stored with neither a `user_id` nor a `reference_id`).
	 */
	referenceId?: string;
}

export interface OAuthOptions<
	Scopes extends readonly Scope[] = InternallySupportedScopes[],
> {
	/**
	 * Custom schema definitions
	 */
	schema?: InferOptionSchema<typeof schema>;
	/**
	 * The scopes that the client is allowed to request.
	 * Must contain "openid" to be considered an OIDC server,
	 * otherwise it is just an OAuth server.
	 *
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#ScopeClaims
	 * @default
	 * ```ts
	 * ["openid", "profile", "email", "offline_access"]
	 * ```
	 */
	scopes?: Scopes;
	/**
	 * Protected resources the AS issues access tokens for. Promotes the
	 * resource model into a first-class persisted entity with per-resource
	 * token policy.
	 *
	 * - String form: each string becomes an `oauthResource` row using plugin-level
	 *   defaults.
	 * - Object form: explicit per-resource policy (TTL, signing alg, scope
	 *   allowlist, custom claims, sender-constraint requirements).
	 *
	 * Seeding is keyed by `identifier`. Behavior on re-seed is controlled by
	 * {@link OAuthOptions.resourceSeedMode}.
	 *
	 * @see RFC 8707 — `identifier` is the `resource` parameter value
	 * @example
	 * ```ts
	 * resources: [
	 *   { identifier: "https://api.example.com/admin", accessTokenTtl: 300,
	 *     allowedScopes: ["admin:read", "admin:write"] },
	 *   "https://api.example.com/public",
	 * ]
	 * ```
	 */
	resources?: Array<string | OAuthResourceInput>;
	/**
	 * Controls whether boot-time `resources` config overwrites DB-edited rows.
	 *
	 * - `"insertOnly"` (default, safe): only inserts rows whose `identifier` is
	 *   not already present. Existing rows are untouched — admin edits via CRUD
	 *   are never reverted on restart.
	 * - `"merge"`: inserts missing rows; updates only fields present in the
	 *   config object for existing rows.
	 * - `"overwrite"`: inserts missing rows; replaces existing rows with the
	 *   config values. Use only when the config is the source of truth.
	 *
	 * Defaults to the safe option to prevent accidental policy reverts in
	 * production deployments.
	 *
	 * @default "insertOnly"
	 */
	resourceSeedMode?: "insertOnly" | "merge" | "overwrite";
	/**
	 * Opt-in cache membership for resources by `identifier`. Mirrors the
	 * {@link OAuthOptions.cachedTrustedClients} pattern.
	 *
	 * Cached resources are invalidated on every CRUD write. Resources not in
	 * this set are looked up from the DB on every request — the safe default
	 * when admins edit rows through external tooling.
	 */
	cachedResources?: Set<string>;
	/**
	 * When true, `/oauth2/token` and `/oauth2/authorize` require the client to be
	 * linked to every requested resource via `oauthClientResource`. When false,
	 * clients implicitly have access to all enabled resources.
	 *
	 * Defaults to `true`, enabling per-client validation per RFC 8707 §3. An
	 * explicit `false` keeps all enabled resources requestable by any client.
	 *
	 * The resolved value is logged at plugin init so admins see which default
	 * applied.
	 */
	enforcePerClientResources?: boolean;
	/**
	 * Customize how a resource `identifier` is validated when resources are
	 * created via CRUD or DCR. The default rejects non-URI identifiers per
	 * RFC 8707 §2 (absolute URI, no fragment). Override only for trusted
	 * internal use cases.
	 *
	 * @default RFC 8707 strict URI validator
	 */
	identifierValidator?: (identifier: string) => Awaitable<boolean>;
	/**
	 * RBAC on OAuth resources. Mirrors {@link OAuthOptions.clientPrivileges}.
	 *
	 * Gates the admin resource CRUD endpoints. Return `false` (or `undefined`)
	 * to deny the action.
	 */
	resourcePrivileges?: (context: {
		headers: Headers;
		action:
			| "create"
			| "read"
			| "update"
			| "delete"
			| "list"
			| "link"
			| "unlink";
		user?: User & Record<string, unknown>;
		session?: Session & Record<string, unknown>;
		resourceId?: string;
	}) => Awaitable<boolean | undefined>;
	/**
	 * Automatically cache trusted clients by client_id.
	 * Clients are cached at request.
	 *
	 * Additionally, cached trusted clients are immutable
	 * through the CRUD endpoints.
	 */
	cachedTrustedClients?: Set<string>;
	/**
	 * The amount of time in seconds that the access token is valid for.
	 *
	 * @default 3600 (1 hour) - Industry standard
	 */
	accessTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that a client
	 * credentials grant access token is valid for.
	 *
	 * @default 3600 (1 hour)
	 */
	m2mAccessTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that id token is valid for.
	 *
	 * @default 36000 (10 hours) - Recommended by the OIDC spec
	 */
	idTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that the refresh token is valid for.
	 * Typical industry standard is 30 days
	 *
	 * @default 2592000 (30 days)
	 */
	refreshTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that the authorization code is valid for.
	 *
	 * @default 600 (10 minutes) - Recommended by the OIDC spec
	 */
	codeExpiresIn?: number;
	/**
	 * Create access token expirations based on scope.
	 *
	 * This is useful for higher-privilege scopes that
	 * require shorter expiration times. The earliest
	 * expiration will take precedence. If not specified,
	 * the default will take place.
	 *
	 * Note: values should be lower than the defaults
	 * `accessTokenExpiresIn` and `m2mAccessTokenExpiresIn`
	 *
	 * @example
	 * { "write:payments": "5m", "read:payments": "30m" }
	 */
	scopeExpirations?: {
		[K in Scopes[number]]?: number | string | Date;
	};
	/**
	 * Maximum lifetime in seconds for client assertion JWTs
	 * used with `private_key_jwt` authentication.
	 *
	 * @default 300 (5 minutes)
	 */
	assertionMaxLifetime?: number;
	/**
	 * Allows /oauth2/public-client-prelogin endpoint to be
	 * requestable prior to login via a valid oauth_query.
	 */
	allowPublicClientPrelogin?: boolean;
	/**
	 * Allow unauthenticated dynamic client registration.
	 *
	 * When enabled, the `/oauth2/register` endpoint accepts requests
	 * without a session. Public clients use
	 * `token_endpoint_auth_method: "none"`; confidential clients receive a
	 * one-time `client_secret` in the registration response.
	 *
	 * For verified client discovery (MCP), consider installing the
	 * `@better-auth/cimd` plugin, which verifies client identity through
	 * domain ownership via Client ID Metadata Documents.
	 *
	 * @default false
	 */
	allowUnauthenticatedClientRegistration?: boolean;
	/**
	 * Allow dynamic client registration (RFC 7591) at `POST /oauth2/register`.
	 *
	 * Once enabled, a registration request is authorized through one of three
	 * modes:
	 * - session-backed: a logged-in user with client-create privileges.
	 * - token-backed: a valid initial access token, when
	 *   {@link OAuthOptions.validateInitialAccessToken} is defined.
	 * - open: unauthenticated registration, when
	 *   {@link OAuthOptions.allowUnauthenticatedClientRegistration}
	 *   is enabled.
	 *
	 * @default false
	 */
	allowDynamicClientRegistration?: boolean;
	/**
	 * Validates an RFC 7591 initial access token for protected dynamic client
	 * registration, read from the `Authorization: Bearer <token>` header on
	 * `POST /oauth2/register`.
	 *
	 * Return an {@link InitialAccessTokenAuthorization} (optionally carrying a
	 * `referenceId` owner) to authorize the registration, or `false` to reject
	 * the token. Defining this callback enables the token-backed registration
	 * mode; while it is undefined, a Bearer token presented to the endpoint is
	 * rejected rather than downgraded to open registration.
	 *
	 * `clientMetadata` is the schema-validated request body. It is self-asserted
	 * (RFC 7591 §5) and not yet semantically validated, so a request authorized
	 * here may still be rejected by a later metadata check. Compare the token in
	 * constant time; issuance, storage, expiration, and revocation are
	 * deployment-specific in RFC 7591 and belong in your application.
	 *
	 * `headers` is the raw request `Headers`, available to correlate the token
	 * with other request context (a tenant header, a forwarded client identity).
	 *
	 * With the `bearer` plugin enabled, a Bearer value that resolves to a valid
	 * user session is handled as that session, not as an initial access token.
	 *
	 * @see InitialAccessTokenAuthorization
	 */
	validateInitialAccessToken?: (context: {
		initialAccessToken: string;
		headers: Headers;
		clientMetadata: ClientRegistrationRequest;
	}) => Awaitable<InitialAccessTokenAuthorization | false>;
	/**
	 * OAuth/OIDC extension points used by companion plugins to add protocol
	 * grants, client authentication methods, metadata, claims, and client-id
	 * discovery without modifying oauth-provider core for each RFC.
	 *
	 * Extension plugins should prefer `extendOAuthProvider(ctx, extension)` in
	 * their `init()` hook so users can compose plugins declaratively. Plugins
	 * such as `@better-auth/cimd` contribute their client discovery this way.
	 */
	extensions?: OAuthProviderExtension[];
	/**
	 * List of scopes for newly registered clients
	 * if not requested.
	 *
	 * For scopes that shall automatically adapt to your scopes
	 * list in the future (ie scopes: undefined), create that client
	 * using the server's `createOAuthClient` function.
	 *
	 * @default scopes
	 */
	clientRegistrationDefaultScopes?: Scopes;
	/**
	 * List of scopes for allowed clients in addition to
	 * those listed in the default scope. Finalized allowed list is
	 * the union of the default scopes and this list.
	 *
	 * If both clientRegistrationDefaultScopes and this
	 * are undefined, only scopes listed in the scopes option
	 * are allowed.
	 *
	 * @default - clientRegistrationDefaultScopes
	 */
	clientRegistrationAllowedScopes?: Scopes;
	/**
	 * Whether dynamically registered confidential clients require PKCE by default.
	 *
	 * This is server-owned registration policy. Dynamic client registration does
	 * not accept `require_pkce` from the client request, and public clients or
	 * authorization requests with `offline_access` still require PKCE unless the
	 * confidential OIDC request includes both `openid` and `nonce`.
	 *
	 * @default true
	 */
	clientRegistrationRequirePKCE?: boolean;
	/**
	 * How long a dynamically created confidential client
	 * should last for.
	 *
	 * - If a `number` is passed as an argument it is used as the claim directly.
	 * - If a `Date` instance is passed as an argument it is converted to unix timestamp and used as the
	 *   claim.
	 * - If a `string` is passed as an argument it is resolved to a time span, and then added to the
	 *   current unix timestamp and used as the claim.
	 *
	 * Format used for time span should be a number followed by a unit, such as "5 minutes" or "1
	 * day".
	 *
	 * Valid units are: "sec", "secs", "second", "seconds", "s", "minute", "minutes", "min", "mins",
	 * "m", "hour", "hours", "hr", "hrs", "h", "day", "days", "d", "week", "weeks", "w", "year",
	 * "years", "yr", "yrs", and "y". It is not possible to specify months. 365.25 days is used as an
	 * alias for a year.
	 *
	 * If the string is suffixed with "ago", or prefixed with a "-", the resulting time span gets
	 * subtracted from the current unix timestamp. A "from now" suffix can also be used for
	 * readability when adding to the current unix timestamp.
	 *
	 * @default - undefined (does not expire)
	 */
	clientRegistrationClientSecretExpiration?: number | string | Date;
	/**
	 * Returns the reference id which owns the oauth clients.
	 *
	 * For example, it can be an organization, team, etc.
	 * When provided, user_id of the client will be undefined
	 * and the owner is defined under the field `reference_id`.
	 *
	 * With the organization plugin: @example ({ session }) => {
	 * 	return session?.activeOrganizationId;
	 * }
	 */
	clientReference?: (context: {
		user?: User & Record<string, unknown>;
		session?: Session & Record<string, unknown>;
	}) => Awaitable<string | undefined>;
	/**
	 * RBAC on OAuth Clients.
	 *
	 * Provides context to help determine if a user can perform
	 * a specific action.
	 */
	clientPrivileges?: (context: {
		headers: Headers;
		action: "create" | "read" | "update" | "delete" | "list" | "rotate";
		user?: User & Record<string, unknown>;
		session?: Session & Record<string, unknown>;
	}) => Awaitable<boolean | undefined>;
	/**
	 * Authorize a redirect URI that is NOT among the client's registered URIs.
	 *
	 * Consulted in two flows, distinguished by `type`:
	 *
	 * - `"authorize"` — validates the `redirect_uri` at `/oauth2/authorize`.
	 *   Called ONLY after the built-in checks fail, i.e. the requested URI did
	 *   not exactly match any registered `redirectUris` entry and was not an
	 *   RFC 8252 loopback-IP equivalent of one. Returning `true` delivers the
	 *   authorization code to the requested URI as though it were registered.
	 *
	 * - `"logout"` — validates the `post_logout_redirect_uri` at RP-Initiated
	 *   Logout. Called ONLY after the requested URI failed to exactly match any
	 *   registered `postLogoutRedirectUris` entry. Returning `true` redirects the
	 *   user agent there (with `state` echoed) after the session ends.
	 *
	 * Use this for dynamic or ephemeral redirect targets that cannot be
	 * pre-registered — for example per-branch preview deployments whose
	 * hostnames are not known ahead of time.
	 *
	 * SECURITY: a permissive matcher is an open redirector. For `"authorize"` it
	 * additionally leaks the authorization code (an account-takeover vector), so
	 * the bar is higher there. Validate strictly for BOTH types: bind to the
	 * specific `client`, require an exact scheme and host allow-list, and never
	 * accept apex wildcards or user-controlled hosts. Branch on `type` only to
	 * make logout MORE permissive than authorize, never the reverse.
	 *
	 * @example
	 * validateRedirectURI: ({ client, redirectURI, type }) => {
	 * 	const url = new URL(redirectURI);
	 * 	if (url.protocol !== "https:") return false;
	 * 	return url.hostname.endsWith(`.${client.clientId}.preview.example.com`);
	 * }
	 */
	validateRedirectURI?: (context: {
		ctx: GenericEndpointContext;
		client: SchemaClient<Scopes>;
		redirectURI: string;
		/**
		 * Which flow is requesting validation:
		 * - `"authorize"` — the `redirect_uri` at `/oauth2/authorize`. Delivers
		 *   the authorization code, so validate most strictly.
		 * - `"logout"` — the `post_logout_redirect_uri` at RP-Initiated Logout.
		 */
		type: "authorize" | "logout";
	}) => Awaitable<boolean>;
	/**
	 * List default scopes when using the token endpoint's
	 * grant type "client_credentials". This is used
	 * only when oauthClients are stored in the database
	 * without a scope and you do not want all `scopes` to be given.
	 *
	 * @default undefined
	 */
	clientCredentialGrantDefaultScopes?: Scopes;
	/**
	 * Grant types supported by the token endpoint
	 *
	 * @default
	 * ["authorization_code", "client_credentials", "refresh_token"]
	 */
	grantTypes?: GrantType[];
	/**
	 * The URL to the login page. This is used if the client requests the `login`
	 * prompt.
	 */
	loginPage: string;
	/**
	 * A URL to the consent page where the user will be redirected if the client
	 * requests consent.
	 *
	 * After the user consents, they should be redirected by the client to the
	 * `redirect_uri` with the authorization code.
	 *
	 * When the server redirects the user to the consent page, it will include the
	 * following query parameters:
	 *
	 * - `client_id` - The ID of the client.
	 * - `scope` - The requested scopes.
	 * - `claims` - The OIDC claims request, when the client requested specific
	 *   claims. Consent pages should surface `claims.userinfo` names alongside
	 *   scopes because accepted UserInfo claims can affect the UserInfo response.
	 * - `code` - The authorization code.
	 *
	 * once the user consents, you need to call the `/oauth2/consent` endpoint
	 * with the code and `accept: true` to complete the authorization. Include a
	 * `claims` object if the user accepted only some requested UserInfo claims.
	 * The endpoint will then return the client to the `redirect_uri` with the
	 * authorization code.
	 *
	 * @example
	 * ```ts
	 * consentPage: "/consent"
	 * ```
	 */
	consentPage: string;
	/**
	 * Sign Up page settings associated with `prompt: "create"`
	 * @see https://openid.net/specs/openid-connect-prompt-create-1_0.html
	 */
	signup?: {
		/**
		 * A URL to the Sign Up page where the user will be redirected
		 * to continue a signup flow.
		 *
		 * Upon completion of signup, you need to call the `/oauth2/continue`
		 * with `created: true` to continue the login flow.
		 *
		 * @default loginPage
		 * @example `/sign-up`
		 */
		page?: string;
		/**
		 * To add registration steps, specify the page(s) to redirect to.
		 *
		 * Note: the account would need to be logged in (or selected)
		 * to specify steps.
		 *
		 * If true, user with redirect to `page`.
		 * If string, user with redirect to the page specified by string.
		 * If false, user has completed registration and will continue auth flow.
		 *
		 * @param context
		 */
		shouldRedirect?: (context: {
			headers: Headers;
			user: User & Record<string, unknown>;
			session: Session & Record<string, unknown>;
			scopes: Scopes;
		}) => Awaitable<boolean | string>;
	};
	/**
	 * Select Account page settings associated with `prompt: "select_account"`
	 */
	selectAccount?: {
		/**
		 * A URL to the account selection page where the user will be redirected if
		 * the user must select an account (eg. multi-session).
		 *
		 * Once the user selects an account, you need to call the `/oauth2/continue`
		 * with `selected: true` to continue the login flow.
		 *
		 * @default loginPage
		 */
		page?: string;
		/**
		 * Checks to see if an account needs selection
		 * for the `/oauth2/authorize` endpoint.
		 *
		 * @returns
		 * - `true`: account is not selected and needs selection
		 * - `false`: intended user or account already selected
		 */
		shouldRedirect: (context: {
			headers: Headers;
			user: User & Record<string, unknown>;
			session: Session & Record<string, unknown>;
			scopes: Scopes;
		}) => Awaitable<boolean>;
	};
	/**
	 * Post login page settings
	 */
	postLogin?: {
		/**
		 * The page `shouldRedirect` should redirect to.
		 */
		page: string;
		/**
		 * A value to tie to the consent reference_id.
		 *
		 * Note that YOU must fail in this function if the requested
		 * scope doesn't have a reference id and it should.
		 */
		consentReferenceId: (context: {
			user: User & Record<string, unknown>;
			session: Session & Record<string, unknown>;
			scopes: Scopes;
		}) => Awaitable<string | undefined>;
		/**
		 * After login and before consent, request the user to
		 * select an additional choice for `/oauth2/authorize`.
		 * For example, allow selection of an organization or team.
		 *
		 * Upon selection of a specific account, use `/oauth2/continue`
		 * with `postLogin: true` to continue the login flow.
		 *
		 * @returns
		 * - `true`: account is not selected and needs selection
		 * - `false`: intended user or account selected
		 */
		shouldRedirect: (context: {
			headers: Headers;
			user: User & Record<string, unknown>;
			session: Session & Record<string, unknown>;
			scopes: Scopes;
		}) => Awaitable<boolean>;
	};
	/**
	 * Format your refresh tokens the returned to oauth clients.
	 * For example with JWE encryption/decryption logic.
	 *
	 * If you changed the format after production deployment,
	 * ensure that the prior version can still be decoded.
	 *
	 * NOTE: `prefix.refreshToken` is internally handled,
	 * so `token` only contains the stored database token.
	 */
	formatRefreshToken?: {
		/**
		 * Custom session token format sent to client.
		 */
		encrypt: (token: string, sessionId?: string) => Awaitable<string>;
		/**
		 * Decodes the custom session token.
		 *
		 * @returns {string | undefined} sessionId - if returned,
		 * should be same as the one received in `encode`.
		 * There is an added benefit that updates to the session occur
		 * via id instead of token.
		 * @returns {string} token - should be same as the one
		 * received in `encode`
		 */
		decrypt: (
			token: string,
		) => Awaitable<{ sessionId?: string; token: string }>;
	};
	/**
	 * Store the client secret in your database in a secure way
	 * Note: This will not affect the client secret sent to the user,
	 * it will only affect the client secret stored in your database
	 *
	 * When disableJwtPlugin = false (recommended):
	 * - "hashed" - The client secret is hashed using the `hash` function.
	 * - {
	 * 	hash: (clientSecret: string) => Awaitable<string>,
	 * 	verify?: (clientSecret: string, storedHash: string) => Awaitable<boolean>
	 * } - A function that hashes the client secret.
	 *
	 * When disableJwtPlugin = true:
	 * - "encrypted" - The client secret is encrypted using the `encrypt` function.
	 * - {
	 * 	encrypt: (clientSecret: string) => Awaitable<string>,
	 * 	decrypt: (storedSecret: string) => Awaitable<string>
	 * } - A function that encrypts and decrypts the client secret.
	 *
	 * @default
	 * options.disableJwtPlugin ? "encrypted" : "hashed"
	 */
	storeClientSecret?:
		| "hashed"
		| "encrypted"
		| {
				hash: (clientSecret: string) => Awaitable<string>;
				verify?: (
					clientSecret: string,
					storedHash: string,
				) => Awaitable<boolean>;
		  }
		| {
				encrypt: (clientSecret: string) => Awaitable<string>;
				decrypt: (storedSecret: string) => Awaitable<string>;
		  };
	/**
	 * Storage method of opaque access tokens and refresh tokens on your database.
	 *
	 * - "hashed" - The client secret is hashed using the `hash` function.
	 * - {
	 * 	hash: (token: string, type: StoreTokenType) => Awaitable<string>
	 * } - A function that hashes the token
	 *
	 * @default "hashed"
	 */
	storeTokens?:
		| "hashed"
		| { hash: (token: string, type: StoreTokenType) => Awaitable<string> };
	/**
	 * Custom claims provided at the OIDC `userinfo` endpoint.
	 *
	 * @param info - context that may be useful when creating custom claims
	 * @returns Additional claims for userinfo request
	 */
	customUserInfoClaims?: (info: {
		/** The user object */
		user: User & Record<string, unknown>;
		/** The scopes from the access token used
		 * in the /userinfo request (matches jwt.scopes) */
		scopes: Scopes;
		/** The access token payload used in the /userinfo request */
		jwt: JWTPayload;
		/**
		 * Claim names explicitly requested through the OIDC `claims.userinfo`
		 * authorization request parameter.
		 */
		requestedClaims: string[];
	}) => Awaitable<Record<string, any>>;
	/**
	 * Custom claims attached to OIDC id tokens.
	 *
	 * To remain OIDC-compliant, claims should be
	 * namespaced with a URI. For example, a site
	 * example.com should namespace an organization at
	 * https://example.com/organization.
	 *
	 * Reserved ID token claim names (`iss`, `sub`, `aud`, `exp`, `nbf`, `iat`,
	 * `jti`, `nonce`, `sid`, `at_hash`, `c_hash`, `s_hash`, `auth_time`, `acr`,
	 * `amr`, `azp`) are stripped at issuance with a warning log. The
	 * authorization server owns these values.
	 *
	 * @param info - context that may be useful when creating custom claims
	 */
	customIdTokenClaims?: (info: {
		/** The user object if token is associated to a user. */
		user: User & Record<string, unknown>;
		/** Scopes granted for this token */
		scopes: Scopes;
		/** oAuthClient metadata */
		metadata?: Record<string, any>;
	}) => Awaitable<Record<string, any>>;
	/**
	 * Custom claims attached to access tokens.
	 *
	 * Claims are added for both the token and introspect endpoints.
	 *
	 * Use the user and referenceId fields to fetch
	 * for membership roles/permissions to attach for the token.
	 * Note that scopes are those that requested,
	 * permissions are what the the user can actually do which
	 * must be done in this function.
	 *
	 * @param info - context that may be useful when creating custom claims
	 */
	customAccessTokenClaims?: (info: {
		/** The user object if token is associated to a user. Null if user doesn't exist. Undefined if user not applicable. */
		user?: (User & Record<string, unknown>) | null;
		/** reference of the consent/authorization */
		referenceId?: string;
		/** Scopes granted for this token */
		scopes: Scopes;
		/** The resources requested. */
		resources?: string[];
		/** oAuthClient metadata */
		metadata?: Record<string, any>;
	}) => Awaitable<Record<string, any>>;
	/**
	 * Custom fields to include in the token response body.
	 *
	 * Unlike `customAccessTokenClaims` (which adds claims inside the JWT payload),
	 * this adds fields to the JSON response envelope alongside `access_token`,
	 * `token_type`, etc. Standard OAuth fields (`access_token`, `token_type`,
	 * `expires_in`, `expires_at`, `refresh_token`, `scope`, `id_token`) cannot
	 * be overridden.
	 *
	 * @param info - context that may be useful when creating custom fields
	 */
	customTokenResponseFields?: (info: {
		/** The grant type being processed */
		grantType: GrantType;
		/**
		 * The user, if applicable.
		 * Undefined for `client_credentials` (M2M, no user).
		 * Always present for `authorization_code` and `refresh_token`.
		 */
		user?: (User & Record<string, unknown>) | null;
		/** Scopes granted for this token */
		scopes: Scopes;
		/** oAuthClient metadata */
		metadata?: Record<string, any>;
		/**
		 * The authorization code verification value.
		 * Only present for `authorization_code` grant. Contains the original
		 * authorization request parameters (`query`), `referenceId`, `sessionId`, etc.
		 */
		verificationValue?: VerificationValue;
	}) => Awaitable<Record<string, unknown>>;
	/**
	 * Overwrite specific /.well-known/openid-configuration
	 * values so they are not available publically.
	 * This may be important if not all clients need specific scopes.
	 */
	advertisedMetadata?: {
		/**
		 * Advertised scopes_supported located at /.well-known/openid-configuration
		 *
		 * All values must be found in the scope field
		 */
		scopes_supported?: Scopes;
		/**
		 * Advertised claims_supported located at /.well-known/openid-configuration
		 *
		 * Internally supported claims:
		 * ["sub", "iss", "aud", "exp", "iat", "sid", "scope", "azp"]
		 */
		claims_supported?: string[];
	};
	/**
	 * Attach prefixes to returned token types.
	 * NOTE: The prefix is not stored in the database.
	 *
	 * Useful when also using the [API Key Plugin](../api-key/index.ts)
	 * or Secret Scanners (ie Github Secret Scanning, GitGuardian, Trufflehog).
	 *
	 * We recommend to append an underscore to make it more identifiable.
	 */
	prefix?: {
		/**
		 * Prefix on returned opaque access tokens.
		 *
		 * Additionally, we recommend you add the prefix prior to the first deployment
		 * otherwise you must utilize this with `generateOpaqueAccessToken` (storing the full
		 * encoded value on the database).
		 *
		 * @example "domain_at_"
		 * @default undefined
		 */
		opaqueAccessToken?: string;
		/**
		 * Prefix on returned refresh tokens.
		 *
		 * Additionally, we recommend you add the prefix prior to the first deployment
		 * otherwise you must utilize this with `generateRefreshToken` (storing the full
		 * encoded value on the database).
		 *
		 * @example "domain_rt_"
		 * @default undefined
		 */
		refreshToken?: string;
		/**
		 * Prefix on returned client secrets.
		 *
		 * Additionally, we recommend you add the prefix prior to the first deployment
		 * otherwise you must utilize this with `generateClientSecret` (storing the full
		 * encoded value on the database).
		 *
		 * @example "domain_cs_"
		 * @default undefined
		 */
		clientSecret?: string;
	};
	/**
	 * Custom function to generate a client ID.
	 *
	 * @default
	 * generateRandomString(32, "A-Z", "a-z")
	 */
	generateClientId?: () => string;
	/**
	 * Custom function to generate a client secret.
	 *
	 * @default
	 * generateRandomString(32, "A-Z", "a-z")
	 */
	generateClientSecret?: () => string;
	/**
	 * Generate a unique access token to save on the database.
	 *
	 * @default
	 * generateRandomString(32, "A-Z", "a-z")
	 */
	generateOpaqueAccessToken?: () => Awaitable<string>;
	/**
	 * Generate a unique refresh token to save on the database.
	 *
	 * @default
	 * generateRandomString(32, "A-Z", "a-z")
	 */
	generateRefreshToken?: () => Awaitable<string>;
	/**
	 * Confirmations that individually silences specific well-known endpoint
	 * configuration warnings.
	 *
	 * Only set these specific values if you see the error as they
	 * are configuration specific.
	 */
	silenceWarnings?: {
		/**
		 * Config warning for `/.well-known/oauth-authorization-server/[issuer-path]`
		 *
		 * @default false
		 */
		oauthAuthServerConfig?: boolean;
		/**
		 * Config warning for `[issuer-path]/.well-known/openid-configuration`
		 *
		 * @default false
		 */
		openidConfig?: boolean;
	};
	/**
	 * By default, access and id tokens can be issued and verified
	 * through the JWT plugin.
	 *
	 * You can disable the JWT requirement in which access tokens
	 * will always be opaque and id tokens are always signed
	 * with HS256 using the client secret.
	 *
	 * @default false
	 */
	disableJwtPlugin?: boolean;
	/**
	 * Rate limit configuration for OAuth endpoints.
	 *
	 * Each endpoint can be configured with a `window` (in seconds) and `max` requests.
	 * Set to `false` to disable rate limiting for a specific endpoint.
	 *
	 * @default
	 * ```ts
	 * {
	 *   token: { window: 60, max: 20 },
	 *   authorize: { window: 60, max: 30 },
	 *   introspect: { window: 60, max: 100 },
	 *   revoke: { window: 60, max: 30 },
	 *   register: { window: 60, max: 5 },
	 *   userinfo: { window: 60, max: 60 },
	 * }
	 * ```
	 */
	rateLimit?: {
		/**
		 * Rate limit for /oauth2/token endpoint
		 * @default { window: 60, max: 20 }
		 */
		token?: { window: number; max: number } | false;
		/**
		 * Rate limit for /oauth2/authorize endpoint
		 * @default { window: 60, max: 30 }
		 */
		authorize?: { window: number; max: number } | false;
		/**
		 * Rate limit for /oauth2/introspect endpoint
		 * @default { window: 60, max: 100 }
		 */
		introspect?: { window: number; max: number } | false;
		/**
		 * Rate limit for /oauth2/revoke endpoint
		 * @default { window: 60, max: 30 }
		 */
		revoke?: { window: number; max: number } | false;
		/**
		 * Rate limit for /oauth2/register endpoint
		 * @default { window: 60, max: 5 }
		 */
		register?: { window: number; max: number } | false;
		/**
		 * Rate limit for /oauth2/userinfo endpoint
		 * @default { window: 60, max: 60 }
		 */
		userinfo?: { window: number; max: number } | false;
	};
	/**
	 * Secret used to compute pairwise subject identifiers (HMAC-SHA256).
	 * When set, clients with `subject_type: "pairwise"` receive unique,
	 * unlinkable `sub` values per sector identifier.
	 *
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#PairwiseAlg
	 */
	pairwiseSecret?: string;
	/**
	 * Resolves a `request_uri` at the authorize endpoint (PAR support).
	 *
	 * When the authorize endpoint receives a `request_uri` parameter, this callback
	 * resolves it to the original authorization parameters. Return null if the URI
	 * is invalid or expired.
	 */
	requestUriResolver?: (input: {
		requestUri: string;
		clientId: string;
		ctx: GenericEndpointContext;
	}) => Promise<Record<string, string> | null>;
	/**
	 * DPoP proof validation settings.
	 *
	 * DPoP is enabled by default when a client or resource asks for DPoP-bound
	 * access tokens. These values tune proof validation without changing that
	 * contract.
	 */
	dpop?: {
		/**
		 * Accepted age of a DPoP proof JWT in seconds.
		 *
		 * @default 300
		 */
		proofMaxAgeSeconds?: number;
		/**
		 * Supported JWS algorithms for DPoP proof JWTs.
		 *
		 * @default ["EdDSA", "ES256", "ES512", "PS256", "RS256"]
		 */
		signingAlgorithms?: JWSAlgorithms[];
	};
}

export interface OAuthAuthorizationQuery {
	/**
	 * The response type.
	 * - "code": authorization code flow.
	 * Optional in the query when using request_uri (PAR) — resolved from stored params.
	 */
	// NEVER SUPPORT "token" or "id_token" - deprecated in OAuth 2.1
	response_type?: "code";
	/**
	 * OpenID Connect Request Object by value.
	 *
	 * The parameter is parsed so unsupported use can be rejected with
	 * `request_not_supported`; Better Auth does not process Request Objects yet.
	 */
	request?: string;
	/**
	 * PAR request_uri. When present, other params are resolved from the stored request.
	 */
	request_uri?: string;
	/**
	 * The redirect URI for the client. Must be one of the registered redirect URLs for the client.
	 */
	redirect_uri: string;
	/**
	 * The scope of the request. Must be a space-separated list of case sensitive strings.
	 *
	 * - "openid" is required for most requests to obtain user id (ie sub)
	 * - "profile" is required for requests that require user profile information.
	 * - "email" is required for requests that require user email information.
	 * - "offline_access" is required for requests that require a refresh token.
	 */
	scope?: string;
	/**
	 * Opaque value used to maintain state between the request and the callback. Typically,
	 * Cross-Site Request Forgery (CSRF, XSRF) mitigation is done by cryptographically binding the
	 * value of this parameter with a browser cookie.
	 *
	 * Recommended for clients, but optional for the authorization server.
	 *
	 * Note: Better Auth stores the state in a database instead of a cookie. - This is to minimize
	 * the complication with native apps and other clients that may not have access to cookies.
	 */
	state?: string;
	/**
	 * The client ID. Must be the ID of a registered client.
	 */
	client_id: string;
	/**
	 * The prompt parameter is used to specify the type of user interaction that is required.
	 */
	prompt?: AuthorizePrompt;
	/**
	 * The display parameter is used to specify how the authorization server displays the
	 * authentication and consent user interface pages to the end user.
	 */
	display?: "page" | "popup" | "touch" | "wap";
	/**
	 * End-User's preferred languages and scripts for the user interface, represented as a
	 * space-separated list of BCP47 [RFC5646] language tag values, ordered by preference. For
	 * instance, the value "fr-CA fr en" represents a preference for French as spoken in Canada,
	 * then French (without a region designation), followed by English (without a region
	 * designation).
	 *
	 * Better Auth does not support this parameter yet. It'll not throw an error if it's provided,
	 *
	 * 🏗️ currently not implemented
	 */
	ui_locales?: string;
	/**
	 * The maximum authentication age.
	 *
	 * Specifies the allowable elapsed time in seconds since the last time the End-User was
	 * actively authenticated by the provider. If the elapsed time is greater than this value, the
	 * provider MUST attempt to actively re-authenticate the End-User.
	 *
	 * Note that max_age=0 is equivalent to prompt=login.
	 */
	max_age?: number;
	/**
	 * Requested Authentication Context Class Reference values.
	 *
	 * Space-separated string that
	 * specifies the acr values that the Authorization Server is being requested to use for
	 * processing this Authentication Request, with the values appearing in order of preference.
	 * The Authentication Context Class satisfied by the authentication performed is returned as
	 * the acr Claim Value, as specified in Section 2. The acr Claim is requested as a Voluntary
	 * Claim by this parameter.
	 */
	acr_values?: string;
	/**
	 * Hint to the Authorization Server about the login identifier the End-User might use to log in
	 * (if necessary). This hint can be used by an RP if it first asks the End-User for their
	 * e-mail address (or other identifier) and then wants to pass that value as a hint to the
	 * discovered authorization service. It is RECOMMENDED that the hint value match the value used
	 * for discovery. This value MAY also be a phone number in the format specified for the
	 * phone_number Claim. The use of this parameter is left to the OP's discretion.
	 */
	login_hint?: string;
	/**
	 * ID Token previously issued by the Authorization Server being passed as a hint about the
	 * End-User's current or past authenticated session with the Client.
	 *
	 * 🏗️ currently not implemented
	 */
	id_token_hint?: string;
	/**
	 * Code challenge
	 */
	code_challenge?: string;
	/**
	 * Code challenge method used
	 */
	code_challenge_method?: "S256";
	/**
	 * String value used to associate a Client session with an ID Token, and to mitigate replay
	 * attacks. The value is passed through unmodified from the Authentication Request to the ID Token.
	 * If present in the ID Token, Clients MUST verify that the nonce Claim Value is equal to the
	 * value of the nonce parameter sent in the Authentication Request. If present in the
	 * Authentication Request, Authorization Servers MUST include a nonce Claim in the ID Token
	 * with the Claim Value being the nonce value sent in the Authentication Request.
	 */
	nonce?: string;
	/**
	 * OIDC Claims request parameter. In an authorization request it is a
	 * form-encoded JSON string; Request Object resolvers may provide the parsed
	 * object form.
	 *
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#ClaimsParameter
	 */
	claims?: string | Record<string, unknown>;
	/**
	 * RFC 9449 authorization request parameter. When present, the authorization
	 * code is bound to this JWK thumbprint and the token request must present a
	 * matching DPoP proof.
	 */
	dpop_jkt?: string;
	/**
	 * Resource parameter as specified by [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html)
	 */
	resource?: string | string[];
}

/**
 * A persisted protected-resource row as stored in `oauthResource`.
 *
 * `null` on any policy column means "inherit the plugin-level default at
 * token issuance time" — admins can later override without re-seeding.
 */
export interface OAuthResource {
	/** Auto-generated primary key */
	id: string;
	/**
	 * Business key used in the `aud` claim and as the RFC 8707 `resource` value.
	 */
	identifier: string;
	/** Human-friendly label for admin UIs */
	name: string;
	/** Access token TTL in seconds; null inherits {@link OAuthOptions.accessTokenExpiresIn} */
	accessTokenTtl?: number | null;
	/** Refresh token TTL in seconds; null inherits {@link OAuthOptions.refreshTokenExpiresIn} */
	refreshTokenTtl?: number | null;
	/** When set, overrides the JWT plugin's getLatestKey() default at signing time. */
	signingAlgorithm?: JWSAlgorithms | null;
	signingKeyId?: string | null;
	/**
	 * When non-null, requested scopes must intersect this set or the request is
	 * rejected with `invalid_scope`.
	 */
	allowedScopes?: string[] | null;
	/**
	 * Per-resource claims merged into the access token JWT payload. Reserved
	 * RFC 9068 claim names (`iss`, `sub`, `aud`, `exp`, `iat`, `jti`,
	 * `client_id`, `scope`, `auth_time`, `acr`, `amr`) are stripped at issuance
	 * with a warning log — never silently dropped.
	 */
	customClaims?: Record<string, unknown> | null;
	/**
	 * Require newly issued access tokens for this resource to be DPoP-bound.
	 */
	dpopBoundAccessTokensRequired?: boolean;
	/**
	 * Disabled → no new issuance for this resource; existing tokens still verify
	 * until natural expiry. Compare to delete, which hard-rejects existing tokens.
	 */
	disabled: boolean;
	createdAt: Date;
	updatedAt: Date;
	/**
	 * Forward-migration anchor. Lets the runtime branch behavior when claim
	 * emission or validation semantics change in a future PR without forcing
	 * every row to migrate. PR 1 ships with `policyVersion = 1`.
	 */
	policyVersion: number;
	/** Open-ended extension data — not yet promoted to columns. */
	metadata?: Record<string, unknown> | null;
}

/**
 * Plugin-config input for {@link OAuthOptions.resources}. A subset of the
 * persisted {@link OAuthResource} — only `identifier` is required; the rest
 * fall back to plugin defaults when omitted.
 */
export interface OAuthResourceInput {
	identifier: string;
	name?: string;
	accessTokenTtl?: number;
	refreshTokenTtl?: number;
	signingAlgorithm?: JWSAlgorithms;
	signingKeyId?: string;
	allowedScopes?: string[];
	customClaims?: Record<string, unknown>;
	dpopBoundAccessTokensRequired?: boolean;
	disabled?: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * A row of `oauthClientResource` linking a client to a resource.
 *
 * Authoritative only when {@link OAuthOptions.enforcePerClientResources} is true.
 */
export interface OAuthClientResource {
	clientId: string;
	resourceId: string;
	metadata?: Record<string, unknown> | null;
	createdAt: Date;
}

/**
 * The authorization request as persisted alongside a minted code. Identical to
 * {@link OAuthAuthorizationQuery} except `redirect_uri` is optional: a headless
 * authorization request (first-party-apps / device-style) carries none, and
 * RFC 6749 §4.1.3 only binds `redirect_uri` at the token endpoint when the
 * authorization request included one. Mirrors the runtime
 * `storedAuthorizationQuerySchema`.
 */
export interface StoredAuthorizationQuery
	extends Omit<OAuthAuthorizationQuery, "redirect_uri"> {
	redirect_uri?: string;
}

/**
 * Stored within the verification.value field
 * in JSON format.
 *
 * It is stored in JSON to prevent
 * direct searches by field on the db
 */
export interface VerificationValue {
	type: "authorization_code";
	query: StoredAuthorizationQuery;
	sessionId: string;
	userId: string;
	resource?: string[];
	referenceId?: string;
	authTime?: number;
}

/**
 * Client registered values as used within the plugin
 */
export interface SchemaClient<
	Scopes extends readonly Scope[] = InternallySupportedScopes[],
> {
	//---- Required ----//
	/**
	 * Client ID
	 *
	 * size 32
	 *
	 * as described on https://www.rfc-editor.org/rfc/rfc6749.html#section-2.2
	 */
	clientId: string;
	/**
	 * Client Secret
	 *
	 * A secret for the client, if required by the authorization server.
	 *
	 * size 32
	 */
	clientSecret?: string;
	/** Whether the client is disabled or not. */
	disabled?: boolean;
	/**
	 * Restricts scopes allowed for the client.
	 *
	 * If not defined, any scope can be requested.
	 */
	scopes?: Scopes;
	//---- Recommended client data ----//
	/** User who owns this client */
	userId?: string | null;
	/** Created time */
	createdAt?: Date;
	/** Last updated time */
	updatedAt?: Date;
	/** Expires time */
	expiresAt?: Date;
	//---- UI Metadata ----//
	/** The name of the client. */
	name?: string;
	/** Linkable uri of the client. */
	uri?: string;
	/** The icon of the client. */
	icon?: string;
	/** List of contacts for the client. */
	contacts?: string[];
	/** Client Terms of Service Uri */
	tos?: string;
	/** Client Privacy Policy Uri */
	policy?: string;
	//---- User Software Identifiers ----//
	softwareId?: string;
	softwareVersion?: string;
	softwareStatement?: string;
	//---- Authentication Metadata ----//
	/**
	 * List of registered redirect URLs. Must include the whole URL, including the protocol, port,
	 * and path.
	 *
	 * For example, `https://example.com/auth/callback`
	 */
	redirectUris?: string[];
	/**
	 * List of registered post-logout redirect URIs. Used for RP-Initiated Logout.
	 * Must include the whole URL, including the protocol, port, and path.
	 *
	 * For example, `https://example.com/logout/callback`
	 */
	postLogoutRedirectUris?: string[];
	/**
	 * RP URL that will receive a signed Logout Token when the end-user's OP
	 * session ends. Registering it is the per-client opt-in for back-channel
	 * logout. Must be absolute, without a fragment, and HTTPS for confidential
	 * clients.
	 *
	 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html#RPMetadata
	 */
	backchannelLogoutUri?: string;
	/**
	 * When true, the RP requires the `sid` claim in every Logout Token.
	 * User-scoped (sid-less) logouts are not dispatched to such a client.
	 *
	 * @default false
	 */
	backchannelLogoutSessionRequired?: boolean;
	tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
	grantTypes?: GrantType[];
	responseTypes?: "code"[];
	/** Client's JSON Web Key Set metadata. Mutually exclusive with `jwksUri`. */
	jwks?: string;
	/** URI for the client's JSON Web Key Set. Mutually exclusive with `jwks`. Must be HTTPS. */
	jwksUri?: string;
	//---- RFC6749 Spec ----//
	/**
	 * Indicates whether the client is public or confidential.
	 * If public, refreshing tokens doesn't require
	 * a client_secret. Clients are considered confidential by default.
	 *
	 * Uses `token_endpoint_auth_method` field or `type` field to determine
	 *
	 * Described https://www.rfc-editor.org/rfc/rfc6749.html#section-2.1
	 *
	 * @default undefined
	 */
	public?: boolean;
	/**
	 * The client type
	 *
	 * Described https://www.rfc-editor.org/rfc/rfc6749.html#section-2.1
	 *
	 * - web - A web application (confidential client)
	 * - native - A mobile application (public client)
	 * - user-agent-based - A user-agent-based application (public client)
	 */
	type?: "web" | "native" | "user-agent-based";
	/**
	 * Whether this client requires PKCE for authorization code flow.
	 *
	 * @default true
	 *
	 * Note: PKCE is always required for public clients and when
	 * requesting offline_access scope, regardless of this setting.
	 */
	requirePKCE?: boolean;
	/**
	 * RFC 9449 dynamic client metadata. When true, every token request from this
	 * client must include a valid DPoP proof and receive DPoP-bound tokens.
	 */
	dpopBoundAccessTokens?: boolean;
	//---- All other metadata ----//
	/** Used to indicate if consent screen can be skipped */
	skipConsent?: boolean;
	/** Used to enable client to logout via the `/oauth2/end-session` endpoint */
	enableEndSession?: boolean;
	/** Subject identifier type: "public" (default) or "pairwise" */
	subjectType?: "public" | "pairwise";
	/** Reference to the owner of this client. Eg. Organization, Team, Profile */
	referenceId?: string;
	/**
	 * Additional metadata about the client.
	 */
	metadata?: string; // in JSON format
}

export interface OAuthOpaqueAccessToken<
	Scopes extends readonly Scope[] = InternallySupportedScopes[],
> {
	/**
	 * The opaque access token.
	 */
	token: string;
	/**
	 * The client ID of the client that requested the access token.
	 */
	clientId: string;
	/**
	 * The session ID the access token is associated with.
	 *
	 * Not available in client credentials grant
	 * where no user session is involved.
	 */
	sessionId?: string;
	/**
	 * The user ID the access token is associated with.
	 *
	 * Not available in client credentials grant
	 * where no user is involved.
	 */
	userId?: string;
	/**
	 * Reference Id of the consent/authorization.
	 *
	 * Not available in client credentials grant
	 * where no user is involved.
	 */
	referenceId?: string;
	/**
	 * Stored authorization-code identifier that produced this token family.
	 * Used to revoke tokens after authorization-code replay is detected.
	 */
	authorizationCodeId?: string;
	/**
	 * The refresh token the access token is associated with.
	 *
	 * Not available without the "offline_access" scope
	 */
	refreshId?: string;
	/** The expiration date of the access token. */
	expiresAt: Date;
	/** The creation date of the access token. */
	createdAt: Date;
	/**
	 * When the access token was revoked. Set by session-end dispatch, the
	 * revoke endpoint, and back-channel logout. Introspection and protected
	 * endpoints MUST treat a revoked token as inactive.
	 */
	revoked?: Date | null;
	/**
	 * Scope granted for the access token.
	 *
	 * Shall match the refreshId.scopes if refreshId is provided.
	 */
	scopes: Scopes;
	/**
	 * Resources allowed for this access token.
	 */
	resources?: string[];
	/**
	 * OIDC UserInfo claim names requested by the authorization request's
	 * `claims.userinfo` object.
	 */
	requestedUserInfoClaims?: string[];
	/**
	 * RFC 7800 `cnf` confirmation that sender-constrains this access token (for
	 * example DPoP `{ jkt }`). Surfaced as the `cnf` claim at introspection.
	 */
	confirmation?: Confirmation;
}

/**
 * Refresh Token Database Schema
 */
export interface OAuthRefreshToken<
	Scopes extends readonly Scope[] = InternallySupportedScopes[],
> {
	token: string;
	sessionId?: string;
	userId: string;
	referenceId?: string;
	authorizationCodeId?: string;
	clientId?: string;
	expiresAt: Date;
	createdAt: Date;
	/**
	 * When token was revoked. If set, token is considered a replay attack.
	 */
	revoked?: Date;
	/**
	 * The time the user originally authenticated.
	 * Persisted so refreshed ID tokens can include a correct `auth_time` claim.
	 */
	authTime?: Date;
	/**
	 * Scopes granted for this refresh token.
	 *
	 * Considered Immutable once granted.
	 */
	scopes: Scopes;
	/**
	 * Resources allowed for this refresh token
	 */
	resources?: string[];
	/**
	 * OIDC UserInfo claim names requested by the authorization request's
	 * `claims.userinfo` object. Carried forward on rotation.
	 */
	requestedUserInfoClaims?: string[];
	/**
	 * RFC 7800 `cnf` confirmation that sender-constrains this refresh-token
	 * family (for example DPoP `{ jkt }`). Carried forward on rotation.
	 */
	confirmation?: Confirmation;
}

/**
 * Consent Database Schema
 */
export type OAuthConsent<
	Scopes extends readonly Scope[] = InternallySupportedScopes[],
> = {
	id: string;
	clientId: string;
	userId: string;
	resources?: string[];
	referenceId?: string;
	/**
	 * OIDC UserInfo claim names consented from the authorization request's
	 * `claims.userinfo` object.
	 */
	requestedUserInfoClaims?: string[];
	scopes: Scopes;
	createdAt: Date;
	updatedAt: Date;
};
