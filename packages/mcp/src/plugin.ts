import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthOptions,
	ResourceServerMetadata,
	Scope,
} from "@better-auth/oauth-provider";
import {
	getIssuer,
	metadataResponse,
	oauthProvider,
	ResourceUriSchema,
} from "@better-auth/oauth-provider";

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
	 * The protected resource identifier (RFC 8707 / RFC 9728) that access tokens
	 * are bound to. Published as `resource` in the protected resource metadata,
	 * added to `validAudiences`, and verified as the token audience.
	 *
	 * @default the resolved base URL
	 */
	resource?: string;
}

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
	resource: string | undefined,
): ResourceServerMetadata => {
	const scopes =
		providerOptions.advertisedMetadata?.scopes_supported ??
		providerOptions.scopes ??
		[];
	const resourceScopes = scopes.filter(
		(scope) => !AUTHORIZATION_SERVER_ONLY_SCOPES.has(scope),
	);
	const metadata: ResourceServerMetadata = {
		resource: resource ?? ctx.context.baseURL,
		authorization_servers: [getIssuer(ctx, providerOptions)],
		bearer_methods_supported: ["header"],
	};
	if (resourceScopes.length) {
		metadata.scopes_supported = [...resourceScopes];
	}
	return metadata;
};

/**
 * Model Context Protocol authorization server.
 *
 * `mcp()` is the OAuth 2.1 / OIDC provider ({@link oauthProvider}) configured for
 * MCP: it enables dynamic client registration, binds issued tokens to the MCP
 * `resource`, and, as the resource server, serves the RFC 9728 protected resource
 * metadata so MCP clients discover and use it through standard OAuth discovery.
 * Because it is the OAuth provider, it cannot be combined with a separate
 * {@link oauthProvider}.
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { jwt } from "better-auth/plugins";
 * import { mcp } from "@better-auth/mcp";
 *
 * export const auth = betterAuth({
 *   plugins: [jwt(), mcp({ loginPage: "/login", consentPage: "/consent" })],
 * });
 * ```
 */
export const mcp = (options: McpOptions): ReturnType<typeof oauthProvider> => {
	const { resource, ...oauthOptions } = options;
	if (resource !== undefined) {
		// RFC 8707: reject an invalid or fragment-containing resource before it is
		// published in the protected resource metadata.
		ResourceUriSchema.parse(resource);
	}
	const provider = oauthProvider({
		// MCP clients self-register; public clients use PKCE without a secret.
		allowDynamicClientRegistration: true,
		allowUnauthenticatedClientRegistration: true,
		...oauthOptions,
		// RFC 8707: bind issued tokens to the MCP resource so the resource server
		// can validate the audience.
		validAudiences: resource
			? [...(oauthOptions.validAudiences ?? []), resource]
			: oauthOptions.validAudiences,
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
				resourcePath = new URL(resource ?? ctx.baseURL).pathname.replace(
					/\/$/,
					"",
				);
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
