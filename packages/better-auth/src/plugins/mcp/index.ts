import { createAuthEndpoint } from "..";
import { getOidcPlugin } from "../oidc-provider";
import { getJwtPlugin, JwtPluginOptions } from "../jwt";
import type { AuthContext, BetterAuthPlugin } from "../../types";
import type { OIDCMetadata, OIDCOptions } from "../oidc-provider";
import { schema } from "../oidc-provider/schema";
import { BetterAuthError } from "../../error";
import {
	MCPResourceMetadata,
	MCPOptions,
	AuthServerMetadata,
	McpUnauthenticatedError,
} from "./types";
import { authServerMetadata } from "./metadata";
import { oidcMetadata } from "../oidc-provider/metadata";
import { Awaitable } from "../../types/helper";
import { createLocalJWKSet, JSONWebKeySet, JWTPayload, jwtVerify } from "jose";

export const getMcpPlugin = (
	ctx: AuthContext,
): Omit<BetterAuthPlugin, "options"> & { options: MCPOptions } => {
	const plugin = ctx.options.plugins?.find(
		(
			plugin,
		): plugin is Omit<BetterAuthPlugin, "options"> & { options: MCPOptions } =>
			plugin.id === "mcp",
	);

	if (!plugin) {
		throw new BetterAuthError("mcp_config", "mcp plugin not found");
	}

	return plugin;
};

export const mcp = (options?: MCPOptions) => {
	const opts = options;

	return {
		id: "mcp",
		init: (ctx) => {
			// Add the oidc plugin options to ctx
			const plugin = ctx.options.plugins?.find((plugin) => plugin.id === "mcp");
			if (!plugin) {
				throw Error("Plugin should have been registered! Should never hit!");
			}
			plugin.options = opts;

			// Check for oidc plugin registration
			getOidcPlugin(ctx);
		},
		endpoints: {
			getMcpOAuthConfig: createAuthEndpoint(
				"/.well-known/oauth-authorization-server",
				{
					method: "GET",
					metadata: {
						client: false,
					},
				},
				async (ctx) => {
					const scopes = opts?.resourceServer?.scopes_supported;
					let metadata: OIDCMetadata | AuthServerMetadata;
					const scopes_supported = opts?.resourceServer?.scopes_supported;
					if (scopes?.includes("openid")) {
						const oidcPluginOptions: OIDCOptions & { claims?: string[] } =
							getOidcPlugin(ctx.context).options;
						metadata = oidcMetadata(ctx, {
							...oidcPluginOptions,
							advertisedMetadata: scopes_supported && {
								claims_supported:
									oidcPluginOptions.advertisedMetadata?.claims_supported ??
									oidcPluginOptions.claims ??
									[],
								scopes_supported,
							},
						});
					} else {
						const jwtPluginOptions = getJwtPlugin(ctx.context).options;
						metadata = authServerMetadata(
							ctx,
							jwtPluginOptions,
							scopes_supported,
						);
					}
					return ctx.json(metadata);
				},
			),
		},
		schema,
	} satisfies BetterAuthPlugin;
};

/**
 * A generalized function that will work for
 * most platforms to check for an access token's
 * validity.
 */
export const checkMcp = async <
	Auth extends {
		options: {
			baseURL?: string;
			plugins?: BetterAuthPlugin[];
		};
		api?: {
			getJwks: () => Promise<JSONWebKeySet>;
		};
	},
>({
	auth,
	accessToken,
	baseUrl,
	path,
}: {
	auth: Auth;
	accessToken?: string;
	baseUrl: string;
	path?: string;
}) => {
	if (accessToken?.startsWith("Bearer ")) accessToken?.replace("Bearer ", "");
	if (!accessToken?.length) {
		throw new McpUnauthenticatedError(baseUrl, path);
	}
	const jwtPluginOptions = auth?.options?.plugins?.find(
		(
			plugin,
		): plugin is Omit<BetterAuthPlugin, "options"> & {
			options: JwtPluginOptions;
		} => plugin.id === "jwt",
	)?.options;
	let jwksResult: JSONWebKeySet | undefined;
	try {
		jwksResult = jwtPluginOptions?.jwks?.remoteUrl
			? await fetch(jwtPluginOptions.jwks.remoteUrl, {
					headers: {
						Accept: "application/json",
					},
				}).then(async (res) => {
					if (!res.ok) throw new Error(`Jwks error: status ${res.status}`);
					return (await res.json()) as JSONWebKeySet | undefined;
				})
			: await auth.api?.getJwks();
	} catch (error) {
		if (error instanceof Error) throw error;
		throw new Error("Unable to fetch jwks");
	}
	if (!jwksResult) throw new Error("No jwks found");
	const jwks = createLocalJWKSet(jwksResult);
	try {
		const jwt = await jwtVerify(accessToken, jwks, {
			audience: jwtPluginOptions?.jwt?.audience ?? auth.options.baseURL,
			issuer: jwtPluginOptions?.jwt?.issuer ?? auth.options.baseURL,
			typ: "JWT",
		});
		return {
			jwt: jwt.payload,
			jwt_raw: accessToken,
		};
	} catch {
		throw new McpUnauthenticatedError(baseUrl, path);
	}
};

