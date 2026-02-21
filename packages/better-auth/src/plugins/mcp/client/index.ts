/**
 * Better Auth MCP Client
 *
 * Framework-agnostic authentication client for MCP servers.
 * Works with any HTTP framework (Express, Hono, Fastify, etc.)
 * and any MCP server implementation.
 *
 * This is the "remote" counterpart to `withMcpAuth` — instead of
 * requiring a local Better Auth instance, it talks to a Better Auth
 * server over HTTP.
 *
 * @example
 * ```typescript
 * import { createMcpAuthClient } from 'better-auth/plugins/mcp/client'
 *
 * const mcpAuth = createMcpAuthClient({
 *   authURL: 'http://localhost:3000/api/auth'
 * })
 *
 * // Protect any request handler
 * const handler = mcpAuth.handler(async (req, session) => {
 *   // session.userId, session.scopes, etc.
 *   return new Response('ok')
 * })
 * ```
 */

export interface McpAuthClientOptions {
	/**
	 * Full URL to Better Auth endpoints (baseURL + basePath).
	 *
	 * @example "http://localhost:3000/api/auth"
	 * @example "https://myapp.com/api/auth"
	 */
	authURL: string;
	/**
	 * The resource identifier for this MCP server.
	 * Used in the protected resource metadata.
	 * Defaults to the origin of the MCP server's URL.
	 */
	resource?: string;
	/**
	 * Allowed CORS origin(s). Defaults to the authURL origin.
	 * Set to `"*"` to allow all origins (not recommended for production).
	 */
	allowedOrigins?: string | string[];
	/**
	 * Custom fetch implementation. Defaults to global fetch.
	 */
	fetch?: typeof globalThis.fetch;
}

export interface McpSession {
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: string;
	refreshTokenExpiresAt: string;
	clientId: string;
	userId: string;
	scopes: string;
}

interface OAuthDiscoveryMetadata {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint?: string;
	jwks_uri?: string;
	scopes_supported?: string[];
	response_types_supported?: string[];
	grant_types_supported?: string[];
	token_endpoint_auth_methods_supported?: string[];
	code_challenge_methods_supported?: string[];
	[key: string]: unknown;
}

interface NodeLikeRequest {
	headers: Record<string, string | string[] | undefined> & {
		get?: (name: string) => string | undefined;
		authorization?: string;
	};
	get?: (name: string) => string | undefined;
	mcpSession?: McpSession;
}

interface NodeLikeResponse {
	set?: (name: string, value: string) => void;
	setHeader?: (name: string, value: string) => void;
	status?: (code: number) => { json: (body: unknown) => void };
	writeHead?: (code: number, headers: Record<string, string>) => void;
	end?: (body: string) => void;
}

export interface McpAuthClient {
	/**
	 * Verify a Bearer token against Better Auth.
	 * Returns the session if valid, null otherwise.
	 */
	verifyToken: (token: string) => Promise<McpSession | null>;

	/**
	 * Wrap a request handler with MCP authentication.
	 * Returns 401 with proper WWW-Authenticate header if unauthorized.
	 *
	 * Works with any framework that uses Web Standard Request/Response.
	 */
	handler: (
		fn: (req: Request, session: McpSession) => Response | Promise<Response>,
	) => (req: Request) => Promise<Response>;

	/**
	 * Get the OAuth discovery metadata handler.
	 * Proxies from Better Auth's `/.well-known/oauth-authorization-server`.
	 *
	 * Mount at: `GET /.well-known/oauth-authorization-server`
	 */
	discoveryHandler: () => (req: Request) => Promise<Response>;

	/**
	 * Get the protected resource metadata handler.
	 * Returns RFC 9728 metadata pointing to Better Auth.
	 *
	 * Mount at: `GET /.well-known/oauth-protected-resource`
	 */
	protectedResourceHandler: (
		serverURL: string,
	) => (req: Request) => Promise<Response>;

	/**
	 * Express/Connect-style middleware.
	 * Sets `req.mcpSession` on success, sends 401 on failure.
	 */
	middleware: () => (
		req: NodeLikeRequest,
		res: NodeLikeResponse,
		next: () => void,
	) => Promise<void>;

	/**
	 * The configured auth URL.
	 */
	authURL: string;
}

function buildCorsHeaders(
	authURL: string,
	allowedOrigins?: string | string[],
): Record<string, string> {
	let origin: string;
	if (allowedOrigins) {
		origin = Array.isArray(allowedOrigins)
			? allowedOrigins.join(", ")
			: allowedOrigins;
	} else {
		try {
			origin = new URL(authURL).origin;
		} catch {
			origin = authURL;
		}
	}
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400",
	};
}

function makeWWWAuthenticate(authURL: string, resource?: string): string {
	const resourceMetadataURL = resource
		? `${resource}/.well-known/oauth-protected-resource`
		: `${authURL}/.well-known/oauth-protected-resource`;
	return `Bearer resource_metadata="${resourceMetadataURL}"`;
}

