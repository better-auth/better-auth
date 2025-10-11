import { createAuthEndpoint } from "../..";
import type { BetterAuthClientPlugin, BetterAuthPlugin } from "../../../types";
import type { LiteralString } from "../../../types/helper";
import z from "zod/v4";

export function createMockPlugin<ID extends LiteralString>(id: ID) {
	return {
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
	} as const satisfies BetterAuthPlugin;
}

export function createMockClientPlugin<ID extends LiteralString>(id: ID) {
	const plugin = {
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
		$InferServerPlugin: createMockPlugin(id),
	} satisfies BetterAuthClientPlugin;

	return plugin as Omit<typeof plugin, "id"> & {
		id: ID;
	};
}
