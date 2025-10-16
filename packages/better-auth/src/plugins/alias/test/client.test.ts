// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { BetterAuthClientPlugin } from "../../../client/types";
import { aliasClient } from "../client";
import { createMockClientPlugin } from "./mock-plugin";
import { createAuthClient as createSolidClient } from "../../../client/solid";

describe("aliasClient plugin", () => {
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
		expect(firstListener?.matcher("/paypal/customer/portal")).toBe(true);
		expect(firstListener?.matcher("/paypal/customer/portal/confirm")).toBe(
			true,
		);
		expect(firstListener?.matcher("/customer/portal")).toBe(false);

		expect(secondListener?.matcher("/paypal/checkout")).toBe(true);
		expect(secondListener?.matcher("/checkout")).toBe(false);
	});

	it("should preserve getActions functionality", () => {
		const plugin = createMockClientPlugin("payment");
		const aliased = aliasClient("/dodo", plugin);

		expect(aliased.getActions).toBeDefined();
		const actions = aliased.getActions!({} as any, {} as any, undefined);

		expect(actions.dodo.customAction()).toBe("action-result");
		expect(actions.dodo.anotherAction("test")).toBe("result-test");
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
		// @ts-expect-error
		expect(aliased.$InferServerPlugin!.endpoints!.checkout.path).toBe(
			"/polar/checkout",
		);
		// @ts-expect-error
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

	it("should prefix atoms when enabled", () => {
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

		const aliased = aliasClient("/app", plugin, {
			unstable_prefixAtoms: true,
		});

		expect(aliased.atomListeners![0]?.signal).toBe("$sessionSignal");
		expect(aliased.atomListeners![1]?.signal).toBe("adminSignalApp");
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

	it("should handle excluded endpoints properly", () => {
		const aliased = aliasClient("/payment", createMockClientPlugin("payment"), {
			excludeEndpoints: ["/checkout"],
		});

		expect(aliased.pathMethods!["/payment/customer/portal"]).toBe("GET");
		expect(aliased.pathMethods!["/checkout"]).toBe("POST");

		// TODO: getActions
		// TODO: getAtoms
	});

	it("state listener should be called on matched path", async () => {
		const client = createSolidClient({
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
			baseURL: "http://localhost:3000",
			plugins: [aliasClient("/paypal", createMockClientPlugin("payment"))],
		});

		const res = client.useComputedAtom();
		expect(res()).toBe(0);
		await client.paypal.customer.portal();
		vi.useFakeTimers();
		setTimeout(() => {
			expect(res()).toBe(1);
		}, 100);
	});

	it("should wrap getAtoms to prefix any path-based actions", async () => {
		let returnNull = false;
		const spyFetch = vi.fn(async (req: Request | string | URL) => {
			if (returnNull) {
				return new Response(JSON.stringify(null));
			}
			return new Response(
				JSON.stringify({
					success: true,
				}),
			);
		});

		const client = createSolidClient({
			fetchOptions: {
				customFetchImpl: spyFetch,
			},
			baseURL: "http://localhost:3000",
			plugins: [
				aliasClient("/polar", createMockClientPlugin("polar"), {
					unstable_prefixAtoms: true,
				}),
			],
		});
		const res = client.useQueryAtomPolar();
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1);
		expect(res()).toMatchObject({
			data: { success: true },
			error: null,
			isPending: false,
		});
		expect(spyFetch).toHaveBeenCalledTimes(1);
		const calledURL = spyFetch.mock.calls[0]?.[0];
		expect(calledURL?.toString()).toEqual(
			"http://localhost:3000/api/auth/polar/customer/portal",
		);

		// recall
		returnNull = true;
		await client.polar.checkout({ amount: 3 });
		await vi.advanceTimersByTimeAsync(10);
		expect(res()).toMatchObject({
			data: null,
			error: null,
			isPending: false,
		});
	});
});
