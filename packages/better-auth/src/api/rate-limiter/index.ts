import type {
	AuthContext,
	BetterAuthRateLimitStorage,
} from "@better-auth/core";
import { createRateLimitKey, getIp } from "@better-auth/core/utils/ip";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { normalizePathname } from "@better-auth/core/utils/url";
import type { RateLimit } from "../../types";
import { wildcardMatch } from "../../utils/wildcard";

interface MemoryRateLimitEntry {
	data: RateLimit;
	expiresAt: number;
}

const memory = new Map<string, MemoryRateLimitEntry>();

// Cap the in-process store so a flood of distinct keys (e.g. spoofed IPs)
// cannot grow it without bound. Sweeping expired entries on each access keeps
// the live set small; the cap is the hard ceiling once everything is fresh.
const MEMORY_STORE_MAX_ENTRIES = 100_000;

function pruneMemoryStore() {
	const now = Date.now();
	for (const [key, entry] of memory) {
		if (now >= entry.expiresAt) {
			memory.delete(key);
		}
	}
	if (memory.size <= MEMORY_STORE_MAX_ENTRIES) {
		return;
	}
	// Map preserves insertion order, so the oldest keys come first.
	const overflow = memory.size - MEMORY_STORE_MAX_ENTRIES;
	let removed = 0;
	for (const key of memory.keys()) {
		memory.delete(key);
		if (++removed >= overflow) {
			break;
		}
	}
}

/**
 * Decide an atomic rate-limit step against an in-memory `RateLimit` snapshot
 * for the rolling `window` (seconds) and `max`. Shared by the memory backend
 * (read-decide-write is atomic under single-threaded JS) and as the fallback
 * for storages lacking an atomic primitive.
 */
