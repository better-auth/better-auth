import type { ClientDiscovery } from "@better-auth/oauth-provider";
import { extendOAuthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { CIMD_CLIENT_DISCOVERY_ID } from "./client-store";
import { createCimdResolver } from "./resolver";
import type { CimdOptions } from "./types";
import { isCimdClientIdUrlCandidate } from "./validate-metadata-document";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		cimd: {
			creator: typeof cimd;
		};
	}
}

/**
 * Build a {@link ClientDiscovery} for Client ID Metadata Documents.
 *
 * Users who prefer explicit composition can contribute the result through
 * `oauthProvider({ extensions: [{ clientDiscovery }] })`; most users should
 * install the {@link cimd} plugin instead, which contributes this discovery
 * alongside whatever else is configured.
 */
export function createCimdClientDiscovery(
	options: CimdOptions,
): ClientDiscovery {
	const resolver = createCimdResolver(options);
	return {
		id: CIMD_CLIENT_DISCOVERY_ID,
		matches: isCimdClientIdUrlCandidate,
		resolve: resolver,
		fetchClientMetadataResource: options.fetchClientMetadataResource,
		discoveryMetadata: { client_id_metadata_document_supported: true },
	};
}

/**
 * Client ID Metadata Document plugin.
 *
 * Adds unauthenticated dynamic client discovery over HTTPS to an
 * `oauth-provider` instance. Clients identify themselves by providing
 * an HTTPS URL as their `client_id`; the plugin fetches and validates
 * the document at that URL, then creates a client record whose authentication
 * behavior is determined by `token_endpoint_auth_method`.
 *
 * See {@link https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-02 | Client ID Metadata Document draft-02}
 * and {@link https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration#client-id-metadata-documents | the MCP authorization spec}.
 */
export const cimd = (options: CimdOptions) => {
	const discovery = createCimdClientDiscovery(options);

	return {
		id: "cimd",
		version: PACKAGE_VERSION,
		init(ctx) {
			extendOAuthProvider(ctx, { clientDiscovery: discovery });
		},
	} satisfies BetterAuthPlugin;
};

export type {
	CimdClientCreatedEvent,
	CimdClientRefreshedEvent,
	CimdMetadataFetchPolicy,
	CimdMetadataProfile,
	CimdOptions,
} from "./types";
export type {
	CimdMetadataValidationOptions,
	CimdMetadataValidationResult,
} from "./validate-metadata-document";
export {
	isCimdClientIdUrlCandidate,
	validateCimdMetadata,
	validateClientIdUrl,
} from "./validate-metadata-document";
