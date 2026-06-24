import { APIError } from "@better-auth/core/error";
import { APIError as BaseAPIError } from "better-auth/api";

export const getDate = (span: number, unit: "sec" | "ms" = "ms") => {
	return new Date(Date.now() + (unit === "sec" ? span * 1000 : span));
};

export function isAPIError(error: unknown): error is APIError {
	return (
		error instanceof BaseAPIError ||
		error instanceof APIError ||
		(error as any)?.name === "APIError"
	);
}

import type { BetterAuthOptions } from "@better-auth/core";
import { isDevelopment, isTest } from "@better-auth/core/env";
import { getIPFromHeader } from "@better-auth/core/utils/ip";

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
			const ip = getIPFromHeader(value, {
				ipv6Subnet: options.advanced?.ipAddress?.ipv6Subnet,
				trustedProxies: options.advanced?.ipAddress?.trustedProxies,
			});
			if (ip) {
				return ip;
			}
		}
	}

	// Fallback to localhost IP in development/test environments when no IP found in headers
	if (isTest() || isDevelopment()) {
		return LOCALHOST_IP;
	}

	return null;
}