function make401Response(authURL: string, resource?: string): Response {
	const wwwAuth = makeWWWAuthenticate(authURL, resource);
	return Response.json(
		{
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "Unauthorized: Authentication required",
				"www-authenticate": wwwAuth,
			},
			id: null,
		},
		{
			status: 401,
			headers: {
				"WWW-Authenticate": wwwAuth,
				"Access-Control-Expose-Headers": "WWW-Authenticate",
			},
		},
	);
}

function send401Node(
	res: NodeLikeResponse,
	wwwAuth: string,
	message: string,
): void {
	const body = JSON.stringify({
		jsonrpc: "2.0",
		error: { code: -32000, message },
		id: null,
	});

	if (typeof res.set === "function") {
		res.set("WWW-Authenticate", wwwAuth);
		res.set("Access-Control-Expose-Headers", "WWW-Authenticate");
		res.status?.(401).json(JSON.parse(body));
	} else if (typeof res.writeHead === "function") {
		res.writeHead(401, {
			"Content-Type": "application/json",
			"WWW-Authenticate": wwwAuth,
			"Access-Control-Expose-Headers": "WWW-Authenticate",
		});
		res.end?.(body);
	}
}

export function createMcpAuthClient(
	options: McpAuthClientOptions,
): McpAuthClient {
	const authURL = options.authURL.endsWith("/")
		? options.authURL.slice(0, -1)
		: options.authURL;
	const fetchFn = options.fetch ?? globalThis.fetch;
	const corsHeaders = buildCorsHeaders(authURL, options.allowedOrigins);

	const verifyToken = async (token: string): Promise<McpSession | null> => {
		try {
			const response = await fetchFn(`${authURL}/mcp/get-session`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				return null;
			}

			const data = await response.json();
			if (!data || !data.userId) {
				return null;
			}

			return data as McpSession;
		} catch {
			return null;
		}
	};

	const handler: McpAuthClient["handler"] = (fn) => {
		return async (req: Request) => {
			if (req.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: corsHeaders });
			}

			const authHeader = req.headers.get("Authorization");
			if (!authHeader || !authHeader.startsWith("Bearer ")) {
				return make401Response(authURL, options.resource);
			}

			const token = authHeader.slice(7);
			const session = await verifyToken(token);
			if (!session) {
				return make401Response(authURL, options.resource);
			}

			return fn(req, session);
		};
	};

	const discoveryHandler: McpAuthClient["discoveryHandler"] = () => {
		let cachedMetadata: OAuthDiscoveryMetadata | null = null;
		let cacheTime = 0;
		const CACHE_TTL = 60_000; // 1 minute

		return async (_req: Request) => {
			const now = Date.now();
			if (cachedMetadata && now - cacheTime < CACHE_TTL) {
				return Response.json(cachedMetadata, { headers: corsHeaders });
			}

			try {
				const response = await fetchFn(
					`${authURL}/.well-known/oauth-authorization-server`,
				);
				if (!response.ok) {
					return Response.json(
						{ error: "Failed to fetch discovery metadata" },
						{ status: 502, headers: corsHeaders },
					);
				}
				cachedMetadata = (await response.json()) as OAuthDiscoveryMetadata;
				cacheTime = now;
				return Response.json(cachedMetadata, { headers: corsHeaders });
			} catch {
				return Response.json(
					{ error: "Better Auth server unreachable" },
					{ status: 502, headers: corsHeaders },
				);
			}
		};
	};

	const protectedResourceHandler: McpAuthClient["protectedResourceHandler"] = (
		serverURL: string,
	) => {
		const resource = options.resource ?? new URL(serverURL).origin;
		const metadata = {
			resource,
			authorization_servers: [authURL],
			bearer_methods_supported: ["header"],
			scopes_supported: ["openid", "profile", "email", "offline_access"],
		};

		return async (_req: Request) => {
			return Response.json(metadata, { headers: corsHeaders });
		};
	};

	const middleware: McpAuthClient["middleware"] = () => {
		return async (
			req: NodeLikeRequest,
			res: NodeLikeResponse,
			next: () => void,
		) => {
			const authHeader =
				req.headers?.authorization ??
				req.headers?.get?.("Authorization") ??
				req.get?.("Authorization");

			if (!authHeader || !authHeader.startsWith("Bearer ")) {
				send401Node(
					res,
					makeWWWAuthenticate(authURL, options.resource),
					"Unauthorized: Authentication required",
				);
				return;
			}

			const token = authHeader.slice(7);
			const session = await verifyToken(token);
			if (!session) {
				send401Node(
					res,
					makeWWWAuthenticate(authURL, options.resource),
					"Invalid or expired token",
				);
				return;
			}

			req.mcpSession = session;
			next();
		};
	};

	return {
		verifyToken,
		handler,
		discoveryHandler,
		protectedResourceHandler,
		middleware,
		authURL,
	};
}
