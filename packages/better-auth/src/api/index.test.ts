import type {
	AuthContext,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { getEndpoints } from "./index";

describe("getEndpoints", () => {
	it("should await promise-based context before passing to middleware", async () => {
		const mockContext: AuthContext = {
			baseURL: "http://localhost:3000",
			options: {},
		} as any;

		const middlewareFn = vi.fn().mockResolvedValue({});

		const testPlugin: BetterAuthPlugin = {
			id: "test-plugin",
			middlewares: [
				{
					path: "/test",
					middleware: createAuthMiddleware(async (ctx) => {
						middlewareFn(ctx);
						return {};
					}),
				},
			],
		};

		const options: BetterAuthOptions = {
			plugins: [testPlugin],
		};

		const promiseContext = new Promise<AuthContext>((resolve) => {
			setTimeout(() => resolve(mockContext), 10);
		});

		const { middlewares } = getEndpoints(promiseContext, options);

		const testCtx = {
			request: new Request("http://localhost:3000/test"),
			context: { customProp: "value" },
		};

		await middlewares[0]!.middleware(testCtx);

		expect(middlewareFn).toHaveBeenCalled();
		const call = middlewareFn.mock.calls[0]![0];
		expect(call.context).toMatchObject({
			baseURL: "http://localhost:3000",
			options: {},
			customProp: "value",
		});
	});
});

describe("onRequest chain", () => {
	it("should execute all plugins onRequest handlers in chain", async () => {
		const onRequestOrder: string[] = [];

		const pluginA: BetterAuthPlugin = {
			id: "plugin-a",
			async onRequest(request, _ctx) {
				onRequestOrder.push("plugin-a");
				// Return a modified request - this should NOT stop the chain
				const newHeaders = new Headers(request.headers);
				newHeaders.set("x-plugin-a", "true");
				return {
					request: new Request(request, { headers: newHeaders }),
				};
			},
		};

		const pluginB: BetterAuthPlugin = {
			id: "plugin-b",
			async onRequest(request, _ctx) {
				onRequestOrder.push("plugin-b");
				// This should also execute and see the modified request from plugin-a
				const newHeaders = new Headers(request.headers);
				newHeaders.set("x-plugin-b", "true");
				return {
					request: new Request(request, { headers: newHeaders }),
				};
			},
		};

		const pluginC: BetterAuthPlugin = {
			id: "plugin-c",
			async onRequest(_request, _ctx) {
				onRequestOrder.push("plugin-c");
				// Just observe, don't modify
				return;
			},
		};

		const { client, testUser } = await getTestInstance({
			plugins: [pluginA, pluginB, pluginC],
		});

		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		// All three plugins should have their onRequest called
		expect(onRequestOrder).toEqual(["plugin-a", "plugin-b", "plugin-c"]);
	});

	it("should pass modified request from previous plugin to next plugin", async () => {
		let pluginBReceivedHeader: string | null = null;

		const pluginA: BetterAuthPlugin = {
			id: "plugin-a",
			async onRequest(request, _ctx) {
				const newHeaders = new Headers(request.headers);
				newHeaders.set("x-from-plugin-a", "hello");
				return {
					request: new Request(request, { headers: newHeaders }),
				};
			},
		};

		const pluginB: BetterAuthPlugin = {
			id: "plugin-b",
			async onRequest(request, _ctx) {
				// Should receive the header set by plugin-a
				pluginBReceivedHeader = request.headers.get("x-from-plugin-a");
				return;
			},
		};

		const { client, testUser } = await getTestInstance({
			plugins: [pluginA, pluginB],
		});

		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		expect(pluginBReceivedHeader).toBe("hello");
	});

	it("should stop chain when response is returned", async () => {
		const onRequestOrder: string[] = [];

		const pluginA: BetterAuthPlugin = {
			id: "plugin-a",
			async onRequest(_request, _ctx) {
				onRequestOrder.push("plugin-a");
				// Return a response - this SHOULD stop the chain
				return {
					response: new Response("Blocked by plugin-a", { status: 403 }),
				};
			},
		};

		const pluginB: BetterAuthPlugin = {
			id: "plugin-b",
			async onRequest(_request, _ctx) {
				onRequestOrder.push("plugin-b");
				return {
					response: new Response("ok", { status: 200 }),
				};
			},
		};

		const { client, testUser } = await getTestInstance({
			plugins: [pluginA, pluginB],
		});

		const result = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		// Only plugin-a should execute, plugin-b should NOT execute
		expect(onRequestOrder).toEqual(["plugin-a"]);
		// Response should be from plugin-a
		expect(result.error?.status).toBe(403);
	});
});

describe("skipTrailingSlashes option", () => {
	it("should return 404 for trailing slash requests by default", async () => {
		const { auth } = await getTestInstance({});

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/ok/", {
				method: "GET",
			}),
		);

		expect(response.status).toBe(404);
	});

	it("should handle trailing slash requests when skipTrailingSlashes is enabled", async () => {
		const { auth } = await getTestInstance({
			advanced: {
				skipTrailingSlashes: true,
			},
		});

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/ok/", {
				method: "GET",
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ ok: true });
	});

	it("should work with POST requests with trailing slash", async () => {
		const { auth } = await getTestInstance({
			advanced: {
				skipTrailingSlashes: true,
			},
		});

		// POST to sign-up endpoint with trailing slash
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "test2@example.com",
					password: "password123",
					name: "Test User 2",
				}),
			}),
		);

		// Should reach the endpoint (probably fail validation, but not 404)
		expect(response.status).not.toBe(404);
	});
});

describe("base path leading-prefix enforcement", () => {
	it("rejects a path where basePath is not a leading prefix", async () => {
		const { auth } = await getTestInstance({
			basePath: "/api/auth",
		});

		const response = await auth.handler(
			new Request("http://localhost:3000/x/api/auth/ok", {
				method: "GET",
			}),
		);

		expect(response.status).toBe(404);
	});

	it("rejects a path before basePath that targets a disabled route", async () => {
		const { auth } = await getTestInstance({
			basePath: "/api/auth",
			disabledPaths: ["/sign-up/email"],
		});

		const body = JSON.stringify({
			email: "user@example.com",
			password: "password12345",
			name: "Test User",
		});

		// The canonical path is rejected by `disabledPaths` in onRequest.
		const blocked = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
			}),
		);
		expect(blocked.status).toBe(404);

		// The confused variant resolves to `/sign-up/email` on a router that
		// strips basePath anywhere. The leading-prefix router rejects it before
		// routing, so it never reaches the endpoint or the deny-list.
		const confused = await auth.handler(
			new Request("http://localhost:3000/x/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
			}),
		);
		expect(confused.status).toBe(404);
	});
});
