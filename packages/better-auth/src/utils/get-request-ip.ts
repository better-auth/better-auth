import type { BetterAuthOptions } from "@better-auth/core";
import { isDevelopment, isTest } from "@better-auth/core/env";
import { isValidIP, normalizeIP } from "@better-auth/core/utils";

// Localhost IP used for test and development environments
const LOCALHOST_IP = "127.0.0.1";

export function getIp(
	req: Request | Headers,
	options: BetterAuthOptions,
): string | null {
	if (options.advanced?.ipAddress?.disableIpTracking) {
		return null;
	}

	const headers = "headers" in req ? req.headers : req;

	const defaultHeaders = ["x-forwarded-for"];

	const ipHeaders =
		options.advanced?.ipAddress?.ipAddressHeaders || defaultHeaders;

	for (const key of ipHeaders) {
		const value = "get" in headers ? headers.get(key) : headers[key];
		if (typeof value === "string") {
			const ip = value.split(",")[0]!.trim();
			if (isValidIP(ip)) {
				return normalizeIP(ip, {
					ipv6Subnet: options.advanced?.ipAddress?.ipv6Subnet,
				});
			}
		}
	}

	// Fallback to localhost IP in development/test environments when no IP found in headers
	if (isTest() || isDevelopment()) {
		return LOCALHOST_IP;
	}

	return null;
}
