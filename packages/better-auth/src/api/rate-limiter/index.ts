import type { AuthContext } from "@better-auth/core";
import { getIP } from "@better-auth/core/utils/ip";
import { normalizePathname } from "@better-auth/core/utils/url";
import type {
	RateLimitPolicy,
	RateLimitStorage,
} from "@better-auth/rate-limit";
import {
	createMemoryRateLimitStorage,
	createRateLimiter,
	fixedWindow,
} from "@better-auth/rate-limit";
import { wildcardMatch } from "../../utils/wildcard";
import { createDatabaseRateLimitStorage } from "./database-storage";

const REQUEST_RATE_LIMIT_NAMESPACE = "better-auth.request";
const NO_TRUSTED_IP_KEY = "no-trusted-ip";

const defaultSpecialRules = [
	{
		pathMatcher(path: string) {
			return (
				matchesPathPrefix(path, "/sign-in") ||
				matchesPathPrefix(path, "/sign-up") ||
				matchesPathPrefix(path, "/change-password") ||
				matchesPathPrefix(path, "/change-email")
			);
		},
		policy: fixedWindow({ limit: 3, windowMs: 10_000 }),
	},
	{
		pathMatcher(path: string) {
			return (
				path === "/request-password-reset" ||
				path === "/send-verification-email" ||
				matchesPathPrefix(path, "/forget-password") ||
				path === "/email-otp/send-verification-otp" ||
				path === "/email-otp/request-password-reset"
			);
		},
		policy: fixedWindow({ limit: 3, windowMs: 60_000 }),
	},
];

const storageByInternalAdapter = new WeakMap<object, RateLimitStorage>();
let ipWarningLogged = false;

export async function onRequestRateLimit(req: Request, ctx: AuthContext) {
	if (!ctx.rateLimit.enabled) {
		return;
	}

	const resolved = await resolveRateLimitRequest(req, ctx);
	if (!resolved) {
		return;
	}

	const limiter = createRateLimiter({
		namespace: REQUEST_RATE_LIMIT_NAMESPACE,
		storage: getRateLimitStorage(ctx),
	});
	const result = await limiter.consume(resolved);
	if (result.allowed) {
		return;
	}

	const retryAfterMs =
		result.retryAfterMs ?? Math.max(0, result.resetAt - Date.now());
	return rateLimitResponse(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

async function resolveRateLimitRequest(req: Request, ctx: AuthContext) {
	const basePath = new URL(ctx.baseURL).pathname;
	const path = normalizePathname(req.url, basePath);
	let policy: RateLimitPolicy = ctx.rateLimit.policy;
	const specialRule = defaultSpecialRules.find((rule) =>
		rule.pathMatcher(path),
	);
	if (specialRule) {
		policy = specialRule.policy;
	}

	for (const plugin of ctx.options.plugins ?? []) {
		const matchedRule = plugin.rateLimit?.find((rule) =>
			rule.pathMatcher(path),
		);
		if (matchedRule) {
			policy = matchedRule.policy;
			break;
		}
	}

	const configuredRule = findConfiguredRule(ctx.rateLimit.rules, path);
	if (configuredRule !== undefined) {
		const resolved =
			typeof configuredRule === "function"
				? await configuredRule(req, policy)
				: configuredRule;
		if (resolved === false) {
			return null;
		}
		policy = resolved;
	}

	const ip = getIP(req, ctx.options);
	const key = await resolveRateLimitKey(req, ctx, path, ip);
	if (key === null) {
		return null;
	}

	return { scope: path, key, policy };
}

async function resolveRateLimitKey(
	request: Request,
	ctx: AuthContext,
	path: string,
	ip: string | null,
): Promise<string | null> {
	if (ctx.rateLimit.key) {
		return ctx.rateLimit.key({ request, path, ip });
	}
	if (!ip && ctx.options.advanced?.ipAddress?.disableIpTracking) {
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
	return ip ?? NO_TRUSTED_IP_KEY;
}

function findConfiguredRule(
	rules: AuthContext["rateLimit"]["rules"],
	path: string,
) {
	if (!rules) {
		return undefined;
	}
	if (Object.hasOwn(rules, path)) {
		return rules[path];
	}
	const pattern = Object.keys(rules).find((candidate) =>
		candidate.includes("*") ? wildcardMatch(candidate)(path) : false,
	);
	return pattern === undefined ? undefined : rules[pattern];
}

function matchesPathPrefix(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

function getRateLimitStorage(ctx: AuthContext): RateLimitStorage {
	if (ctx.rateLimit.customStorage) {
		return ctx.rateLimit.customStorage;
	}

	const cached = storageByInternalAdapter.get(ctx.internalAdapter);
	if (cached) {
		return cached;
	}

	const storage =
		ctx.rateLimit.storage === "database"
			? createDatabaseRateLimitStorage(ctx)
			: createMemoryRateLimitStorage();
	storageByInternalAdapter.set(ctx.internalAdapter, storage);
	return storage;
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
				"Cache-Control": "no-store",
				"Content-Type": "application/json",
				"Retry-After": retryAfter.toString(),
			},
		},
	);
}
