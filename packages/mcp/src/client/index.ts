import type { VerifyAccessTokenRequestOptions } from "better-auth/oauth2";
import {
	createInMemoryDpopReplayStore,
	DPOP_SIGNING_ALGORITHMS,
	enforceDpopBinding,
	getDpopJktFromPayload,
	isDpopBindingError,
	parseAccessTokenAuthorization,
} from "better-auth/oauth2";
import type { JWTPayload } from "jose";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface McpResourceClientOptions {
	authURL: string;
	resource?: string;
	allowedOrigin?: string;
	fetch?: typeof globalThis.fetch;
	dpop?: VerifyAccessTokenRequestOptions["dpop"];
}

export interface McpSession extends JWTPayload {
	sub?: string;
	scope?: string;
	client_id?: string;
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
		host?: string;
		"x-forwarded-proto"?: string;
	};
	get?: (name: string) => string | undefined;
	method?: string;
	originalUrl?: string;
	protocol?: string;
	url?: string;
	mcpSession?: McpSession;
}

interface NodeLikeResponse {
	set?: (name: string, value: string) => void;
	setHeader?: (name: string, value: string) => void;
	status?: (code: number) => { json: (body: unknown) => void };
	writeHead?: (code: number, headers: Record<string, string>) => void;
	end?: (body: string) => void;
}

const PROTECTED_RESOURCE_METADATA_PATH =
	"/.well-known/oauth-protected-resource";

export interface McpResourceClient {
	verifyToken: (token: string) => Promise<McpSession | null>;
	verifyRequest: (req: Request) => Promise<McpSession | null>;
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
		"Access-Control-Allow-Headers": "Content-Type, Authorization, DPoP",
		"Access-Control-Expose-Headers": "WWW-Authenticate",
		"Access-Control-Max-Age": "86400",
	};
}

function getProtectedResourceMetadataURL(resource: string): string {
	const resourceUrl = new URL(resource);
	if (resourceUrl.origin === "null") {
		throw new Error(
			"MCP resource_metadata requires an origin-based resource URL",
		);
	}
	const resourcePath =
		resourceUrl.pathname === "/" ? "" : resourceUrl.pathname.replace(/\/$/, "");
	return `${resourceUrl.origin}${PROTECTED_RESOURCE_METADATA_PATH}${resourcePath}${resourceUrl.search}`;
}

function makeWWWAuthenticate(authURL: string, resource?: string): string {
	const resourceMetadataURL = getProtectedResourceMetadataURL(
		resource ?? authURL,
	);
	return `Bearer resource_metadata="${resourceMetadataURL}"`;
}

