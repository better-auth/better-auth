import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthOptions,
	OAuthResourceInput,
	ResourceServerMetadata,
	Scope,
} from "@better-auth/oauth-provider";
import {
	getIssuer,
	metadataResponse,
	oauthProvider,
} from "@better-auth/oauth-provider";
import { DPOP_SIGNING_ALGORITHMS } from "better-auth/oauth2";
import { validateMcpResource } from "./handler";

const PROTECTED_RESOURCE_METADATA_PATH =
	"/.well-known/oauth-protected-resource";
const AUTHORIZATION_SERVER_ONLY_SCOPES = new Set([
	"openid",
	"profile",
	"email",
	"phone",
	"address",
	"offline_access",
]);

/**
 * Options for the {@link mcp} plugin: the full OAuth provider configuration plus
 * the MCP resource identifier.
 */
export interface McpOptions extends OAuthOptions<Scope[]> {
	/**
	 * Seconds that a rotated refresh token can be reused to receive the same
	 * token response for the same effective scopes, requested resources, and
	 * sender constraint.
	 *
	 * OAuth Provider remains strict by default. MCP overrides that default for
	 * every client configured through this plugin so a retried refresh can
	 * recover the response produced by an earlier request. Set to `0` to disable
	 * the overlap window and keep strict replay handling.
	 *
	 * @default 30
	 */
	refreshTokenReuseInterval?: OAuthOptions<
		Scope[]
	>["refreshTokenReuseInterval"];
	/**
	 * The canonical protected resource identifier (RFC 8707 / RFC 9728) for this
	 * MCP server. Issued tokens are audience-bound to it, and it is published as
	 * `resource` in the protected resource metadata, added to `resources`, and
	 * used as the expected token audience.
	 *
	 * Must be an HTTPS URL with no query, fragment, or credentials. HTTP is
	 * accepted only on loopback hosts for local development.
	 */
	resource: string;
}

const resourceIdentifier = (resource: string | OAuthResourceInput): string =>
	typeof resource === "string" ? resource : resource.identifier;

const appendProtectedResource = (
	resources: Array<string | OAuthResourceInput> | undefined,
	resource: string,
): Array<string | OAuthResourceInput> => {
	const configuredResources = resources ?? [];
	if (
		configuredResources.some(
			(configuredResource) =>
				resourceIdentifier(configuredResource) === resource,
		)
	) {
		return configuredResources;
	}
	return [...configuredResources, resource];
};

const appendResourceIdentifier = (
	resources: readonly string[] | undefined,
	resource: string,
): readonly string[] =>
	resources?.includes(resource) ? resources : [...(resources ?? []), resource];

/**
 * Build the RFC 9728 Protected Resource Metadata document. The MCP server is the
 * resource server, and its authorization server is this same provider, so
 * `authorization_servers` reuses the provider issuer. Resource metadata only
 * advertises scopes that apply to the protected resource itself; OIDC identity
 * scopes and refresh-token scopes stay authorization-server metadata.
 */
const buildResourceServerMetadata = (
	ctx: GenericEndpointContext,
	providerOptions: OAuthOptions<Scope[]>,
	resource: string,
): ResourceServerMetadata => {
	const scopes =
		providerOptions.advertisedMetadata?.scopes_supported ??
		providerOptions.scopes ??
		[];
	const resourceScopes = scopes.filter(
		(scope) => !AUTHORIZATION_SERVER_ONLY_SCOPES.has(scope),
	);
	const configuredResource = providerOptions.resources?.find(
		(configuredResource) => resourceIdentifier(configuredResource) === resource,
	);
	const dpopBoundAccessTokensRequired =
		typeof configuredResource === "object" &&
		configuredResource.dpopBoundAccessTokensRequired === true;
	const metadata: ResourceServerMetadata = {
		resource,
		authorization_servers: [getIssuer(ctx, providerOptions)],
		bearer_methods_supported: ["header"],
		dpop_signing_alg_values_supported: [
			...(providerOptions.dpop?.signingAlgorithms ?? DPOP_SIGNING_ALGORITHMS),
		],
	};
	if (dpopBoundAccessTokensRequired) {
		metadata.dpop_bound_access_tokens_required = true;
	}
	if (resourceScopes.length) {
		metadata.scopes_supported = [...resourceScopes];
	}
	return metadata;
};

