import type {
	AuthContext,
	BetterAuthRateLimitStorage,
} from "@better-auth/core";
import { safeJSONParse } from "@better-auth/core/utils/json";
import type { RateLimit } from "../../types";
import { getIp } from "../../utils/get-request-ip";
import { wildcardMatch } from "../../utils/wildcard";

interface MemoryRateLimitEntry {
	data: RateLimit;
	expiresAt: number;
}

const memory = new Map<string, MemoryRateLimitEntry>();

function shouldRateLimit(
	max: number,
	window: number,
	rateLimitData: RateLimit,
) {
	const now = Date.now();
	const windowInMs = window * 1000;
	const timeSinceLastRequest = now - rateLimitData.lastRequest;
	return timeSinceLastRequest < windowInMs && rateLimitData.count >= max;
}

function rateLimitResponse(retryAfter: number) {
	return new Response(
		JSON.stringify({
			message: "Too many requests. Please try again later.",
		}),
		{
			status: 429,
			statusText: "Too Many Requests",
			headers: {
				"X-Retry-After": retryAfter.toString(),
			},
		},
	);
}

function getRetryAfter(lastRequest: number, window: number) {
	const now = Date.now();
	const windowInMs = window * 1000;
	return Math.ceil((lastRequest + windowInMs - now) / 1000);
}

function createDatabaseStorageWrapper(
	ctx: AuthContext,
): BetterAuthRateLimitStorage {
	const model = "rateLimit";
	const db = ctx.adapter;
	return {
		get: async (key: string) => {
			const res = await db.findMany<RateLimit>({
				model,
				where: [{ field: "key", value: key }],
			});
			const data = res[0];

			if (typeof data?.lastRequest === "bigint") {
				data.lastRequest = Number(data.lastRequest);
			}

			return data;
		},
		set: async (
			key: string,
			value: RateLimit,
			_update?: boolean | undefined,
		) => {
			try {
				if (_update) {
					await db.updateMany({
						model,
						where: [{ field: "key", value: key }],
						update: {
							count: value.count,
							lastRequest: value.lastRequest,
						},
					});
				} else {
					await db.create({
						model,
						data: {
							key,
							count: value.count,
							lastRequest: value.lastRequest,
						},
					});
				}
			} catch (e) {
				ctx.logger.error("Error setting rate limit", e);
			}
		},
	};
}

function getRateLimitStorage(
	ctx: AuthContext,
	rateLimitSettings: {
		window: number;
	},
): BetterAuthRateLimitStorage {
	if (ctx.options.rateLimit?.customStorage) {
		return ctx.options.rateLimit.customStorage;
	}
	const storage = ctx.rateLimit.storage;
	if (storage === "secondary-storage") {
		return {
			get: async (key: string) => {
				const data = await ctx.options.secondaryStorage?.get(key);
				return data ? safeJSONParse<RateLimit>(data) : null;
			},
			set: async (
				key: string,
				value: RateLimit,
				_update?: boolean | undefined,
			) => {
				const ttl =
					rateLimitSettings?.window ?? ctx.options.rateLimit?.window ?? 10;
				await ctx.options.secondaryStorage?.set?.(
					key,
					JSON.stringify(value),
					ttl,
				);
			},
		};
	} else if (storage === "memory") {
		return {
			async get(key: string) {
				const entry = memory.get(key);
				if (!entry) {
					return null;
				}
				// Check if entry has expired
				if (Date.now() >= entry.expiresAt) {
					memory.delete(key);
					return null;
				}
				return entry.data;
			},
			async set(key: string, value: RateLimit, _update?: boolean | undefined) {
				const ttl =
					rateLimitSettings?.window ?? ctx.options.rateLimit?.window ?? 10;
				const expiresAt = Date.now() + ttl * 1000;
				memory.set(key, {
					data: value,
					expiresAt,
				});
			},
		};
	}
	return createDatabaseStorageWrapper(ctx);
}

export async function onRequestRateLimit(req: Request, ctx: AuthContext) {
	if (!ctx.rateLimit.enabled) {
		return;
	}
	const path = new URL(req.url).pathname
		.replace(ctx.options.basePath || "/api/auth", "")
		.replace(/\/+$/, "");
	let currentWindow = ctx.rateLimit.window;
	let currentMax = ctx.rateLimit.max;
	const ip = getIp(req, ctx.options);
	if (!ip) {
		return;
	}
	const key = ip + path;
	const specialRules = getDefaultSpecialRules();
	const specialRule = specialRules.find((rule) => rule.pathMatcher(path));

	if (specialRule) {
		currentWindow = specialRule.window;
		currentMax = specialRule.max;
	}

	for (const plugin of ctx.options.plugins || []) {
		if (plugin.rateLimit) {
			const matchedRule = plugin.rateLimit.find((rule) =>
				rule.pathMatcher(path),
			);
			if (matchedRule) {
				currentWindow = matchedRule.window;
				currentMax = matchedRule.max;
				break;
			}
		}
	}

	if (ctx.rateLimit.customRules) {
		const _path = Object.keys(ctx.rateLimit.customRules).find((p) => {
			if (p.includes("*")) {
				const isMatch = wildcardMatch(p)(path);
				return isMatch;
			}
			return p === path;
		});
		if (_path) {
			const customRule = ctx.rateLimit.customRules[_path];
			const resolved =
				typeof customRule === "function"
					? await customRule(req, {
							window: currentWindow,
							max: currentMax,
						})
					: customRule;
			if (resolved) {
				currentWindow = resolved.window;
				currentMax = resolved.max;
			}

			if (resolved === false) {
				return;
			}
		}
	}

	const storage = getRateLimitStorage(ctx, {
		window: currentWindow,
	});
	const data = await storage.get(key);
	const now = Date.now();

	if (!data) {
		await storage.set(key, {
			key,
			count: 1,
			lastRequest: now,
		});
	} else {
		const timeSinceLastRequest = now - data.lastRequest;

		if (shouldRateLimit(currentMax, currentWindow, data)) {
			const retryAfter = getRetryAfter(data.lastRequest, currentWindow);
			return rateLimitResponse(retryAfter);
		} else if (timeSinceLastRequest > currentWindow * 1000) {
			// Reset the count if the window has passed since the last request
			await storage.set(
				key,
				{
					...data,
					count: 1,
					lastRequest: now,
				},
				true,
			);
		} else {
			await storage.set(
				key,
				{
					...data,
					count: data.count + 1,
					lastRequest: now,
				},
				true,
			);
		}
	}
}

function getDefaultSpecialRules() {
	const specialRules = [
		{
			pathMatcher(path: string) {
				return (
					path.startsWith("/sign-in") ||
					path.startsWith("/sign-up") ||
					path.startsWith("/change-password") ||
					path.startsWith("/change-email")
				);
			},
			window: 10,
			max: 3,
		},
	];
	return specialRules;
}
