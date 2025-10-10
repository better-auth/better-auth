import { describe, expect, it } from "vitest";
import { alias } from "./index";
import { z } from "zod/v4";
import type { BetterAuthPlugin } from "../../types";
import { createAuthEndpoint } from "../../api";

describe("alias plugin", () => {
	// Create a mock plugin with endpoints
	const createMockPlugin = (id: string): BetterAuthPlugin => ({
		id,
		endpoints: {
			checkout: createAuthEndpoint(
				"/checkout",
				{
					method: "POST",
					body: z.object({
						amount: z.number(),
					}),
				},
				async (ctx) => {
					return ctx.json({ success: true });
				},
			),
			customerPortal: createAuthEndpoint(
				"/customer/portal",
				{
					method: "GET",
				},
				async (ctx) => {
					return ctx.json({ portal: "url" });
				},
			),
		},
		middlewares: [
			{
				path: "/checkout",
				middleware: async (ctx: any) => ctx,
			},
		],
		rateLimit: [
			{
				window: 60,
				max: 10,
				pathMatcher: (path) => path === "/checkout",
			},
		],
		hooks: {
			before: [
				{
					matcher: (ctx) => ctx.path === "/checkout",
					handler: async () => ({}),
				},
			],
			after: [
				{
					matcher: (ctx) => ctx.path === "/customer/portal",
					handler: async () => ({}),
				},
			],
		},
	});

	it("should prefix endpoint paths", () => {
		const plugin = createMockPlugin("polar");
		const aliasedPlugin = alias("/polar", plugin);

		// Check that endpoints are prefixed
		expect(aliasedPlugin.endpoints?.checkout?.path).toBe("/polar/checkout");
		expect(aliasedPlugin.endpoints?.customerPortal?.path).toBe(
			"/polar/customer/portal",
		);
	});

	it("should update plugin id to avoid conflicts", () => {
		const plugin = createMockPlugin("payment");
		const aliasedPlugin = alias("/polar", plugin);

		expect(aliasedPlugin.id).toBe("payment");
	});

	it("should prefix middleware paths", () => {
		const plugin = createMockPlugin("payment");
		const aliasedPlugin = alias("/dodo", plugin);

		expect(aliasedPlugin.middlewares).toBeDefined();
		expect(aliasedPlugin.middlewares![0]?.path).toBe("/dodo/checkout");
	});

	it("should update rate limit path matchers", () => {
		const plugin = createMockPlugin("payment");
		const aliasedPlugin = alias("/stripe", plugin);

		expect(aliasedPlugin.rateLimit).toBeDefined();
		const rateLimitRule = aliasedPlugin.rateLimit![0];

		// Test that the rate limit matcher works with prefixed paths
		expect(rateLimitRule?.pathMatcher("/stripe/checkout")).toBe(true);
		expect(rateLimitRule?.pathMatcher("/checkout")).toBe(false);
		expect(rateLimitRule?.pathMatcher("/other/path")).toBe(false);
	});

	it("should update hook matchers to work with prefixed paths", () => {
		const plugin = createMockPlugin("payment");
		const aliasedPlugin = alias("/paypal", plugin);

		expect(aliasedPlugin.hooks).toBeDefined();
		const beforeHook = aliasedPlugin.hooks!.before![0];
		const afterHook = aliasedPlugin.hooks!.after![0];

		// Test that hook matchers work with prefixed paths
		expect(beforeHook?.matcher({ path: "/paypal/checkout" } as any)).toBe(true);
		expect(beforeHook?.matcher({ path: "/checkout" } as any)).toBe(false);

		expect(afterHook?.matcher({ path: "/paypal/customer/portal" } as any)).toBe(
			true,
		);
		expect(afterHook?.matcher({ path: "/customer/portal" } as any)).toBe(false);
	});

	it("should normalize prefix formatting", () => {
		const plugin = createMockPlugin("payment");

		// Test without leading slash
		const aliased1 = alias("prefix", plugin);
		expect(aliased1.endpoints?.checkout?.path).toBe("/prefix/checkout");

		// Test with trailing slash
		const aliased2 = alias("/prefix/", plugin);
		expect(aliased2.endpoints?.checkout?.path).toBe("/prefix/checkout");

		// Test with both
		const aliased3 = alias("prefix/", plugin);
		expect(aliased3.endpoints?.checkout?.path).toBe("/prefix/checkout");
	});

	it("should allow multiple plugins with same endpoints when aliased", () => {
		const polarPlugin = createMockPlugin("polar");
		const dodoPlugin = createMockPlugin("dodo");

		const aliasedPolar = alias("/polar", polarPlugin);
		const aliasedDodo = alias("/dodo", dodoPlugin);

		// Both plugins now have different paths
		expect(aliasedPolar.endpoints?.checkout?.path).toBe("/polar/checkout");
		expect(aliasedDodo.endpoints?.checkout?.path).toBe("/dodo/checkout");

		// And different IDs
		expect(aliasedPolar.id).not.toBe(aliasedDodo.id);
	});

	it("should handle plugins without optional properties", () => {
		const minimalPlugin: BetterAuthPlugin = {
			id: "minimal",
			endpoints: {
				test: createAuthEndpoint("/test", { method: "GET" }, async (ctx) =>
					ctx.json({ test: true }),
				),
			},
		};

		const aliasedPlugin = alias("/mini", minimalPlugin);

		expect(aliasedPlugin.endpoints?.test?.path).toBe("/mini/test");
		expect(aliasedPlugin.middlewares).toBeUndefined();
		expect(aliasedPlugin.rateLimit).toBeUndefined();
		expect(aliasedPlugin.hooks).toBeUndefined();
	});
});
