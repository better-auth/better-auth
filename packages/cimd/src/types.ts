import type { GenericEndpointContext } from "@better-auth/core";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import type ipaddr from "ipaddr.js";

/**
 * Options for the Client ID Metadata Document plugin.
 *
 * @see https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/
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
	 * Metadata fields whose URL values must share the same origin as the
	 * `client_id` URL. Prevents a client from claiming URIs on a different
	 * domain.
	 *
	 * Pass an empty array to disable origin binding (not recommended for
	 * production).
	 *
	 * @default ["redirect_uris", "post_logout_redirect_uris", "client_uri"]
	 */
	originBoundFields?: string[];
	/**
	 * The set of ipaddr.js range names that are considered publicly routable
	 * and therefore allowed as `client_id` URL hosts.
	 *
	 * Any resolved IP address whose range is **not** in this set is rejected
	 * as a potential SSRF target. ipaddr.js range names include `"unicast"`,
	 * `"private"`, `"loopback"`, `"linkLocal"`, `"multicast"`, etc.
	 *
	 * Override this only if you operate an internal deployment where
	 * clients are expected to live on RFC 1918 addresses.
	 *
	 * For custom IPs and CIDR ranges, use `allowFetch`.
	 *
	 * @default new Set(["unicast"])
	 */
	allowedIpRanges?: Set<
		ReturnType<ipaddr.IPv4["range"]> | ReturnType<ipaddr.IPv6["range"]>
	>;
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
	 * Called after a client is created from a metadata document for the
	 * first time. Use this to assign trust levels, prefetch logos, or
	 * perform other post-creation processing.
	 */
	onClientCreated?: (data: {
		client: SchemaClient<Scope[]>;
		metadata: Record<string, unknown>;
		ctx: GenericEndpointContext;
	}) => void | Promise<void>;
	/**
	 * Called after a client is refreshed from a re-fetched metadata
	 * document. Use this for change-detection logging or updating derived
	 * fields.
	 */
	onClientRefreshed?: (data: {
		client: SchemaClient<Scope[]>;
		metadata: Record<string, unknown>;
		ctx: GenericEndpointContext;
	}) => void | Promise<void>;
}
