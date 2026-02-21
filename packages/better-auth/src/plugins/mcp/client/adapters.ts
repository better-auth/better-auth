/**
 * Framework-specific adapters for Better Auth MCP Client
 *
 * These adapters wrap `createMcpAuthClient` for specific frameworks
 * and MCP server implementations, providing idiomatic integration.
 */

import type {
	McpAuthClient,
	McpAuthClientOptions,
	McpSession,
} from "./index.js";
import { createMcpAuthClient } from "./index.js";

// ─────────────────────────────────────────────────────────────
// Hono adapter
// ─────────────────────────────────────────────────────────────

interface HonoContext {
	req: { header: (name: string) => string | undefined; raw: Request };
	set: (key: string, value: unknown) => void;
	json: (
		data: unknown,
		status?: number,
		headers?: Record<string, string>,
	) => Response;
	header: (name: string, value: string) => void;
}
type HonoNext = () => Promise<void>;
type HonoMiddleware = (
	c: HonoContext,
	next: HonoNext,
) => Promise<Response | void>;

interface HonoApp {
	get: (path: string, handler: (c: HonoContext) => Promise<Response>) => void;
}

/**
 * Hono middleware that validates MCP Bearer tokens.
 * Sets `c.get('mcpSession')` on success.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono'
 * import { mcpAuthHono } from 'better-auth/plugins/mcp/client/adapters'
 *
 * const app = new Hono()
 * const { middleware, discoveryRoutes } = mcpAuthHono({
 *   authURL: 'http://localhost:3000/api/auth'
 * })
 *
 * // Mount well-known routes
 * discoveryRoutes(app, 'http://localhost:4000')
 *
 * // Protect MCP routes
 * app.use('/mcp/*', middleware)
 * app.post('/mcp', (c) => {
 *   const session = c.get('mcpSession')
 *   // ...
 * })
 * ```
 */
export function mcpAuthHono(options: McpAuthClientOptions): {
	client: McpAuthClient;
	middleware: HonoMiddleware;
	discoveryRoutes: (app: HonoApp, serverURL: string) => void;
} {
	const client = createMcpAuthClient(options);

	const middleware: HonoMiddleware = async (c, next) => {
		const token = c.req.header("Authorization")?.replace("Bearer ", "");
		if (!token) {
			c.header(
				"WWW-Authenticate",
				`Bearer resource_metadata="${client.authURL}/.well-known/oauth-protected-resource"`,
			);
			c.header("Access-Control-Expose-Headers", "WWW-Authenticate");
			return c.json(
				{
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Unauthorized: Authentication required",
					},
					id: null,
				},
				401,
			);
		}

		const session = await client.verifyToken(token);
		if (!session) {
			c.header(
				"WWW-Authenticate",
				`Bearer resource_metadata="${client.authURL}/.well-known/oauth-protected-resource"`,
			);
			return c.json(
				{
					jsonrpc: "2.0",
					error: { code: -32000, message: "Invalid or expired token" },
					id: null,
				},
				401,
			);
		}

		c.set("mcpSession", session);
		await next();
	};

	const discoveryRoutes = (app: HonoApp, serverURL: string) => {
		const discoveryFn = client.discoveryHandler();
		const protectedResourceFn = client.protectedResourceHandler(serverURL);

		app.get(
			"/.well-known/oauth-authorization-server",
			async (c: HonoContext) => {
				const response = await discoveryFn(c.req.raw);
				const data: unknown = await response.json().catch(() => ({
					error: "Invalid response from auth server",
				}));
				return c.json(data, response.status as 200 | 502);
			},
		);

		app.get("/.well-known/oauth-protected-resource", async (c: HonoContext) => {
			const response = await protectedResourceFn(c.req.raw);
			const data: unknown = await response.json().catch(() => ({
				error: "Invalid response from auth server",
			}));
			return c.json(data, response.status as 200 | 502);
		});
	};

	return { client, middleware, discoveryRoutes };
}

// ─────────────────────────────────────────────────────────────
// Official MCP SDK adapter (@modelcontextprotocol/sdk)
// ─────────────────────────────────────────────────────────────

/**
 * Creates an auth object compatible with the official MCP SDK's
 * `StreamableHTTPServerTransport` / `SSEServerTransport`.
 *
 * The official MCP SDK expects a `verifyToken` function that is
 * called on every request. This adapter bridges that.
 *
 * @example
 * ```typescript
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
 * import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
 * import { mcpAuthOfficial } from 'better-auth/plugins/mcp/client/adapters'
 *
 * const auth = mcpAuthOfficial({
 *   authURL: 'http://localhost:3000/api/auth'
 * })
 *
 * const transport = new StreamableHTTPServerTransport({
 *   sessionIdGenerator: () => randomUUID(),
 * })
 *
 * // Protect the /mcp endpoint
 * app.post('/mcp', auth.handler(async (req, session) => {
 *   await server.connect(transport)
 *   return transport.handleRequest(req)
 * }))
 * ```
 */
