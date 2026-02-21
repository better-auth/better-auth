export interface McpAuthClientOptions {
	authURL: string;
	resource?: string;
	allowedOrigin?: string;
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
	verifyToken: (token: string) => Promise<McpSession | null>;
	handler: (
		fn: (req: Request, session: McpSession) => Response | Promise<Response>,
	) => (req: Request) => Promise<Response>;
	discoveryHandler: () => (req: Request) => Promise<Response>;
	protectedResourceHandler: (
		serverURL: string,
	) => (req: Request) => Promise<Response>;
	middleware: () => (
		req: NodeLikeRequest,
		res: NodeLikeResponse,
		next: () => void,
	) => Promise<void>;
	authURL: string;
}

function buildCorsHeaders(
	authURL: string,
	allowedOrigin?: string,
): Record<string, string> {
	let origin: string;
	if (allowedOrigin) {
		origin = allowedOrigin;
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
		res.status?.(401).json(JSON.parse(body));
	} else if (typeof res.writeHead === "function") {
		res.writeHead(401, {
			"Content-Type": "application/json",
			"WWW-Authenticate": wwwAuth,
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
	const corsHeaders = buildCorsHeaders(authURL, options.allowedOrigin);

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
		const CACHE_TTL = 60_000;

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