function decideConsume(
	data: RateLimit | null | undefined,
	rule: { window: number; max: number },
	now: number,
): {
	next: RateLimit;
	update: boolean;
	allowed: boolean;
	retryAfter: number | null;
} {
	const windowInMs = rule.window * 1000;
	if (!data) {
		return {
			next: { key: "", count: 1, lastRequest: now },
			update: false,
			allowed: true,
			retryAfter: null,
		};
	}
	const timeSinceLastRequest = now - data.lastRequest;
	if (timeSinceLastRequest > windowInMs) {
		return {
			next: { ...data, count: 1, lastRequest: now },
			update: true,
			allowed: true,
			retryAfter: null,
		};
	}
	if (data.count >= rule.max) {
		return {
			next: data,
			update: true,
			allowed: false,
			retryAfter: getRetryAfter(data.lastRequest, rule.window),
		};
	}
	return {
		next: { ...data, count: data.count + 1, lastRequest: now },
		update: true,
		allowed: true,
		retryAfter: null,
	};
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
	const readRow = async (key: string) => {
		const res = await db.findMany<RateLimit>({
			model,
			where: [{ field: "key", value: key }],
		});
		const data = res[0];
		if (typeof data?.lastRequest === "bigint") {
			data.lastRequest = Number(data.lastRequest);
		}
		return data;
	};

	const consume = async (
		key: string,
		rule: { window: number; max: number },
	): Promise<{ allowed: boolean; retryAfter: number | null }> => {
		const windowInMs = rule.window * 1000;
		const data = await readRow(key);
		const now = Date.now();

		// Fresh key: open the window only by creating the row. An update here
		// would reset the count for a key a concurrent request already opened,
		// letting every racer pass; creating instead means one request opens the
		// window and the rest fall through to re-read and be counted.
		if (!data) {
			try {
				await db.create({
					model,
					data: { key, count: 1, lastRequest: now },
				});
				return { allowed: true, retryAfter: null };
			} catch (error) {
				// The create either lost a race against a concurrent opener (the row
				// now exists) or failed for a real reason. Re-read once: re-decide
				// only when the row is now present, otherwise surface the original
				// error rather than retrying a genuine failure indefinitely.
				const existing = await readRow(key);
				if (!existing) {
					throw error;
				}
				return consume(key, rule);
			}
		}

		const timeSinceLastRequest = now - data.lastRequest;

		// Window elapsed: reset to a single request, guarded on the window so a
		// concurrent increment in a new window cannot be clobbered.
		if (timeSinceLastRequest > windowInMs) {
			const reset = await db.incrementOne<RateLimit>({
				model,
				where: [
					{ field: "key", value: key },
					{
						field: "lastRequest",
						operator: "lte",
						value: data.lastRequest,
					},
				],
				increment: {},
				set: { count: 1, lastRequest: now },
			});
			if (reset) {
				deleteExpiredRows(now);
				return { allowed: true, retryAfter: null };
			}
			return consume(key, rule);
		}

		// Within the window and under the max: increment guarded on both the
		// window and the max, so a burst of concurrent requests can never exceed
		// the limit.
		const windowStart = now - windowInMs;
		const incremented = await db.incrementOne<RateLimit>({
			model,
			where: [
				{ field: "key", value: key },
				{ field: "lastRequest", operator: "gt", value: windowStart },
				{ field: "count", operator: "lt", value: rule.max },
			],
			increment: { count: 1 },
			set: { lastRequest: now },
		});
		if (incremented) {
			return { allowed: true, retryAfter: null };
		}

		// Guard missed: the window rolled or the max was reached between the read
		// and the write. Re-read and re-decide.
		const fresh = await readRow(key);
		if (!fresh) {
			return consume(key, rule);
		}
		if (now - fresh.lastRequest > windowInMs) {
			return consume(key, rule);
		}
		return {
			allowed: false,
			retryAfter: getRetryAfter(fresh.lastRequest, rule.window),
		};
	};

	// Best-effort sweep of clearly-expired rows to bound table growth. A failure
	// here never blocks the request.
	const deleteExpiredRows = (now: number) => {
		const longestWindow = Math.max(
			ctx.rateLimit.window,
			...getDefaultSpecialRules().map((r) => r.window),
		);
		const cutoff = now - longestWindow * 1000;
		ctx.runInBackground(
			db
				.deleteMany({
					model,
					where: [{ field: "lastRequest", operator: "lt", value: cutoff }],
				})
				.then(() => undefined)
				.catch((e) => ctx.logger.error("Error pruning rate limit rows", e)),
		);
	};

	return {
		get: readRow,
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
		consume,
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
		const ttlFor = (window: number) =>
			window ?? ctx.options.rateLimit?.window ?? 10;
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
				await ctx.options.secondaryStorage?.set?.(
					key,
					JSON.stringify(value),
					ttlFor(rateLimitSettings.window),
				);
			},
			consume: ctx.options.secondaryStorage?.increment
				? async (key, rule) => {
						// `increment` creates the counter with `ttl = window` on first
						// use and never extends it, so the counter expires a fixed
						// window after it opened. The post-increment value is the
						// request count within that window.
						const count = await ctx.options.secondaryStorage!.increment!(
							key,
							ttlFor(rule.window),
						);
						if (count <= rule.max) {
							return { allowed: true, retryAfter: null };
						}
						return { allowed: false, retryAfter: rule.window };
					}
				: undefined,
		};
	} else if (storage === "memory") {
		const ttlFor = (window: number) =>
			window ?? ctx.options.rateLimit?.window ?? 10;
		return {
			async get(key: string) {
				const entry = memory.get(key);
				if (!entry) {
					return null;
				}
				if (Date.now() >= entry.expiresAt) {
					memory.delete(key);
					return null;
				}
				return entry.data;
			},
			async set(key: string, value: RateLimit, _update?: boolean | undefined) {
				const expiresAt = Date.now() + ttlFor(rateLimitSettings.window) * 1000;
				memory.set(key, { data: value, expiresAt });
			},
			// Single-threaded JS makes this read-decide-write atomic: no other
			// request runs between the `memory.get` and the `memory.set` below.
			async consume(key, rule) {
				pruneMemoryStore();
				const now = Date.now();
				const entry = memory.get(key);
				const current = entry && now < entry.expiresAt ? entry.data : undefined;
				const decision = decideConsume(current, rule, now);
				if (decision.allowed) {
					memory.set(key, {
						data: { ...decision.next, key },
						expiresAt: now + ttlFor(rule.window) * 1000,
					});
				}
				return {
					allowed: decision.allowed,
					retryAfter: decision.retryAfter,
				};
			},
		};
	}
	return createDatabaseStorageWrapper(ctx);
}