export function makeDpopWWWAuthenticate(algorithms: readonly string[]): string {
	// Strip CR/LF and quoting characters so configured algorithm names cannot
	// inject extra fields into the `WWW-Authenticate` header value.
	const safe = algorithms.map((alg) => alg.replace(/[\r\n"\\]/g, ""));
	return `DPoP algs="${safe.join(" ")}"`;
}

function make401Response(wwwAuth: string): Response {
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

export function createMcpResourceClient(
	options: McpResourceClientOptions,
): McpResourceClient {
	const authURL = options.authURL.endsWith("/")
		? options.authURL.slice(0, -1)
		: options.authURL;
	const fetchFn = options.fetch ?? globalThis.fetch;
	const corsHeaders = buildCorsHeaders(authURL, options.allowedOrigin);
	const expectedAudience = options.resource ?? authURL;
	const dpopReplayStore =
		options.dpop?.replayStore ?? createInMemoryDpopReplayStore();
	const dpopSigningAlgorithms =
		options.dpop?.signingAlgorithms ?? DPOP_SIGNING_ALGORITHMS;

	// Picks the `WWW-Authenticate` challenge for an unauthenticated request: a
	// DPoP challenge when the client presented a DPoP token or proof, otherwise
	// the bearer resource-metadata challenge.
	const selectChallenge = (
		authHeader: string | null | undefined,
		dpopHeaderPresent: boolean,
	): string => {
		const usedDpop =
			parseAccessTokenAuthorization(authHeader)?.scheme === "DPoP" ||
			dpopHeaderPresent;
		return usedDpop
			? makeDpopWWWAuthenticate(dpopSigningAlgorithms)
			: makeWWWAuthenticate(authURL, options.resource);
	};

	let discovery: { issuer: string; jwks_uri: string } | null = null;
	let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

	const loadVerifier = async () => {
		if (discovery && jwks) {
			return { discovery, jwks };
		}
		const response = await fetchFn(
			`${authURL}/.well-known/oauth-authorization-server`,
		);
		if (!response.ok) {
			throw new Error("Failed to fetch discovery metadata");
		}
		const metadata = (await response.json()) as OAuthDiscoveryMetadata;
		if (!metadata.jwks_uri || !metadata.issuer) {
			throw new Error("Discovery metadata missing jwks_uri or issuer");
		}
		discovery = { issuer: metadata.issuer, jwks_uri: metadata.jwks_uri };
		jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
		return { discovery, jwks };
	};

	const verifyJwtToken = async (token: string): Promise<McpSession | null> => {
		try {
			const { discovery: meta, jwks: keySet } = await loadVerifier();
			const { payload } = await jwtVerify(token, keySet, {
				issuer: meta.issuer,
				audience: expectedAudience,
			});
			return payload as McpSession;
		} catch {
			return null;
		}
	};

	const verifyToken = async (token: string): Promise<McpSession | null> => {
		const session = await verifyJwtToken(token);
		if (!session || getDpopJktFromPayload(session)) return null;
		return session;
	};

	/**
	 * Verifies a request's access token and, when the token is DPoP-bound, its
	 * RFC 9449 sender-constraint. Returns `null` when there is no usable token
	 * or the JWT itself is invalid. Throws a `DpopBindingError` when a
	 * DPoP-bound token fails the binding check, so the caller can answer with a
	 * `WWW-Authenticate: DPoP` challenge rather than a bearer one.
	 */
	const verifyRequest = async (req: Request): Promise<McpSession | null> => {
		const authorization = parseAccessTokenAuthorization(
			req.headers.get("Authorization"),
		);
		// RFC 6750 / RFC 9449 §7: only Bearer or DPoP transport. A scheme-less or
		// unknown-scheme value is treated as unauthenticated.
		if (!authorization?.token || authorization.scheme === "Unknown")
			return null;
		const session = await verifyJwtToken(authorization.token);
		if (!session) return null;

		await enforceDpopBinding({
			payload: session,
			authorization,
			proofJwt: req.headers.get("DPoP"),
			method: req.method,
			url: req.url,
			proofMaxAgeSeconds: options.dpop?.proofMaxAgeSeconds,
			signingAlgorithms: dpopSigningAlgorithms,
			replayStore: dpopReplayStore,
		});
		return session;
	};

	const getHeader = (
		req: NodeLikeRequest,
		name: string,
	): string | undefined => {
		const lower = name.toLowerCase();
		const value =
			req.headers?.[lower] ??
			req.headers?.[name] ??
			req.headers?.get?.(name) ??
			req.get?.(name);
		if (Array.isArray(value)) return value[0];
		return value;
	};

	const getNodeRequestUrl = (req: NodeLikeRequest): string => {
		const rawUrl = req.originalUrl ?? req.url ?? "/";
		if (URL.canParse(rawUrl)) return rawUrl;
		const fallbackUrl = new URL(authURL);
		const host = getHeader(req, "host") ?? fallbackUrl.host;
		// `x-forwarded-proto` may be a comma-separated chain ("https, http"); the
		// client-facing protocol is the first entry.
		const forwardedProto = getHeader(req, "x-forwarded-proto")
			?.split(",")[0]
			?.trim();
		const protocol =
			forwardedProto ?? req.protocol ?? fallbackUrl.protocol.replace(":", "");
		return `${protocol}://${host}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
	};

	const handler: McpResourceClient["handler"] = (fn) => {
		return async (req: Request) => {
			if (req.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: corsHeaders });
			}

			let session: McpSession | null;
			try {
				session = await verifyRequest(req);
			} catch (error) {
				if (isDpopBindingError(error)) {
					return make401Response(
						makeDpopWWWAuthenticate(dpopSigningAlgorithms),
					);
				}
				throw error;
			}
			if (!session) {
				return make401Response(
					selectChallenge(
						req.headers.get("Authorization"),
						req.headers.has("DPoP"),
					),
				);
			}

			return fn(req, session);
		};
	};

	const discoveryHandler: McpResourceClient["discoveryHandler"] = () => {
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

	const protectedResourceHandler: McpResourceClient["protectedResourceHandler"] =
		(serverURL: string) => {
			const resource = options.resource ?? new URL(serverURL).origin;
			const metadata = {
				resource,
				authorization_servers: [authURL],
				bearer_methods_supported: ["header"],
				dpop_signing_alg_values_supported: [...dpopSigningAlgorithms],
			};

			return async (_req: Request) => {
				return Response.json(metadata, { headers: corsHeaders });
			};
		};

	const middleware: McpResourceClient["middleware"] = () => {
		return async (
			req: NodeLikeRequest,
			res: NodeLikeResponse,
			next: () => void,
		) => {
			const authHeader = getHeader(req, "authorization");
			const requestHeaders = new Headers();
			if (authHeader) {
				requestHeaders.set("Authorization", authHeader);
			}
			const dpop = getHeader(req, "dpop");
			if (dpop) {
				requestHeaders.set("DPoP", dpop);
			}
			const request = new Request(getNodeRequestUrl(req), {
				method: req.method ?? "GET",
				headers: requestHeaders,
			});
			let session: McpSession | null;
			try {
				session = await verifyRequest(request);
			} catch (error) {
				if (isDpopBindingError(error)) {
					send401Node(
						res,
						makeDpopWWWAuthenticate(dpopSigningAlgorithms),
						"Invalid or expired token",
					);
					return;
				}
				throw error;
			}
			if (!session) {
				send401Node(
					res,
					selectChallenge(authHeader, !!getHeader(req, "dpop")),
					authHeader
						? "Invalid or expired token"
						: "Unauthorized: Authentication required",
				);
				return;
			}

			req.mcpSession = session;
			next();
		};
	};

	return {
		verifyToken,
		verifyRequest,
		handler,
		discoveryHandler,
		protectedResourceHandler,
		middleware,
		authURL,
	};
}
