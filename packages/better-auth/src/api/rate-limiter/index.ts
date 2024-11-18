import type { AuthContext, RateLimit } from "../../types";
import { getIp } from "../../utils/get-request-ip";

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

function createDBStorage(ctx: AuthContext, modelName?: string) {
	const model = "rateLimit";
	const db = ctx.adapter;
	return {
		get: async (key: string) => {
			const res = await db.findOne<RateLimit>({
				model,
				where: [{ field: "key", value: key }],
			});
			return res;
		},
		set: async (key: string, value: RateLimit, _update?: boolean) => {
			try {
				if (_update) {
					await db.update({
						model: modelName ?? "rateLimit",
						where: [{ field: "key", value: key }],
						update: {
							count: value.count,
							lastRequest: value.lastRequest,
						},
					});
				} else {
					await db.create({
						model: modelName ?? "rateLimit",
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

const memory = new Map<string, RateLimit>();
export function getRateLimitStorage(ctx: AuthContext) {
	if (ctx.rateLimit.storage === "secondary-storage") {
		return {
			get: async (key: string) => {
				const stringified = await ctx.options.secondaryStorage?.get(key);
				return stringified ? (JSON.parse(stringified) as RateLimit) : undefined;
			},
			set: async (key: string, value: RateLimit) => {
				await ctx.options.secondaryStorage?.set?.(key, JSON.stringify(value));
			},
		};
	}
	const storage = ctx.rateLimit.storage;
	if (storage === "memory") {
		return {
			async get(key: string) {
				return memory.get(key);
			},
			async set(key: string, value: RateLimit, _update?: boolean) {
				memory.set(key, value);
			},
		};
	}
	return createDBStorage(ctx, ctx.rateLimit.modelName);
}

export async function onRequestRateLimit(req: Request, ctx: AuthContext) {
	if (!ctx.rateLimit.enabled) {
		return;
	}

	const baseURL = ctx.baseURL;
	const path = req.url.replace(baseURL, "");
	let window = ctx.rateLimit.window;
	let max = ctx.rateLimit.max;
	const key = getIp(req, ctx.options) + path;
	const specialRules = getDefaultSpecialRules();
	const specialRule = specialRules.find((rule) => rule.pathMatcher(path));

	if (specialRule) {
		window = specialRule.window;
		max = specialRule.max;
	}

	for (const plugin of ctx.options.plugins || []) {
		if (plugin.rateLimit) {
			const matchedRule = plugin.rateLimit.find((rule) =>
				rule.pathMatcher(path),
			);
			if (matchedRule) {
				window = matchedRule.window;
				max = matchedRule.max;
				break;
			}
		}
	}

	if (ctx.rateLimit.customRules) {
		const customRule = ctx.rateLimit.customRules[path];
		if (customRule) {
			window = customRule.window;
			max = customRule.max;
		}
	}

	const storage = getRateLimitStorage(ctx);
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

		if (shouldRateLimit(max, window, data)) {
			const retryAfter = getRetryAfter(data.lastRequest, window);
			return rateLimitResponse(retryAfter);
		} else if (timeSinceLastRequest > window * 1000) {
			// Reset the count if the window has passed since the last request
			await storage.set(key, {
				...data,
				count: 1,
				lastRequest: now,
			});
		} else {
			await storage.set(key, {
				...data,
				count: data.count + 1,
				lastRequest: now,
			});
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
