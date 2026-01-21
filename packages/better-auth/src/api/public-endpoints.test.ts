import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { createAuthEndpoint } from "./index";

describe("publicEndpoints", () => {
	const createTestPlugin = (config?: {
		publicPath?: string;
		regularPath?: string;
	}): BetterAuthPlugin => ({
		id: "test-public-endpoints",
		publicEndpoints: {
			wellKnownTest: createAuthEndpoint(
				config?.publicPath ?? "/.well-known/test-config",
				{
					method: "GET",
				},
				async () => ({
					issuer: "https://example.com",
					test: true,
				}),
			),
		},
		endpoints: {
			testRegular: createAuthEndpoint(
				config?.regularPath ?? "/test-regular",
				{
					method: "GET",
				},
				async () => ({
					regular: true,
				}),
			),
		},
	});

	it("should serve public endpoints at root path", async () => {
		const plugin = createTestPlugin();
		const { auth } = await getTestInstance({
			plugins: [plugin],
		});

		const response = await auth.handler(
			new Request("http://localhost:3000/.well-known/test-config", {
				method: "GET",
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({
			issuer: "https://example.com",
			test: true,
		});
	});

	it("should serve regular endpoints at basePath", async () => {
		const plugin = createTestPlugin();
		const { auth } = await getTestInstance({
			plugins: [plugin],
		});

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/test-regular", {
				method: "GET",
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({
			regular: true,
		});
	});

	it("should auto-route /.well-known/* paths in main handler", async () => {
		const plugin = createTestPlugin();
		const { auth } = await getTestInstance({
			plugins: [plugin],
		});

		// Both routes should work through the main handler
		const wellKnownResponse = await auth.handler(
			new Request("http://localhost:3000/.well-known/test-config", {
				method: "GET",
			}),
		);
		expect(wellKnownResponse.status).toBe(200);

		const regularResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/test-regular", {
				method: "GET",
			}),
		);
		expect(regularResponse.status).toBe(200);
	});

	it("should expose publicHandler when plugins have publicEndpoints", async () => {
		const plugin = createTestPlugin();
		const { auth } = await getTestInstance({
			plugins: [plugin],
		});

		expect(auth.publicHandler).toBeDefined();

		const response = await auth.publicHandler!(
			new Request("http://localhost:3000/.well-known/test-config", {
				method: "GET",
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({
			issuer: "https://example.com",
			test: true,
		});
	});

	it("should expose publicApi when plugins have publicEndpoints", async () => {
		const plugin = createTestPlugin();
		const { auth } = await getTestInstance({
			plugins: [plugin],
		});

		expect(auth.publicApi).toBeDefined();
		expect(auth.publicApi?.wellKnownTest).toBeDefined();
	});

	it("should not have publicHandler when no plugins use publicEndpoints", async () => {
		const regularPlugin: BetterAuthPlugin = {
			id: "regular-plugin",
			endpoints: {
				regular: createAuthEndpoint(
					"/regular",
					{ method: "GET" },
					async () => ({ regular: true }),
				),
			},
		};

		const { auth } = await getTestInstance({
			plugins: [regularPlugin],
		});

		expect(auth.publicHandler).toBeUndefined();
		expect(auth.publicApi).toBeUndefined();
	});

	it("should not have publicHandler with empty publicEndpoints object", async () => {
		const pluginWithEmptyPublic: BetterAuthPlugin = {
			id: "empty-public",
			publicEndpoints: {},
			endpoints: {
				regular: createAuthEndpoint(
					"/regular",
					{ method: "GET" },
					async () => ({ regular: true }),
				),
			},
		};

		const { auth } = await getTestInstance({
			plugins: [pluginWithEmptyPublic],
		});

		expect(auth.publicHandler).toBeUndefined();
		expect(auth.publicApi).toBeUndefined();
	});

	it("should work with custom basePath", async () => {
		const plugin = createTestPlugin();
		const { auth } = await getTestInstance({
			basePath: "/auth",
			plugins: [plugin],
		});

		// Public endpoint should still be at root
		const wellKnownResponse = await auth.handler(
			new Request("http://localhost:3000/.well-known/test-config", {
				method: "GET",
			}),
		);
		expect(wellKnownResponse.status).toBe(200);

		// Regular endpoint should be at custom basePath
		const regularResponse = await auth.handler(
			new Request("http://localhost:3000/auth/test-regular", {
				method: "GET",
			}),
		);
		expect(regularResponse.status).toBe(200);
	});

	it("should return 404 for non-existent public endpoints", async () => {
		const plugin = createTestPlugin();
		const { auth } = await getTestInstance({
			plugins: [plugin],
		});

		const response = await auth.handler(
			new Request("http://localhost:3000/.well-known/non-existent", {
				method: "GET",
			}),
		);

		expect(response.status).toBe(404);
	});

	it("should handle multiple plugins with publicEndpoints", async () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			publicEndpoints: {
				config1: createAuthEndpoint(
					"/.well-known/config-one",
					{ method: "GET" },
					async () => ({ plugin: 1 }),
				),
			},
		};
		const plugin2: BetterAuthPlugin = {
			id: "plugin2",
			publicEndpoints: {
				config2: createAuthEndpoint(
					"/.well-known/config-two",
					{ method: "GET" },
					async () => ({ plugin: 2 }),
				),
			},
		};

		const { auth } = await getTestInstance({
			plugins: [plugin1, plugin2],
		});

		const response1 = await auth.handler(
			new Request("http://localhost:3000/.well-known/config-one", {
				method: "GET",
			}),
		);
		expect(response1.status).toBe(200);
		const body1 = await response1.json();
		expect(body1).toEqual({ plugin: 1 });

		const response2 = await auth.handler(
			new Request("http://localhost:3000/.well-known/config-two", {
				method: "GET",
			}),
		);
		expect(response2.status).toBe(200);
		const body2 = await response2.json();
		expect(body2).toEqual({ plugin: 2 });
	});

	it("should call publicEndpoints via api object", async () => {
		const plugin = createTestPlugin();
		const { auth } = await getTestInstance({
			plugins: [plugin],
		});

		expect(auth.publicApi).toBeDefined();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const publicApi = auth.publicApi as any;
		const result = await publicApi.wellKnownTest({});
		expect(result).toEqual({
			issuer: "https://example.com",
			test: true,
		});
	});
});
