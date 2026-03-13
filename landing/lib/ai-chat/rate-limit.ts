import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
	url: process.env.UPSTASH_REDIS_REST_URL!,
	token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(20, "10 m"),
	prefix: "ai-chat",
});

/**
 * Extract the real client IP from a Vercel-proxied request.
 * Vercel appends the connecting IP as the rightmost value in x-forwarded-for.
 */
export function getClientIP(req: Request): string {
	const forwarded = req.headers.get("x-forwarded-for");
	if (forwarded) {
		const ips = forwarded.split(",").map((ip) => ip.trim());
		return ips[0] || "unknown";
	}
	const realIp = req.headers.get("x-real-ip");
	if (realIp) return realIp.trim();
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
	const result = await ratelimit.limit(ip);
	return {
		success: result.success,
		limit: result.limit,
		remaining: result.remaining,
		reset: result.reset,
	};
}
