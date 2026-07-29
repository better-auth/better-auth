import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthClientMetadata,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";

export type MetadataDocumentFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

/**
 * Options for the Client ID Metadata Document plugin.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00
 */
export interface CimdOptions {
	/**
	 * How frequently to re-fetch a client's metadata document to pick up
	 * changes from the client.
	 *
	 * Accepts a number of seconds or a duration string (e.g. `"60m"`,
	 * `"1d"`).
	 *
	 * @default "60m"
	 */
	refreshRate?: number | string;
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
	 * Redirect URIs are deliberately excluded by default: exact redirect URI
	 * matching remains mandatory at authorization time, while native and
	 * distributed clients commonly use a redirect origin different from their
	 * metadata-document origin.
	 *
	 * @default ["post_logout_redirect_uris", "client_uri"]
	 */
	originBoundFields?: readonly string[];
	/**
	 * Permit loopback `client_id` URLs (`localhost`, `127.0.0.0/8`, `::1`,
	 * `*.localhost`), including plain HTTP, so an auth server can fetch a
	 * metadata document hosted on the same machine. Off by default; enable
	 * only for local development.
	 *
	 * @default false
	 */
	allowLoopback?: boolean;
	/**
	 * Pre-fetch gate called before a metadata document is requested. Return
	 * `false` to reject the `client_id` URL.
	 *
	 * Use this for origin allowlists, per-host rate limiting, or integrating
	 * with an external trust service. Hostname-based DNS defenses (beyond
	 * the built-in IP-literal check) belong here, since the plugin is
	 * runtime-agnostic and does not perform DNS resolution.
	 *
	 * @default always allow
	 */
	allowFetch?: (
		url: string,
		ctx: GenericEndpointContext,
	) => boolean | Promise<boolean>;
	/**
	 * Fetch implementation used for metadata-document requests.
	 *
	 * Supply this when HTTPS metadata origins are routed through an in-process
	 * test harness or a runtime-specific network boundary.
	 *
	 * @default globalThis.fetch
	 */
	fetchMetadataDocument?: MetadataDocumentFetch;
	/**
	 * Called after a client is created from a metadata document for the
	 * first time. Use this to assign trust levels, prefetch logos, or
	 * perform other post-creation processing.
	 *
	 * This is a best-effort notification. A rejected callback is logged and
	 * does not roll back an otherwise valid registration.
	 */
	onClientCreated?: (data: {
		client: SchemaClient<Scope[]>;
		metadata: OAuthClientMetadata;
		ctx: GenericEndpointContext;
	}) => void | Promise<void>;
	/**
	 * Called after a client is refreshed from a re-fetched metadata
	 * document. Use this for change-detection logging or updating derived
	 * fields.
	 *
	 * This is a best-effort notification. A rejected callback is logged and
	 * does not roll back an otherwise valid refresh.
	 */
	onClientRefreshed?: (data: {
		client: SchemaClient<Scope[]>;
		metadata: OAuthClientMetadata;
		ctx: GenericEndpointContext;
	}) => void | Promise<void>;
}
