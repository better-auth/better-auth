import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import type { User } from "better-auth/types";
import type { OAuthOptions, SchemaClient, Scope } from "./index";

/**
 * A custom grant-type handler dispatched by the token endpoint when an incoming
 * `grant_type` matches a key a plugin registered via `OAuthContributions.grantTypes`.
 *
 * It receives the endpoint context and the resolved oauth-provider options and
 * returns the full token-endpoint response (the same shape the built-in grant
 * handlers produce). Use the exported `createUserTokens` helper to mint tokens;
 * it already sets the required headers.
 *
 * RFC 6749 §5.1: a token-endpoint response MUST carry `Cache-Control: no-store`
 * and `Pragma: no-cache`. When returning a response directly, set them via
 * `ctx.json(body, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } })`.
 */
export type GrantHandler = (
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) => Awaitable<Response>;

/**
 * Context passed to a token-claim contributor at minting time. A contributor
 * returns extra claims to merge into the access token or ID token.
 */
export interface TokenClaimInfo {
	/** The authenticated user, or `undefined` for client_credentials access tokens. */
	user: User | undefined;
	/** Scopes granted to the token. */
	scopes: string[];
	/** The OAuth client the token is issued to. */
	client: SchemaClient<Scope[]>;
	/** Grant reference id (e.g. a CIBA `auth_req_id`), when the grant supplies one. */
	referenceId?: string;
	/** Session id bound to the token, when available. */
	sessionId?: string;
	/** Requested resource indicators (RFC 8707), when present. */
	resources?: string[];
}

/**
 * What a plugin can contribute to the `oauth-provider` host through its
 * `contributes` field. The host collects these at init via
 * `ctx.getContributions("oauth-provider")` and wires them into the token
 * endpoint, discovery metadata, and token minting — so a plugin can add custom
 * grant types, advertise capabilities, and inject claims without the
 * oauth-provider knowing about it.
 *
 * @example
 * ```ts
 * import type { OAuthContributions } from "@better-auth/oauth-provider";
 *
 * export const ciba = () => ({
 *   id: "ciba",
 *   requires: ["oauth-provider"],
 *   contributes: {
 *     "oauth-provider": {
 *       grantTypes: { "urn:openid:params:grant-type:ciba": cibaGrantHandler },
 *       grantTypeURIs: ["urn:openid:params:grant-type:ciba"],
 *       metadata: ({ baseURL }) => ({
 *         backchannel_authentication_endpoint: `${baseURL}/oauth2/bc-authorize`,
 *       }),
 *     } satisfies OAuthContributions,
 *   },
 * });
 * ```
 */
export interface OAuthContributions {
	/**
	 * Custom grant-type handlers keyed by `grant_type` URI. The token endpoint
	 * dispatches to the handler when the request's grant_type matches and the URI
	 * is allowed. Pair every key with a `grantTypeURIs` entry.
	 */
	grantTypes?: Record<string, GrantHandler>;
	/**
	 * Grant-type URIs to add to the token-endpoint allowlist and to
	 * `grant_types_supported` in discovery.
	 */
	grantTypeURIs?: string[];
	/**
	 * Fields merged into the `.well-known` discovery documents (e.g. an endpoint
	 * or capability a profile adds).
	 */
	metadata?: (ctx: { baseURL: string }) => Record<string, unknown>;
	/**
	 * Token-endpoint client authentication methods to advertise in
	 * `token_endpoint_auth_methods_supported`.
	 */
	tokenEndpointAuthMethods?: string[];
	/**
	 * Claim contributors merged into issued tokens. Extension claims are applied
	 * first and can never override a claim the host owns. For access tokens the
	 * host owns `sub`, `aud`, `azp`, `scope`, `sid`, `iss`, `iat`, `exp`; for ID
	 * tokens it owns `auth_time`, `acr`, `at_hash`, `iss`, `sub`, `aud`, `nonce`,
	 * `iat`, `exp`, `sid`.
	 *
	 * Contributed claim keys SHOULD be namespaced (e.g. a URI or vendor prefix).
	 * Across contributors, colliding keys resolve last-writer-wins by registration
	 * order, so unprefixed keys are not safe to depend on.
	 */
	tokenClaims?: {
		access?: (info: TokenClaimInfo) => Awaitable<Record<string, unknown>>;
		id?: (info: TokenClaimInfo) => Awaitable<Record<string, unknown>>;
	};
}

declare module "@better-auth/core" {
	interface ContributionContracts {
		"oauth-provider": OAuthContributions;
	}
}
