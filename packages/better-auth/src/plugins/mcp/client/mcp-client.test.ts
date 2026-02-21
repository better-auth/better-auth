import { listen } from "listhen";
import { afterAll, describe, expect, it } from "vitest";
import { toNodeHandler } from "../../../integrations/node";
import { getTestInstance } from "../../../test-utils/test-instance";
import { jwt } from "../../jwt";
import { mcp } from "../index";
import { mcpAuthMcpUse } from "./adapters";
import type { McpSession } from "./index";
import { createMcpAuthClient } from "./index";

describe("mcp-client", async () => {
	const tempServer = await listen(
		toNodeHandler(async () => new Response("temp")),
		{ port: 0 },
	);
	const port = tempServer.address?.port || 3099;
	const baseURL = `http://localhost:${port}`;
	await tempServer.close();

	const { auth, customFetchImpl } = await getTestInstance({
		baseURL,
		plugins: [
			mcp({
				loginPage: "/login",
				oidcConfig: {
					loginPage: "/login",
					consentPage: "/oauth/consent",
					requirePKCE: true,
				},
			}),
			jwt(),
		],
	});

	const server = await listen(toNodeHandler(auth.handler), { port });
	afterAll(async () => {
		await server.close();
	});

	const authURL = `${baseURL}/api/auth`;

	describe("createMcpAuthClient", () => {
		it("should create a client with correct authURL", () => {
			const client = createMcpAuthClient({ authURL });
			expect(client.authURL).toBe(authURL);
		});

		it("should normalize trailing slash", () => {
			const client = createMcpAuthClient({ authURL: `${authURL}/` });
			expect(client.authURL).toBe(authURL);
		});

		it("should return null for invalid tokens", async () => {
			const client = createMcpAuthClient({
				authURL,
				fetch: customFetchImpl as typeof fetch,
			});
			const session = await client.verifyToken("invalid-token");
			expect(session).toBeNull();
		});

		it("should return null for network errors in verifyToken", async () => {
			const client = createMcpAuthClient({
				authURL: "http://localhost:1/api/auth",
			});
			const session = await client.verifyToken("some-token");
			expect(session).toBeNull();
		});

		it("should return 401 from handler for missing auth header", async () => {
			const client = createMcpAuthClient({
				authURL,
				fetch: customFetchImpl as typeof fetch,
			});

			const protectedHandler = client.handler(async (_req, session) => {
				return Response.json({ userId: session.userId });
			});

			const response = await protectedHandler(
				new Request("http://localhost/mcp"),
			);

			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.jsonrpc).toBe("2.0");
			expect(body.error.code).toBe(-32000);

			const wwwAuth = response.headers.get("WWW-Authenticate");
			expect(wwwAuth).toContain("Bearer");
			expect(wwwAuth).toContain("oauth-protected-resource");
		});

		it("should return 401 from handler for invalid token", async () => {
			const client = createMcpAuthClient({
				authURL,
				fetch: customFetchImpl as typeof fetch,
			});

			const protectedHandler = client.handler(async (_req, session) => {
				return Response.json({ userId: session.userId });
			});

			const response = await protectedHandler(
				new Request("http://localhost/mcp", {
					headers: { Authorization: "Bearer invalid-token" },
				}),
			);

			expect(response.status).toBe(401);
		});

		it("should handle OPTIONS requests for CORS", async () => {
			const client = createMcpAuthClient({ authURL });

			const protectedHandler = client.handler(async () => {
				return new Response("ok");
			});

			const response = await protectedHandler(
				new Request("http://localhost/mcp", { method: "OPTIONS" }),
			);

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
		});

		it("should use authURL origin as default CORS origin", async () => {
			const client = createMcpAuthClient({
				authURL: "http://example.com:3000/api/auth",
			});

			const protectedHandler = client.handler(async () => {
				return new Response("ok");
			});

			const response = await protectedHandler(
				new Request("http://localhost/mcp", { method: "OPTIONS" }),
			);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
				"http://example.com:3000",
			);
		});

		it("should allow custom CORS origins", async () => {
			const client = createMcpAuthClient({
				authURL,
				allowedOrigin: "https://myapp.com",
			});

			const protectedHandler = client.handler(async () => {
				return new Response("ok");
			});

			const response = await protectedHandler(
				new Request("http://localhost/mcp", { method: "OPTIONS" }),
			);

			expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
				"https://myapp.com",
			);
		});
	});

	describe("happy path - verifyToken + handler with valid session", () => {
		const mockSession: McpSession = {
			accessToken: "valid-opaque-token",
			refreshToken: "refresh-token",
			accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
			refreshTokenExpiresAt: new Date(
				Date.now() + 7 * 24 * 3600 * 1000,
			).toISOString(),
			clientId: "test-client-id",
			userId: "user-abc-123",
			scopes: "openid profile email",
		};

		const mockFetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : (input as Request).url;
			if (url.includes("/mcp/get-session")) {
				return new Response(JSON.stringify(mockSession), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response("Not Found", { status: 404 });
		}) as typeof fetch;

		it("should return session for a valid token", async () => {
			const client = createMcpAuthClient({
				authURL: "http://mock-auth/api/auth",
				fetch: mockFetch,
			});

			const session = await client.verifyToken("valid-opaque-token");
			expect(session).not.toBeNull();
			expect(session?.userId).toBe("user-abc-123");
			expect(session?.scopes).toBe("openid profile email");
			expect(session?.clientId).toBe("test-client-id");
		});

		it("should pass session to handler for authenticated requests", async () => {
			const client = createMcpAuthClient({
				authURL: "http://mock-auth/api/auth",
				fetch: mockFetch,
			});

			const protectedHandler = client.handler(async (_req, session) => {
				return Response.json({
					userId: session.userId,
					scopes: session.scopes,
					clientId: session.clientId,
				});
			});

			const response = await protectedHandler(
				new Request("http://localhost/mcp", {
					method: "POST",
					headers: { Authorization: "Bearer valid-opaque-token" },
				}),
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.userId).toBe("user-abc-123");
			expect(body.scopes).toBe("openid profile email");
			expect(body.clientId).toBe("test-client-id");
		});

		it("should set mcpSession on req via middleware for valid token", async () => {
			const client = createMcpAuthClient({
				authURL: "http://mock-auth/api/auth",
				fetch: mockFetch,
			});
			const mw = client.middleware();

			const mockReq = {
				headers: { authorization: "Bearer valid-opaque-token" },
				mcpSession: undefined as McpSession | undefined,
			};
			const mockRes = {
				set: (_key: string, _value: string) => {},
				status: (_code: number) => ({
					json: (_body: unknown) => {},
				}),
			};

			let nextCalled = false;
			await mw(mockReq, mockRes, () => {
				nextCalled = true;
			});

			expect(nextCalled).toBe(true);
			expect(mockReq.mcpSession).toBeDefined();
			expect(mockReq.mcpSession?.userId).toBe("user-abc-123");
			expect(mockReq.mcpSession?.scopes).toBe("openid profile email");
		});
	});

	describe("discoveryHandler", () => {
		it("should proxy OAuth discovery metadata", async () => {
			const client = createMcpAuthClient({
				authURL,
				fetch: customFetchImpl as typeof fetch,
			});

			const handler = client.discoveryHandler();
			const response = await handler(
				new Request("http://localhost/.well-known/oauth-authorization-server"),
			);

			expect(response.status).toBe(200);
			const metadata = await response.json();
			expect(metadata.issuer).toBe(baseURL);
			expect(metadata.authorization_endpoint).toContain("/mcp/authorize");
			expect(metadata.token_endpoint).toContain("/mcp/token");
			expect(metadata.registration_endpoint).toContain("/mcp/register");
		});
	});

	describe("protectedResourceHandler", () => {
		it("should return protected resource metadata", async () => {
			const client = createMcpAuthClient({ authURL });

			const handler = client.protectedResourceHandler("http://localhost:4000");
			const response = await handler(
				new Request("http://localhost/.well-known/oauth-protected-resource"),
			);

			expect(response.status).toBe(200);
			const metadata = await response.json();
			expect(metadata.resource).toBe("http://localhost:4000");
			expect(metadata.authorization_servers).toContain(authURL);
			expect(metadata.bearer_methods_supported).toContain("header");
		});
	});

	describe("mcpAuthMcpUse adapter", () => {
		it("should create an mcp-use compatible provider", () => {
			const provider = mcpAuthMcpUse({ authURL });

			expect(provider.getIssuer()).toBe(authURL);
			expect(provider.getAuthEndpoint()).toBe(`${authURL}/mcp/authorize`);
			expect(provider.getTokenEndpoint()).toBe(`${authURL}/mcp/token`);
			expect(provider.getMode()).toBe("direct");
			expect(provider.getScopesSupported()).toContain("openid");
			expect(provider.getGrantTypesSupported()).toContain("authorization_code");
			expect(provider.getRegistrationEndpoint?.()).toBe(
				`${authURL}/mcp/register`,
			);
		});

		it("should throw for missing authURL", () => {
			expect(() => mcpAuthMcpUse({ authURL: "" })).toThrow(
				"Better Auth authURL is required",
			);
		});

		it("should reject invalid tokens via verifyToken", async () => {
			const provider = mcpAuthMcpUse({ authURL });
			await expect(provider.verifyToken("bad-token")).rejects.toThrow(
				"Invalid or expired token",
			);
		});

		it("should extract default user info from payload", () => {
			const provider = mcpAuthMcpUse({ authURL });
			const userInfo = provider.getUserInfo({
				userId: "user-123",
				scopes: "openid profile",
				clientId: "client-abc",
			});

			expect(userInfo.userId).toBe("user-123");
			expect(userInfo.permissions).toEqual(["openid", "profile"]);
			expect(userInfo.clientId).toBe("client-abc");
		});

		it("should support custom getUserInfo", () => {
			const provider = mcpAuthMcpUse({
				authURL,
				getUserInfo: (payload) => ({
					userId: payload.userId as string,
					roles: ["admin"],
					email: "custom@test.com",
				}),
			});

			const userInfo = provider.getUserInfo({
				userId: "user-456",
				scopes: "openid",
			});

			expect(userInfo.userId).toBe("user-456");
			expect(userInfo.roles).toEqual(["admin"]);
			expect(userInfo.email).toBe("custom@test.com");
		});
	});

	describe("middleware", () => {
		it("should reject requests without auth header", async () => {
			const client = createMcpAuthClient({
				authURL,
				fetch: customFetchImpl as typeof fetch,
			});
			const mw = client.middleware();

			let nextCalled = false;
			const mockReq = { headers: {} };
			const mockRes = {
				set: (_key: string, _value: string) => {},
				status: (code: number) => ({
					json: (body: unknown) => {
						mockRes._status = code;
						mockRes._body = body;
					},
				}),
				_headers: {} as Record<string, string>,
				_status: 0,
				_body: null as unknown,
			};
			mockRes.set = (key: string, value: string) => {
				mockRes._headers[key] = value;
			};

			await mw(mockReq, mockRes, () => {
				nextCalled = true;
			});

			expect(nextCalled).toBe(false);
			expect(mockRes._status).toBe(401);
			expect(mockRes._headers["WWW-Authenticate"]).toContain("Bearer");
		});

		it("should return 401 for invalid token via middleware", async () => {
			const client = createMcpAuthClient({
				authURL,
				fetch: customFetchImpl as typeof fetch,
			});
			const mw = client.middleware();

			const mockReq = {
				headers: { authorization: "Bearer invalid-token-for-test" },
				mcpSession: undefined as McpSession | undefined,
			};
			const mockRes = {
				set: (_key: string, _value: string) => {},
				status: (code: number) => ({
					json: (body: unknown) => {
						mockRes._status = code;
						mockRes._body = body;
					},
				}),
				_headers: {} as Record<string, string>,
				_status: 0,
				_body: null as unknown,
			};
			mockRes.set = (key: string, value: string) => {
				mockRes._headers[key] = value;
			};

			let nextCalled = false;
			await mw(mockReq, mockRes, () => {
				nextCalled = true;
			});

			expect(nextCalled).toBe(false);
			expect(mockRes._status).toBe(401);
		});
	});
});
