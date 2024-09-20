import { APIError } from "better-call";
import { createAuthMiddleware } from "../../api/call";
import type { GenericEndpointContext } from "../../types/context";
import type { BetterAuthPlugin } from "../../types/plugins";
import { getRateLimitKey } from "./get-key";
import { logger } from "../../utils/logger";

interface RateLimit {
	key: string;
	count: number;
	lastRequest: number;
}

export interface RateLimitOptions {
	/**
	 * Enable rate limiting. You can also pass a function
	 * to enable rate limiting for specific endpoints.
	 *
	 * @default true
	 */
	enabled: boolean | ((request: Request) => boolean | Promise<boolean>);
	/**
	 * The window to use for rate limiting. The value
	 * should be in seconds.
	 * @default 15 minutes (15 * 60)
	 */
	window?: number;
	/**
	 * The maximum number of requests allowed within the window.
	 * @default 100
	 */
	max?: number;
	/**
	 * Function to get the key to use for rate limiting.
	 * @default "ip" or "userId" if the user is logged in.
	 */
	getKey?: (request: Request) => string | Promise<string>;
	storage?: {
		custom?: {
			get: (key: string) => Promise<RateLimit | undefined>;
			set: (key: string, value: RateLimit) => Promise<void>;
		};
		/**
		 * The provider to use for rate limiting.
		 * @default "database"
		 */
		provider?: "database" | "memory";
		/**
		 * The name of the table to use for rate limiting. Only used if provider is "database".
		 * @default "rateLimit"
		 */
		tableName?: string;
	};
	/**
	 * Custom rate limiting function.
	 */
	customRateLimit?: (request: Request) => Promise<boolean>;
	/**
	 * Special rules to apply to specific paths.
	 *
	 * By default, endpoints that starts with "/sign-in" or "/sign-up" are added
	 * to the rate limiting mechanism with a count value of 2.
	 * @example
	 * ```ts
	 * specialRules: [
	 *  {
	 *      matcher: (request) => request.url.startsWith("/sign-in"),
	 *      // This will half the amount of requests allowed for the sign-in endpoint
	 *      countValue: 2,
	 *  }
	 * ]
	 * ```
	 */
	specialRules?: {
		/**
		 * Custom matcher to determine if the special rule should be applied.
		 */
		matcher: (path: string) => boolean;
		/**
		 * The value to use for the count.
		 *
		 */
		countValue: number;
	}[];
}

/**
 * Rate limiting plugin for BetterAuth. It implements a simple rate limiting
 * mechanism to prevent abuse. It can be configured to use a database, memory
 * storage or a custom storage. It can also be configured to use a custom rate
 * limiting function.
 *
 * @example
 * ```ts
 * const plugin = rateLimiter({
 * 	enabled: true,
 * 	window: 60,
 * 	max: 100,
 * });
 * ```
 */
export const rateLimiter = (options: RateLimitOptions) => {
	const opts = {
		storage: {
			provider: "database",
			tableName: "rateLimit",
		},
		max: 100,
		window: 15 * 60,
		specialRules: [
			{
				matcher(path) {
					return path.startsWith("/sign-in") || path.startsWith("/sign-up");
				},
				countValue: 2,
			},
		],
		...options,
	} satisfies RateLimitOptions;
	const schema =
		opts.storage.provider === "database"
			? ({
					rateLimit: {
						fields: {
							key: {
								type: "string",
							},
							count: {
								type: "number",
							},
							lastRequest: {
								type: "number",
							},
						},
					},
				} as const)
			: undefined;

	function createDBStorage(ctx: GenericEndpointContext) {
		const db = ctx.context.db;
		return {
			get: async (key: string) => {
				const result = await db
					.selectFrom("rateLimit")
					.where("key", "=", key)
					.selectAll()
					.executeTakeFirst();
				return result as RateLimit | undefined;
			},
			set: async (key: string, value: RateLimit, isNew: boolean = true) => {
				try {
					if (isNew) {
						await db
							.insertInto(opts.storage.tableName ?? "rateLimit")
							.values({
								key,
								count: value.count,
								lastRequest: value.lastRequest,
							})
							.execute();
					} else {
						await db
							.updateTable(opts.storage.tableName ?? "rateLimit")
							.set({
								count: value.count,
								lastRequest: value.lastRequest,
							})
							.where("key", "=", key)
							.execute();
					}
				} catch (e) {
					logger.error("Error setting rate limit", e);
				}
			},
		};
	}
	const storage = new Map<string, RateLimit>();
	function createMemoryStorage() {
		return {
			get: async (key: string) => {
				return storage.get(key);
			},
			set: async (key: string, value: RateLimit) => {
				storage.set(key, value);
			},
		};
	}

	return {
		id: "rate-limiter",
		middlewares: [
			{
				path: "/**",
				middleware: createAuthMiddleware(async (ctx) => {
					if (!ctx.request) {
						return;
					}
					if (opts.customRateLimit) {
						const shouldLimit = await opts.customRateLimit(ctx.request);
						if (!shouldLimit) {
							throw new APIError("TOO_MANY_REQUESTS", {
								message: "Too many requests",
							});
						}
						return;
					}
					const key = await getRateLimitKey(ctx.request);
					const storage = opts.storage.custom
						? opts.storage.custom
						: opts.storage.provider === "database"
							? createDBStorage(ctx)
							: createMemoryStorage();
					const rateLimit = await storage.get(key);
					if (!rateLimit) {
						await storage.set(key, {
							key,
							count: 0,
							lastRequest: new Date().getTime(),
						});
						return;
					}
					const now = new Date().getTime();
					const windowStart = now - opts.window * 1000;
					if (
						rateLimit.lastRequest >= windowStart &&
						rateLimit.count >= opts.max
					) {
						return new Response(null, {
							status: 429,
							statusText: "Too Many Requests",
							headers: {
								"X-RateLimit-Window": opts.window.toString(),
								"X-RateLimit-Max": opts.max.toString(),
								"X-RateLimit-Remaining": (
									opts.max - rateLimit.count
								).toString(),
								"X-RateLimit-Reset": (
									rateLimit.lastRequest +
									opts.window * 1000 -
									now
								).toString(),
							},
						});
					}

					if (rateLimit.lastRequest < windowStart) {
						rateLimit.count = 0;
					}
					const count =
						opts.specialRules.find((rule) => rule.matcher(ctx.path))
							?.countValue ?? 1;

					await storage.set(
						key,
						{
							key,
							count: rateLimit.count + count,
							lastRequest: now,
						},
						false,
					);
					return;
				}),
			},
		],
		schema,
	} satisfies BetterAuthPlugin;
};
