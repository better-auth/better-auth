import { describe, expect, it, vi } from "vitest";
import type { BetterAuthClientPlugin } from "../../client/types";
import { aliasClient } from "./client";
import { createEndpoint } from "better-call";

describe("aliasClient plugin", () => {
	const endpoint = createEndpoint.create();
	const createMockClientPlugin = (id: string) =>
		({
			id,
			pathMethods: {
				"/checkout": "POST",
				"/customer/portal": "GET",
				"/subscription/cancel": "POST",
			},
			atomListeners: [
				{
					matcher: (path) => path.startsWith("/checkout"),
					signal: "$sessionSignal",
				},
				{
					matcher: (path) => path === "/customer/portal",
					signal: "customSignal",
				},
			],
			fetchPlugins: [
				{
					id: `${id}-fetch`,
					name: `${id}-fetch`,
					hooks: {
						onRequest: async (context) => {
							return context;
						},
					},
				},
			],
			getActions: (fetch, store, options) => ({
				customAction: () => "action-result",
				anotherAction: (param: string) => `result-${param}`,
			}),
			$InferServerPlugin: {
				id: `${id}-server`,
				endpoints: {
					checkout: endpoint(
						"/checkout",
						{
							method: "POST",
						},
						(ctx) => ctx.json({}),
					),
					customerPortal: endpoint(
						"/customer/portal",
						{
							method: "GET",
						},
						(ctx) => ctx.json({}),
					),
				},
			},
		}) satisfies BetterAuthClientPlugin;

	it("should prefix pathMethods", () => {
		const plugin = createMockClientPlugin("payment");
		const aliased = aliasClient("/polar", plugin);

		expect(aliased.pathMethods).toEqual({
			"/polar/checkout": "POST",
			"/polar/customer/portal": "GET",
			"/polar/subscription/cancel": "POST",
		});
	});

	it("should update plugin id to include prefix", () => {
		const plugin = createMockClientPlugin("payment");
		const aliased = aliasClient("/stripe", plugin);

		expect(aliased.id).toBe("payment--stripe");
	});

	it("should update atomListeners matchers", () => {
		const plugin = createMockClientPlugin("payment");
		const aliased = aliasClient("/paypal", plugin);

		expect(aliased.atomListeners).toBeDefined();
		expect(aliased.atomListeners).toHaveLength(2);

		const firstListener = aliased.atomListeners![0];
		const secondListener = aliased.atomListeners![1];

		// Test that matchers work with prefixed paths
		expect(firstListener?.matcher("/paypal/checkout")).toBe(true);
		expect(firstListener?.matcher("/paypal/checkout/confirm")).toBe(true);
		expect(firstListener?.matcher("/checkout")).toBe(false);

		expect(secondListener?.matcher("/paypal/customer/portal")).toBe(true);
		expect(secondListener?.matcher("/customer/portal")).toBe(false);
	});

	it("should preserve getActions functionality", () => {
		const plugin = createMockClientPlugin("payment");
		const aliased = aliasClient("/dodo", plugin);

		expect(aliased.getActions).toBeDefined();
		const actions = aliased.getActions!({} as any, {} as any, undefined);

		expect(actions.customAction()).toBe("action-result");
		expect(actions.anotherAction("test")).toBe("result-test");
	});

	it("should update fetchPlugins id", () => {
		const plugin = createMockClientPlugin("payment");
		const aliased = aliasClient("/stripe", plugin);

		expect(aliased.fetchPlugins).toBeDefined();
		expect(aliased.fetchPlugins![0]?.id).toBe("payment-fetch--stripe");
	});

	it("should prefix server plugin endpoints", () => {
		const plugin = createMockClientPlugin("payment");
		const aliased = aliasClient("/polar", plugin);

		expect(aliased.$InferServerPlugin).toBeDefined();
		expect(aliased.$InferServerPlugin!.endpoints).toBeDefined();
		expect(aliased.$InferServerPlugin!.endpoints!.checkout.path).toBe(
			"/polar/checkout",
		);
		expect(aliased.$InferServerPlugin!.endpoints!.customerPortal.path).toBe(
			"/polar/customer/portal",
		);
	});

	it("should normalize prefix formatting", () => {
		const plugin = createMockClientPlugin("payment");

		// Without leading slash
		const aliased1 = aliasClient("prefix", plugin);
		expect(aliased1.pathMethods!["/prefix/checkout"]).toBe("POST");

		// With trailing slash
		const aliased2 = aliasClient("/prefix/", plugin);
		expect(aliased2.pathMethods!["/prefix/checkout"]).toBe("POST");

		// With both
		const aliased3 = aliasClient("prefix/", plugin);
		expect(aliased3.pathMethods!["/prefix/checkout"]).toBe("POST");
	});

	it("should handle plugins with minimal properties", () => {
		const minimalPlugin: BetterAuthClientPlugin = {
			id: "minimal",
		};

		const aliased = aliasClient("/mini", minimalPlugin);

		expect(aliased.id).toBe("minimal--mini");
		expect(aliased.pathMethods).toBeUndefined();
		expect(aliased.atomListeners).toBeUndefined();
		expect(aliased.fetchPlugins).toBeUndefined();
		expect(aliased.getActions).toBeUndefined();
		expect(aliased.$InferServerPlugin).toBeUndefined();
	});

	it("should handle multiple nested prefixes", () => {
		const plugin = createMockClientPlugin("payment");
		const aliased1 = aliasClient("/v1", plugin);
		const aliased2 = aliasClient("/polar", aliased1);

		expect(aliased2.pathMethods).toEqual({
			"/polar/v1/checkout": "POST",
			"/polar/v1/customer/portal": "GET",
			"/polar/v1/subscription/cancel": "POST",
		});
		expect(aliased2.id).toBe("payment--v1--polar");
	});

	it("should allow multiple plugins with same endpoints when aliased", () => {
		const polarPlugin = createMockClientPlugin("polar");
		const dodoPlugin = createMockClientPlugin("dodo");

		const aliasedPolar = aliasClient("/polar", polarPlugin);
		const aliasedDodo = aliasClient("/dodo", dodoPlugin);

		// Different prefixed paths
		expect(aliasedPolar.pathMethods!["/polar/checkout"]).toBe("POST");
		expect(aliasedDodo.pathMethods!["/dodo/checkout"]).toBe("POST");

		// Different IDs
		expect(aliasedPolar.id).toBe("polar--polar");
		expect(aliasedDodo.id).toBe("dodo--dodo");
	});

	it("should handle fetchPlugin onRequest hook URL modification", () => {
		const mockContext = {
			url: "/api/auth/checkout",
			method: "POST",
		};

		const plugin: BetterAuthClientPlugin = {
			id: "payment",
			pathMethods: {
				"/checkout": "POST",
			},
			fetchPlugins: [
				{
					id: "payment-fetch",
					name: "payment-fetch",
					hooks: {
						onRequest: vi.fn(async (context) => context),
					},
				},
			],
		};

		const aliased = aliasClient("/stripe", plugin);
		const fetchPlugin = aliased.fetchPlugins![0];

		// Since onRequest modifies URLs, we need to verify the wrapper exists
		expect(fetchPlugin?.hooks?.onRequest).toBeDefined();
		expect(typeof fetchPlugin?.hooks?.onRequest).toBe("function");
	});

	it("should preserve atomListener signals", () => {
		const plugin: BetterAuthClientPlugin = {
			id: "test",
			atomListeners: [
				{
					matcher: (path) => path === "/specific",
					signal: "$sessionSignal",
				},
				{
					matcher: (path) => path.includes("admin"),
					signal: "adminSignal",
				},
			],
		};

		const aliased = aliasClient("/app", plugin);

		expect(aliased.atomListeners![0]?.signal).toBe("$sessionSignal");
		expect(aliased.atomListeners![1]?.signal).toBe("adminSignal");
	});

	it("should handle complex path patterns in atomListeners", () => {
		const plugin: BetterAuthClientPlugin = {
			id: "complex",
			atomListeners: [
				{
					matcher: (path) => {
						const regex = /^\/api\/v\d+\/resource$/;
						return regex.test(path);
					},
					signal: "resourceSignal",
				},
			],
		};

		const aliased = aliasClient("/service", plugin);
		const listener = aliased.atomListeners![0];

		// The matcher should now check for the prefixed path
		expect(listener?.matcher("/service/api/v1/resource")).toBe(true);
		expect(listener?.matcher("/service/api/v2/resource")).toBe(true);
		expect(listener?.matcher("/api/v1/resource")).toBe(false);
	});

	it("should handle empty prefix edge cases", () => {
		const plugin = createMockClientPlugin("payment");

		// Empty string prefix should still work
		const aliased = aliasClient("", plugin);
		expect(aliased.pathMethods!["/checkout"]).toBe("POST");

		// Root prefix
		const aliased2 = aliasClient("/", plugin);
		expect(aliased2.pathMethods!["/checkout"]).toBe("POST");
	});
});
