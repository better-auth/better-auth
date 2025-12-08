import type { BetterAuthOptions } from "@better-auth/core";
import { isDevelopment, isTest } from "@better-auth/core/env";
import * as z from "zod";

// Localhost IP used for test and development environments
const LOCALHOST_IP = "127.0.0.1";

export function getIp(
	req: Request | Headers,
	options: BetterAuthOptions,
): string | null {
	if (options.advanced?.ipAddress?.disableIpTracking) {
		return null;
	}

	if (isTest() || isDevelopment()) {
		return LOCALHOST_IP;
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
				return ip;
			}
		}
	}
	return null;
}

function isValidIP(ip: string): boolean {
	const ipv4 = z.ipv4().safeParse(ip);

	if (ipv4.success) {
		return true;
	}

	const ipv6 = z.ipv6().safeParse(ip);
	if (ipv6.success) {
		return true;
	}

	return false;
}
