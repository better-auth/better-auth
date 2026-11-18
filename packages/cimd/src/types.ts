import type { GenericEndpointContext } from "@better-auth/core";
import type {
	ClientMetadataResourceFetch,
	OAuthClientMetadata,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";

export type CimdMetadataProfile = "mcp-2026-07-28";

export interface CimdClientCreatedEvent {
	/** Newly persisted discovery-owned OAuth client. */
	client: SchemaClient<Scope[]>;
	/** Validated Client ID Metadata Document that produced the client. */
	clientMetadataDocument: OAuthClientMetadata;
	/** Better Auth endpoint context for the discovery request. */
	context: GenericEndpointContext;
}

export interface CimdClientRefreshedEvent {
	/** Discovery-owned OAuth client after metadata reconciliation. */
	client: SchemaClient<Scope[]>;
	/** Client state captured before metadata reconciliation. */
	previousClient: SchemaClient<Scope[]>;
	/** Validated Client ID Metadata Document used for reconciliation. */
	clientMetadataDocument: OAuthClientMetadata;
	/** Better Auth endpoint context for the discovery request. */
	context: GenericEndpointContext;
}

export interface CimdMetadataFetchPolicy {
	/**
	 * Minimum time before retrying a failed metadata fetch for one exact client
	 * ID. Successful fetches are governed by HTTP freshness and the origin/global
	 * fetch budgets. Numeric values are seconds. Set to `0` to disable failed-fetch
	 * pacing.
	 *
	 * @default 1
	 */
	minimumFetchInterval?: number | string;
	/**
	 * Maximum metadata fetches in flight across the plugin instance.
	 *
	 * @default 16
	 */
	maximumConcurrentFetches?: number;
	/**
	 * Maximum metadata fetches in flight for one URL origin.
	 *
	 * @default 4
	 */
	maximumConcurrentFetchesPerOrigin?: number;
	/**
	 * Maximum fetch starts in a rolling 60-second window across the
	 * plugin instance.
	 *
	 * @default 120
	 */
	maximumFetchesPerMinute?: number;
	/**
	 * Maximum fetch starts in a rolling 60-second window for one URL
	 * origin.
	 *
	 * @default 30
	 */
	maximumFetchesPerOriginPerMinute?: number;
}

/**
 * Options for the Client ID Metadata Document plugin.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-02
 */
export interface CimdOptions {
	/**
	 * Fetch transport for metadata documents and discovery-owned metadata
	 * resources such as `jwks_uri`.
	 *
	 * The transport MUST resolve the hostname exactly once, reject RFC 6890
	 * special-use addresses, pin the approved address for the connection, and
	 * refuse redirects. Those guarantees cannot be implemented by wrapping the
	 * standard Fetch API after DNS resolution, so the application must provide
	 * them at its runtime-specific network boundary.
	 */
	fetchClientMetadataResource: ClientMetadataResourceFetch;
	/**
	 * Apply an additional protocol profile to otherwise generic draft-02
	 * metadata validation.
	 *
	 * The MCP 2026-07-28 profile requires `client_name` and `redirect_uris`
	 * because that MCP revision normatively pins CIMD draft-00.
	 */
	metadataProfile?: CimdMetadataProfile;
	/**
	 * Maximum and fallback cache freshness lifetime for a client's metadata
	 * document. An expired entry is revalidated on the next client resolution;
	 * the plugin does not perform periodic or background fetches.
	 *
	 * Accepts a number of seconds or a duration string (e.g. `"60m"`,
	 * `"1d"`).
	 *
	 * @default "60m"
	 */
	metadataRevalidationInterval?: number | string;
	/**
	 * Bounded request-amplification policy for metadata document fetches.
	 *
	 * A permitted fetch consumes its concurrency and rolling-window budget when
	 * it starts. Same-client concurrent resolutions coalesce, while fresh-cache
	 * hits consume no budget. Limits reject immediately rather than queueing.
	 */
	metadataFetchPolicy?: CimdMetadataFetchPolicy;
	/**
	 * Maximum number of validated metadata documents retained by this plugin
	 * instance. The least-recently-used entry is evicted when the bound is
	 * reached.
	 *
	 * @default 1000
	 */
	maxCacheEntries?: number;
	/**
	 * Metadata fields whose URL values must share the same origin as the
	 * `client_id` URL. Prevents a client from claiming URIs on a different
	 * domain.
	 *
	 * Pass an empty array to disable origin binding (not recommended for
	 * production).
	 *
	 * Only `post_logout_redirect_uris` is origin-bound by default.
	 * `redirect_uris` is excluded because exact redirect URI matching remains
	 * mandatory at authorization time. The informative URIs `client_uri`,
	 * `logo_uri`, `tos_uri`, and `policy_uri` are never origin-bound by
	 * default; they must still be credential-free HTTP(S) URLs on a public
	 * host. CIMD draft-03 §4.4 forbids requiring `client_uri` to share an
	 * origin with `client_id` or `redirect_uris`, so listing `client_uri` here
	 * is the operator's own policy and contradicts the draft.
	 *
	 * @default ["post_logout_redirect_uris"]
	 */
	originBoundFields?: readonly string[];
	/**
	 * Pre-fetch gate called before a metadata document is requested. Return
	 * `false` to reject the `client_id` URL.
	 *
	 * Use this for origin allowlists, per-host rate limiting, or integrating
	 * with an external trust service. It is application policy, not a
	 * substitute for the required transport's resolve-once and connection-
	 * pinning guarantees; resolving here would introduce a TOCTOU boundary.
	 *
	 * @default always allow
	 */
	isMetadataDocumentUrlAllowed?: (
		clientIdUrl: string,
		context: GenericEndpointContext,
	) => boolean | Promise<boolean>;
	/**
	 * Allows a client's `jwks_uri` on an origin that is neither a trusted
	 * origin nor the `client_id` URL's origin. Return `true` to allow it.
	 *
	 * By default such a `jwks_uri` is rejected. This is consulted only for
	 * that case, when the document is registered or refreshed and before each
	 * client assertion is verified. `false`, a throw, or a rejection keeps the
	 * rejection. HTTPS, public-host, credential, and fragment checks still
	 * apply first, and the keys are fetched through
	 * `fetchClientMetadataResource`.
	 *
	 * `jwks_uri` fetches are not gated by `isMetadataDocumentUrlAllowed` or
	 * `metadataFetchPolicy`, so the origin rule is what bounds where a
	 * document can make the server send requests. Match the client and key
	 * origins together rather than allowing a key origin for every client.
	 *
	 * @default always reject
	 */
	isCrossOriginJwksUriAllowed?: (
		input: { clientId: string; jwksUri: string },
		context: GenericEndpointContext,
	) => boolean | Promise<boolean>;
	/**
	 * Called after a client is created from a metadata document for the
	 * first time. Use this to assign local trust, emit an audit event, or
	 * perform other post-creation processing. Better Auth does not fetch or
	 * render metadata-owned remote assets such as `logo_uri`.
	 *
	 * This is a best-effort notification. A rejected callback is logged and
	 * does not roll back an otherwise valid registration.
	 */
	onClientCreated?: (event: CimdClientCreatedEvent) => void | Promise<void>;
	/**
	 * Called after a client is refreshed from a re-fetched metadata
	 * document. Use this for change-detection logging or updating derived
	 * fields.
	 *
	 * This is a best-effort notification. A rejected callback is logged and
	 * does not roll back an otherwise valid refresh.
	 */
	onClientRefreshed?: (event: CimdClientRefreshedEvent) => void | Promise<void>;
}
