import type { BetterAuthOptions } from "../types";
import { isDevelopment, isTest } from "../utils/env";
import { z } from "zod";

export function getIp(
	req: Request | Headers,
	options: BetterAuthOptions,
): string | null {
	if (options.advanced?.ipAddress?.disableIpTracking) {
		return null;
	}

	if (isTest()) {
		return "127.0.0.1"; // Use a fixed IP for test environments
	}
	if (isDevelopment) {
		return "127.0.0.1"; // Use a fixed IP for development environments
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
