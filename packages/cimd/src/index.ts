import type { ClientDiscovery } from "@better-auth/oauth-provider";
import { extendOAuthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { createCimdResolver } from "./resolver";
import type { CimdOptions } from "./types";
import { isUrlClientId } from "./validate-metadata-document";
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
export function cimdClientDiscovery(
	options: CimdOptions = {},
): ClientDiscovery {
	const resolver = createCimdResolver(options);
	return {
		id: "cimd",
		matches: isUrlClientId,
		resolve: resolver,
		discoveryMetadata: { client_id_metadata_document_supported: true },
	};
}

/**
 * Client ID Metadata Document plugin.
 *
 * Adds unauthenticated dynamic client discovery over HTTPS to an
 * `oauth-provider` instance. Clients identify themselves by providing
 * an HTTPS URL as their `client_id`; the plugin fetches and validates
 * the document at that URL, then creates a public client record.
 *
 * See {@link https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/ | the IETF draft}
 * and {@link https://modelcontextprotocol.io/specification/draft/basic/authorization#client-id-metadata-documents-flow | the MCP authorization spec}.
 */
export const cimd = (options: CimdOptions = {}) => {
	const discovery = cimdClientDiscovery(options);

	return {
		id: "cimd",
		version: PACKAGE_VERSION,
		init(ctx) {
			extendOAuthProvider(ctx, { clientDiscovery: discovery });
		},
	} satisfies BetterAuthPlugin;
};

export { createCimdResolver } from "./resolver";
export type { CimdOptions } from "./types";
export type { ClientIdMetadataDocumentResult } from "./validate-metadata-document";
export {
	isLocalhost,
	isUrlClientId,
	validateCimdMetadata,
	validateClientIdUrl,
} from "./validate-metadata-document";
