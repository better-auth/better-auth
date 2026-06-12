import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let _ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit {
	if (!_ratelimit) {
		const redis = new Redis({
			url: process.env.UPSTASH_REDIS_REST_URL!,
			token: process.env.UPSTASH_REDIS_REST_TOKEN!,
		});
		_ratelimit = new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(20, "10 m"),
			prefix: "ai-chat",
		});
	}
	return _ratelimit;
}

/**
 * Extract the real client IP from a Vercel-proxied request.
 * Prefer x-real-ip (set by Vercel, cannot be spoofed by clients),
 * then fall back to the first x-forwarded-for entry.
 */
export function getClientIP(req: Request): string {
	const realIp = req.headers.get("x-real-ip");
	if (realIp) return realIp.trim();
	const forwarded = req.headers.get("x-forwarded-for");
	if (forwarded) {
		const ips = forwarded.split(",").map((ip) => ip.trim());
		return ips[0] || "unknown";
	}
	return "unknown";
}

export async function checkRateLimit(ip: string) {
	if (process.env.NODE_ENV !== "production") {
		return {
			success: true,
			limit: 100,
			remaining: 100,
			reset: Date.now() + 1000 * 60 * 10,
		};
	}
	const result = await getRatelimit().limit(ip);
	return {
		success: result.success,
		limit: result.limit,
		remaining: result.remaining,
		reset: result.reset,
	};
}
