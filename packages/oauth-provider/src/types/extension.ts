import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import type { User } from "better-auth/types";
import type { OAuthOptions, SchemaClient, Scope } from ".";

/**
 * Handler for a custom grant type registered via the extension protocol.
 */
export type GrantTypeHandler = (
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) => Promise<unknown>;

/**
 * Context provided to token claim contributors.
 */
export type TokenClaimInfo = {
	user: User & Record<string, unknown>;
	scopes: string[];
	client: SchemaClient<Scope[]>;
	referenceId?: string;
};

/**
 * Extension contract for plugins that extend oauth-provider.
 *
 * Plugins contribute to this contract via the `extensions` field:
 * ```ts
 * {
 *   id: "my-plugin",
 *   extensions: {
 *     "oauth-provider": {
 *       grantTypes: { "urn:custom:grant": myHandler },
 *       grantTypeURIs: ["urn:custom:grant"],
 *     } satisfies OAuthProviderExtension,
 *   },
 * }
 * ```
 */
export interface OAuthProviderExtension {
	/**
	 * Custom grant type handlers.
	 * Key is the full grant_type URI string.
	 */
	grantTypes?: Record<string, GrantTypeHandler>;

	/**
	 * Grant type URIs to add to the allowlist and advertise
	 * in grant_types_supported metadata.
	 */
	grantTypeURIs?: string[];

	/**
	 * Contribute fields to OAuth/OIDC discovery metadata.
	 * Called at request time in the discovery endpoint handlers.
	 *
	 * Use this for non-array fields (endpoint URLs, capability flags).
	 * Array fields like grant_types_supported are handled via
	 * grantTypeURIs and tokenEndpointAuthMethods.
	 */
	metadata?: (ctx: { baseURL: string }) => Record<string, unknown>;

	/**
	 * Contribute claims to tokens at creation time.
	 * Called per-request during token issuance, BEFORE the user's
	 * customAccessTokenClaims / customIdTokenClaims.
	 */
	tokenClaims?: {
		access?: (info: TokenClaimInfo) => Awaitable<Record<string, unknown>>;
		id?: (info: TokenClaimInfo) => Awaitable<Record<string, unknown>>;
	};

	/**
	 * Additional token endpoint authentication methods to advertise
	 * in token_endpoint_auth_methods_supported.
	 */
	tokenEndpointAuthMethods?: string[];
}