/**
 * Checks and adds the www-authenticate header to
 * unauthenticated responses.
 *
 * Passes through authenticated tokens.
 * Jwt payload was verified could be found
 * at req.context.jwt
 */
export const withMcpAuth = <
	Auth extends {
		options: {
			plugins?: BetterAuthPlugin[];
		};
		api?: {
			getJwks: () => Promise<JSONWebKeySet>;
		};
	},
	Request extends {
		readonly url: string;
		readonly headers: Headers;
		context?: {
			jwt?: JWTPayload;
			jwt_raw?: string;
		};
	},
>(
	auth: Auth,
	handler: (req: Request) => Awaitable<Response>,
) => {
	return async (req: Request) => {
		const url = new URL(req.url);
		const baseUrl =
			url.protocol + "//" + url.hostname + (url.port ? ":" + url.port : "");
		let path = url.pathname;
		if (path.endsWith("/")) path = path.slice(0, -1);

		const accessToken = req.headers
			?.get("Authorization")
			?.replace("Bearer ", "");
		try {
			const tokens = await checkMcp({
				auth,
				accessToken,
				baseUrl,
				path,
			});
			if (!req.context) req.context = {};
			req.context.jwt = tokens.jwt;
			req.context.jwt_raw = tokens.jwt_raw;
		} catch (error) {
			handleMcpErrors(error);
		}
		return handler(req);
	};
};

/**
 * Creates a discovery endpoint on an MCP
 * resource server about its MCP auth server.
 */
export const oAuthDiscoveryMetadata = <
	Auth extends {
		options: {
			baseURL?: string;
			plugins?: BetterAuthPlugin[];
		};
	},
>(
	auth: Auth,
	metadata?: MCPResourceMetadata,
) => {
	return async (req: Request) => {
		const mcpMetadata =
			metadata ??
			auth?.options?.plugins?.find(
				(
					plugin,
				): plugin is Omit<BetterAuthPlugin, "options"> & {
					options: MCPOptions;
				} => plugin.id === "mcp",
			)?.options.resourceServer;
		if (!mcpMetadata) {
			return new Response(
				JSON.stringify({
					message: "endpoint missing metadata",
				}),
				{
					status: 400,
				},
			);
		}

		// Check authorization_servers
		let authorization_servers = mcpMetadata.authorization_servers;
		if (!authorization_servers) {
			const baseUrl = auth.options.baseURL;
			authorization_servers = [
				`${baseUrl}/.well-known/oauth-authorization-server`,
			];
		}
		if (!authorization_servers.length) {
			return new Response(
				JSON.stringify({
					message: "at least one authorization server is required",
				}),
				{
					status: 400,
				},
			);
		}

		const mcpOverridesMetadata: MCPResourceMetadata = {
			...mcpMetadata,
			authorization_servers,
		};
		return new Response(JSON.stringify(mcpOverridesMetadata), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				// We should cache here because it is unlikely this will
				// change frequently and if it does shouldn't be more than
				// for 15 seconds in a change period
				"Cache-Control":
					"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400", // 15 sec
			},
		});
	};
};

export function handleMcpErrors(error: unknown) {
	if (error instanceof McpUnauthenticatedError) {
		return new Response(null, {
			status: 401,
			headers: {
				"www-authenticate": error.message,
			},
		});
	} else if (error instanceof Error) {
		throw error;
	} else {
		throw new Error(error as unknown as string);
	}
}

export type * from "./types";
export { McpUnauthenticatedError } from "./types";
