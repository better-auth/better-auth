import type { BetterAuthOptions } from "../types";
import { isTest } from "../utils/env";

export function getIp(
	req: Request | Headers,
	options: BetterAuthOptions,
): string | null {
	if (options.advanced?.ipAddress?.disableIpTracking) {
		return null;
	}
	const testIP = "127.0.0.1";
	if (isTest) {
		return testIP;
	}
	const ipHeaders = options.advanced?.ipAddress?.ipAddressHeaders;
	const keys = ipHeaders || [
		"x-client-ip",
		"x-forwarded-for",
		"cf-connecting-ip",
		"fastly-client-ip",
		"x-real-ip",
		"x-cluster-client-ip",
		"x-forwarded",
		"forwarded-for",
		"forwarded",
	];
	const headers = "headers" in req ? req.headers : req;
	for (const key of keys) {
		const value = "get" in headers ? headers.get(key) : headers[key];
		if (typeof value === "string") {
			const ip = value.split(",")[0].trim();
			if (ip) return ip;
		}
	}
	return null;
}
