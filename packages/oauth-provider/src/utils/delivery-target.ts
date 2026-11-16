import { classifyResolvedHost } from "@better-auth/core/oauth2/internal";
import { classifyHost } from "@better-auth/core/utils/host";

const PRIVATE_HOST_REJECTION = "points to a private or reserved address";

/**
 * Check run immediately before the server POSTs to a URL a client registered,
 * such as a back-channel notification endpoint. Returns why the target must be
 * skipped, or `null` when delivery may proceed.
 *
 * Registration only classifies the host as written, so a public-looking name
 * whose DNS record points at a loopback, private, link-local (including cloud
 * metadata), or other special-purpose address passes it. This checks the
 * stored value again and classifies every address the host name resolves to
 * (CIMD draft-03 section 10.7). A failed lookup rejects the target instead of
 * letting `fetch` retry it, because a name server could fail the first query
 * and answer the second with an internal address.
 *
 * Pass the signal that bounds the delivery and reuse it for the `fetch`, so
 * the lookup and the request share one deadline.
 *
 * Set `skipResolution` for a target the operator vouches for, such as an
 * origin listed in `trustedOrigins`, so a name that resolves to a private
 * address on an internal network still receives the request. Only the lookup
 * is skipped. The host as written is still classified, so a loopback or
 * private IP literal and a name such as `localhost` stay rejected.
 *
 * Residual risk: the global `fetch` cannot be pinned to the checked address,
 * so it resolves the host again and an answer that changes between the two
 * lookups is still possible. On runtimes without a working `node:dns` lookup,
 * only the hostname check applies.
 *
 * Use this for every server-side delivery to a URL a client registered, such
 * as back-channel logout, instead of a second copy of the rule.
 */
export async function getDeliveryTargetRejection(
	uri: string,
	signal: AbortSignal,
	options: { skipResolution?: boolean } = {},
): Promise<string | null> {
	let hostname: string;
	try {
		hostname = new URL(uri).hostname;
	} catch {
		return "is not a valid URL";
	}
	if (options.skipResolution) {
		return classifyHost(hostname).kind === "public"
			? null
			: PRIVATE_HOST_REJECTION;
	}
	const result = await classifyResolvedHost(hostname, { signal });
	switch (result.status) {
		case "public":
		case "no-resolver":
			return null;
		case "non-public":
			return result.address
				? `resolves to a non-public address (${result.address})`
				: PRIVATE_HOST_REJECTION;
		case "unresolved":
			return "could not be resolved";
	}
}