export function mcpAuthOfficial(options: McpAuthClientOptions): {
	client: McpAuthClient;
	handler: McpAuthClient["handler"];
	verifyToken: McpAuthClient["verifyToken"];
} {
	const client = createMcpAuthClient(options);
	return {
		client,
		handler: client.handler,
		verifyToken: client.verifyToken,
	};
}

// ─────────────────────────────────────────────────────────────
// mcp-use adapter
// ─────────────────────────────────────────────────────────────

type OAuthMode = "direct" | "proxy";

interface McpUseUserInfo {
	userId: string;
	roles?: string[];
	permissions?: string[];
	scopes?: string;
	clientId?: string;
	[key: string]: unknown;
}

interface OAuthProvider {
	verifyToken(token: string): Promise<{ payload: Record<string, unknown> }>;
	getUserInfo(payload: Record<string, unknown>): McpUseUserInfo;
	getIssuer(): string;
	getAuthEndpoint(): string;
	getTokenEndpoint(): string;
	getScopesSupported(): string[];
	getGrantTypesSupported(): string[];
	getMode(): OAuthMode;
	getRegistrationEndpoint?(): string;
}

export interface McpUseBetterAuthConfig {
	/**
	 * Full URL to Better Auth endpoints.
	 */
	authURL: string;
	/**
	 * Custom user info extraction from token payload.
	 */
	getUserInfo?: (payload: Record<string, unknown>) => McpUseUserInfo;
}

/**
 * mcp-use OAuth provider backed by Better Auth.
 * Drop-in replacement for `oauthWorkOSProvider`, `oauthSupabaseProvider`, etc.
 *
 * Uses "direct" mode: MCP clients register with and authenticate
 * against Better Auth directly. The mcp-use server only validates
 * bearer tokens.
 *
 * @example
 * ```typescript
 * import { MCPServer } from 'mcp-use/server'
 * import { mcpAuthMcpUse } from 'better-auth/plugins/mcp/client/adapters'
 *
 * const server = new MCPServer({
 *   name: 'my-server',
 *   version: '1.0.0',
 *   oauth: mcpAuthMcpUse({
 *     authURL: 'http://localhost:3000/api/auth'
 *   })
 * })
 * ```
 */
export function mcpAuthMcpUse(config: McpUseBetterAuthConfig): OAuthProvider {
	const authURL = normalizeURL(config.authURL);

	if (!authURL) {
		throw new Error(
			"Better Auth authURL is required. " +
				"Pass authURL in config, e.g.: mcpAuthMcpUse({ authURL: 'http://localhost:3000/api/auth' })",
		);
	}

	const client = createMcpAuthClient({ authURL });

	return {
		async verifyToken(
			token: string,
		): Promise<{ payload: Record<string, unknown> }> {
			const session = await client.verifyToken(token);
			if (!session) {
				throw new Error("Invalid or expired token");
			}
			return { payload: session as unknown as Record<string, unknown> };
		},

		getUserInfo(payload: Record<string, unknown>): McpUseUserInfo {
			if (config.getUserInfo) {
				return config.getUserInfo(payload);
			}
			const scopes =
				typeof payload.scopes === "string" ? payload.scopes.split(" ") : [];
			return {
				userId: payload.userId as string,
				roles: [],
				permissions: scopes,
				scopes: payload.scopes as string | undefined,
				clientId: payload.clientId as string | undefined,
			};
		},

		getIssuer() {
			return authURL;
		},

		getAuthEndpoint() {
			return `${authURL}/mcp/authorize`;
		},

		getTokenEndpoint() {
			return `${authURL}/mcp/token`;
		},

		getScopesSupported() {
			return ["openid", "profile", "email", "offline_access"];
		},

		getGrantTypesSupported() {
			return ["authorization_code", "refresh_token"];
		},

		getMode(): OAuthMode {
			return "direct";
		},

		getRegistrationEndpoint() {
			return `${authURL}/mcp/register`;
		},
	};
}

function normalizeURL(url: string | undefined | null): string | undefined {
	if (!url || url.trim() === "") return undefined;
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

export type { McpSession, McpAuthClient, McpAuthClientOptions };