/**
 * Model Context Protocol authorization server.
 *
 * `mcp()` is the OAuth 2.1 / OIDC provider ({@link oauthProvider}) configured for
 * MCP: it binds issued tokens to the MCP `resource`, links that resource to
 * newly registered clients, and, as the resource server, serves the RFC 9728
 * protected resource metadata so MCP clients discover and use it through
 * standard OAuth discovery. Client registration is opt-in: compose with
 * `cimd()` for Client ID Metadata Documents, or explicitly enable the OAuth
 * Provider dynamic-registration options.
 * It also defaults `refreshTokenReuseInterval` to 30 seconds for all MCP
 * clients, allowing a retried refresh to recover a rotated response. OAuth
 * Provider remains strict by default; set the MCP option to `0` to disable the
 * overlap window.
 * MCP 2026-07-28 pins Client ID Metadata Documents draft-00. Configure the
 * CIMD plugin with `metadataProfile: "mcp-2026-07-28"` and an application-owned
 * metadata-resource transport.
 * Because it is the OAuth provider, it cannot be combined with a separate
 * {@link oauthProvider}.
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { jwt } from "better-auth/plugins";
 * import { cimd } from "@better-auth/cimd";
 * import { mcp } from "@better-auth/mcp";
 * import { fetchClientMetadataResource } from "./oauth-network";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     jwt(),
 *     mcp({
 *       loginPage: "/login",
 *       consentPage: "/consent",
 *       resource: "https://api.example.com/mcp",
 *     }),
 *     cimd({
 *       fetchClientMetadataResource,
 *       metadataProfile: "mcp-2026-07-28",
 *     }),
 *   ],
 * });
 * ```
 */
export const mcp = (options: McpOptions): ReturnType<typeof oauthProvider> => {
	const {
		resource: configuredResource,
		refreshTokenReuseInterval = 30,
		...oauthOptions
	} = options;
	const resource = validateMcpResource(configuredResource);
	const provider = oauthProvider({
		refreshTokenReuseInterval,
		...oauthOptions,
		// RFC 8707: bind issued tokens to the MCP resource so the resource server
		// can verify the token audience against its protected resource identifier.
		resources: appendProtectedResource(oauthOptions.resources, resource),
		clientRegistrationDefaultResources: appendResourceIdentifier(
			oauthOptions.clientRegistrationDefaultResources,
			resource,
		),
	});

	// The MCP server is the OAuth resource server, so it serves the RFC 9728
	// protected resource metadata. The provider's discovery hook runs first
	// (authorization-server and OpenID metadata); this serves the protected
	// resource document at the well-known root and the resource-path-inserted
	// alias, on the paths the provider leaves unhandled.
	const serveProviderDiscovery = provider.onRequest;
	return {
		...provider,
		onRequest: async (request, ctx) => {
			const handledByProvider = await serveProviderDiscovery?.(request, ctx);
			if (handledByProvider) {
				return handledByProvider;
			}

			const pathname = new URL(request.url).pathname;
			const requestPath = ctx.options.advanced?.skipTrailingSlashes
				? pathname.replace(/\/+$/, "") || "/"
				: pathname;
			let resourcePath = "";
			try {
				resourcePath = new URL(resource).pathname.replace(/\/$/, "");
			} catch {
				resourcePath = "";
			}
			const servedPaths = new Set([
				PROTECTED_RESOURCE_METADATA_PATH,
				`${PROTECTED_RESOURCE_METADATA_PATH}${resourcePath}`,
			]);
			if (!servedPaths.has(requestPath)) {
				return;
			}
			if (request.method !== "GET" && request.method !== "HEAD") {
				return {
					response: new Response(null, {
						status: 405,
						headers: { Allow: "GET, HEAD" },
					}),
				};
			}
			const response = metadataResponse(
				buildResourceServerMetadata(
					{ context: ctx } as GenericEndpointContext,
					oauthOptions,
					resource,
				),
			);
			if (request.method === "HEAD") {
				return {
					response: new Response(null, {
						status: response.status,
						headers: response.headers,
					}),
				};
			}
			return { response };
		},
	};
};
