import { describe, expect, it } from "vitest";
import { mcpAuthHono } from "./adapters";
import { createMcpResourceClient } from "./index";

describe("createMcpResourceClient", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/9992
	 */
	it("uses RFC 9728 path insertion for the default resource_metadata challenge", async () => {
		const client = createMcpResourceClient({
			authURL: "https://app.example.com/api/auth",
		});

		const response = await client.handler(() => new Response("unreachable"))(
			new Request("https://app.example.com/mcp"),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/auth"`,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9992
	 */
	it("uses RFC 9728 path insertion for an explicit resource", async () => {
		const client = createMcpResourceClient({
			authURL: "https://auth.example.com/api/auth",
			resource: "https://mcp.example.com/server/mcp",
		});

		const response = await client.handler(() => new Response("unreachable"))(
			new Request("https://mcp.example.com/server/mcp"),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/server/mcp"`,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9992
	 */
	it("preserves the resource query in the resource_metadata challenge", async () => {
		const client = createMcpResourceClient({
			authURL: "https://auth.example.com/api/auth",
			resource: "https://mcp.example.com/server/mcp?tenant=a",
		});

		const response = await client.handler(() => new Response("unreachable"))(
			new Request("https://mcp.example.com/server/mcp"),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/server/mcp?tenant=a"`,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9992
	 */
	it("does not invent protected-resource scopes for remote metadata", async () => {
		const client = createMcpResourceClient({
			authURL: "https://auth.example.com/api/auth",
			resource: "https://mcp.example.com/server/mcp",
		});

		const response = await client.protectedResourceHandler(
			"https://mcp.example.com/server/mcp",
		)(
			new Request(
				"https://mcp.example.com/.well-known/oauth-protected-resource",
			),
		);
		const metadata = (await response.json()) as {
			scopes_supported?: string[];
		};

		expect(metadata.scopes_supported).toBeUndefined();
	});
});

describe("mcpAuthHono", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/9992
	 */
	it("uses RFC 9728 path insertion for the resource_metadata challenge", async () => {
		const auth = mcpAuthHono({
			authURL: "https://app.example.com/api/auth",
		});
		let challenge = "";
		const context: Parameters<typeof auth.middleware>[0] = {
			req: {
				header: () => undefined,
				raw: new Request("https://app.example.com/mcp"),
			},
			set: () => undefined,
			header: (_name, value) => {
				challenge = value;
			},
			json: (data, status, headers) => Response.json(data, { status, headers }),
		};

		const response = await auth.middleware(context, async () => {});

		expect(response?.status).toBe(401);
		expect(challenge).toBe(
			`Bearer resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/auth"`,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9992
	 */
	it("registers the path-inserted protected-resource metadata alias", () => {
		const auth = mcpAuthHono({
			authURL: "https://app.example.com/api/auth",
		});
		const routes: string[] = [];
		const app: Parameters<typeof auth.discoveryRoutes>[0] = {
			get: (path) => {
				routes.push(path);
			},
		};

		auth.discoveryRoutes(app, "https://app.example.com/api/auth");

		expect(routes).toContain("/.well-known/oauth-protected-resource");
		expect(routes).toContain("/.well-known/oauth-protected-resource/api/auth");
	});
});
