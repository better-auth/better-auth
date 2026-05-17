import { BetterAuthError } from "@better-auth/core/error";
import type { ClientDiscovery, Scope } from "@better-auth/oauth-provider";
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
 * Users who prefer explicit composition can pass the result directly to
 * `oauthProvider({ clientDiscovery })`; most users should install the
 * {@link cimd} plugin instead, which appends this discovery to whatever
 * is already configured.
 */
export function cimdClientDiscovery(
	options: CimdOptions = {},
): ClientDiscovery<Scope[]> {
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
			const provider = ctx.getPlugin("oauth-provider");
			if (!provider) {
				throw new BetterAuthError(
					"The cimd plugin requires the oauth-provider plugin.",
				);
			}
			const existing = provider.options.clientDiscovery;
			provider.options.clientDiscovery = Array.isArray(existing)
				? [...existing, discovery]
				: existing
					? [existing, discovery]
					: discovery;
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
