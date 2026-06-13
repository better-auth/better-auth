import {
	DPOP_SIGNING_ALGORITHMS,
	isDpopBindingError,
} from "better-auth/oauth2";
import type {
	McpResourceClient,
	McpResourceClientOptions,
	McpSession,
} from "./index";
import { createMcpResourceClient } from "./index";

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

const PROTECTED_RESOURCE_METADATA_PATH =
	"/.well-known/oauth-protected-resource";

function getProtectedResourceMetadataPath(resource: string): string {
	const resourceUrl = new URL(resource);
	if (resourceUrl.origin === "null") {
		return PROTECTED_RESOURCE_METADATA_PATH;
	}
	const resourcePath =
		resourceUrl.pathname === "/" ? "" : resourceUrl.pathname.replace(/\/$/, "");
	return `${PROTECTED_RESOURCE_METADATA_PATH}${resourcePath}`;
}

function getProtectedResourceMetadataURL(resource: string): string {
	const resourceUrl = new URL(resource);
	if (resourceUrl.origin === "null") {
		throw new Error(
			"MCP resource_metadata requires an origin-based resource URL",
		);
	}
	return `${resourceUrl.origin}${getProtectedResourceMetadataPath(resource)}${resourceUrl.search}`;
}

export function mcpAuthHono(options: McpResourceClientOptions): {
	client: McpResourceClient;
	middleware: HonoMiddleware;
	discoveryRoutes: (app: HonoApp, serverURL: string) => void;
} {
	const client = createMcpResourceClient(options);

	const resourceMetadata = getProtectedResourceMetadataURL(
		options.resource ?? client.authURL,
	);

	const dpopAlgorithms =
		options.dpop?.signingAlgorithms ?? DPOP_SIGNING_ALGORITHMS;
	const dpopChallenge = `DPoP algs="${dpopAlgorithms.join(" ")}"`;

	const unauthorized = (c: HonoContext, challenge: string, message: string) => {
		c.header("WWW-Authenticate", challenge);
		return c.json(
			{
				jsonrpc: "2.0",
				error: { code: -32000, message },
				id: null,
			},
			401,
		);
	};

	const middleware: HonoMiddleware = async (c, next) => {
		const authHeader = c.req.header("Authorization");
		let session: McpSession | null;
		try {
			session = await client.verifyRequest(c.req.raw);
		} catch (error) {
			if (isDpopBindingError(error)) {
				return unauthorized(c, dpopChallenge, "Invalid or expired token");
			}
			throw error;
		}
		if (!session) {
			const challenge =
				authHeader?.startsWith("DPoP ") || c.req.header("DPoP")
					? dpopChallenge
					: `Bearer resource_metadata="${resourceMetadata}"`;
			return unauthorized(
				c,
				challenge,
				authHeader
					? "Invalid or expired token"
					: "Unauthorized: Authentication required",
			);
		}

		c.set("mcpSession", session);
		await next();
	};

	const discoveryRoutes = (app: HonoApp, serverURL: string) => {
		const discoveryFn = client.discoveryHandler();
		const protectedResourceFn = client.protectedResourceHandler(serverURL);
		const protectedResourcePaths = new Set([
			PROTECTED_RESOURCE_METADATA_PATH,
			getProtectedResourceMetadataPath(options.resource ?? client.authURL),
		]);

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

		for (const path of protectedResourcePaths) {
			app.get(path, async (c: HonoContext) => {
				const response = await protectedResourceFn(c.req.raw);
				const data: unknown = await response.json().catch(() => ({
					error: "Invalid response from auth server",
				}));
				return c.json(data, response.status as 200 | 502);
			});
		}
	};

	return { client, middleware, discoveryRoutes };
}

export function mcpAuthOfficial(options: McpResourceClientOptions): {
	client: McpResourceClient;
	handler: McpResourceClient["handler"];
	verifyToken: McpResourceClient["verifyToken"];
} {
	const client = createMcpResourceClient(options);
	return {
		client,
		handler: client.handler,
		verifyToken: client.verifyToken,
	};
}

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
	authURL: string;
	getUserInfo?: (payload: Record<string, unknown>) => McpUseUserInfo;
}

export function mcpAuthMcpUse(config: McpUseBetterAuthConfig): OAuthProvider {
	const authURL = normalizeURL(config.authURL);

	if (!authURL) {
		throw new Error(
			"Better Auth authURL is required. " +
				"Pass authURL in config, e.g.: mcpAuthMcpUse({ authURL: 'http://localhost:3000/api/auth' })",
		);
	}

	const client = createMcpResourceClient({ authURL });

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
				typeof payload.scope === "string" ? payload.scope.split(" ") : [];
			return {
				userId: payload.sub as string,
				roles: [],
				permissions: scopes,
				scopes: payload.scope as string | undefined,
				clientId: (payload.azp ?? payload.client_id) as string | undefined,
			};
		},

		getIssuer() {
			return authURL;
		},

		getAuthEndpoint() {
			return `${authURL}/oauth2/authorize`;
		},

		getTokenEndpoint() {
			return `${authURL}/oauth2/token`;
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
			return `${authURL}/oauth2/register`;
		},
	};
}

function normalizeURL(url: string | undefined | null): string | undefined {
	if (!url || url.trim() === "") return undefined;
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

export type { McpSession, McpResourceClient, McpResourceClientOptions };