let ipWarningLogged = false;

// Sentinel IP segment for the shared rate-limit bucket used when no trusted
// client IP can be derived. It is not a valid IP, so it never collides with a
// real client IP key.
const NO_TRUSTED_IP_KEY = "no-trusted-ip";

async function resolveRateLimitConfig(req: Request, ctx: AuthContext) {
	const basePath = new URL(ctx.baseURL).pathname;
	const path = normalizePathname(req.url, basePath);
	let currentWindow = ctx.rateLimit.window;
	let currentMax = ctx.rateLimit.max;
	const ip = getIp(req, ctx.options);
	if (!ip && ctx.options.advanced?.ipAddress?.disableIpTracking) {
		// IP tracking is explicitly disabled; per-IP rate limiting does not apply.
		return null;
	}
	if (!ip && !ipWarningLogged) {
		ctx.logger.warn(
			"Rate limiting could not determine a client IP and is falling back to a " +
				"single shared per-path bucket. Ensure your runtime forwards a trusted " +
				"client IP header, then set `advanced.ipAddress.ipAddressHeaders` or " +
				"`advanced.ipAddress.trustedProxies` so the address can be resolved.",
		);
		ipWarningLogged = true;
	}
	// Fail closed when no client IP can be derived: key on a shared per-path
	// bucket and still enforce the limit, instead of skipping rate limiting
	// entirely (which let a client omit the IP header to bypass the limit).
	const key = createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path);
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
				return null;
			}
		}
	}

	return { key, currentWindow, currentMax };
}

let legacyFallbackWarningLogged = false;

/**
 * Decides the rate limit for the request in a single atomic step. The whole
 * check-and-increment happens here in the request phase; there is no separate
 * response-phase write-back, so concurrent requests cannot all pass a stale
 * read before any increment lands.
 */
export async function onRequestRateLimit(req: Request, ctx: AuthContext) {
	if (!ctx.rateLimit.enabled) {
		return;
	}
	const config = await resolveRateLimitConfig(req, ctx);
	if (!config) {
		return;
	}
	const { key, currentWindow, currentMax } = config;

	const storage = getRateLimitStorage(ctx, {
		window: currentWindow,
	});
	const rule = { window: currentWindow, max: currentMax };

	if (storage.consume) {
		const { allowed, retryAfter } = await storage.consume(key, rule);
		if (!allowed) {
			return rateLimitResponse(retryAfter ?? currentWindow);
		}
		return;
	}

	return legacyConsume(ctx, storage, key, rule);
}

/**
 * Non-atomic check-then-increment for storages that do not implement `consume`
 * (custom storages, or secondary storages without `increment`). Under
 * concurrency this is best-effort: simultaneous requests can each pass the
 * check before either write lands.
 *
 * FIXME(rate-limit-consume-required): remove on `next` once `consume` is the
 * sole required member of the storage contract.
 */
async function legacyConsume(
	ctx: AuthContext,
	storage: BetterAuthRateLimitStorage,
	key: string,
	rule: { window: number; max: number },
) {
	if (!legacyFallbackWarningLogged) {
		ctx.logger.warn(
			"Rate limiting is best-effort: the configured storage has no atomic " +
				"`consume`, so concurrent requests may bypass the limit. Provide a " +
				"storage that implements `consume` for strict enforcement.",
		);
		legacyFallbackWarningLogged = true;
	}

	const data = await storage.get(key);
	const decision = decideConsume(data, rule, Date.now());
	if (!decision.allowed) {
		return rateLimitResponse(decision.retryAfter ?? rule.window);
	}
	await storage.set(key, { ...decision.next, key }, decision.update);
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
		{
			pathMatcher(path: string) {
				return (
					path === "/request-password-reset" ||
					path === "/send-verification-email" ||
					path.startsWith("/forget-password") ||
					path === "/email-otp/send-verification-otp" ||
					path === "/email-otp/request-password-reset"
				);
			},
			window: 60,
			max: 3,
		},
	];
	return specialRules;
}
