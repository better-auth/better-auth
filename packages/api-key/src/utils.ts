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
import { isValidIP, normalizeIP } from "@better-auth/core/utils/ip";

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

/**
 * Like `getIp`, but always returns the exact address (never a subnet bucket).
 * Used for IP allowlist matching where the configured `ipv6Subnet` would
 * otherwise silently widen matches.
 */
export function getClientIpExact(
	req: Request | Headers,
	options: BetterAuthOptions,
): string | null {
	if (options.advanced?.ipAddress?.disableIpTracking) {
		return null;
	}

	const headers = "headers" in req ? req.headers : req;
	const ipHeaders = options.advanced?.ipAddress?.ipAddressHeaders || [
		"x-forwarded-for",
	];

	for (const key of ipHeaders) {
		const value = "get" in headers ? headers.get(key) : headers[key];
		if (typeof value === "string") {
			const ip = value.split(",")[0]!.trim();
			if (isValidIP(ip)) {
				return normalizeIP(ip, { ipv6Subnet: 128 });
			}
		}
	}

	if (isTest() || isDevelopment()) {
		return LOCALHOST_IP;
	}

	return null;
}

type ParsedCidr =
	| { family: "v4"; network: bigint; prefix: number }
	| { family: "v6"; network: bigint; prefix: number };

function ipv4ToBigInt(ip: string): bigint | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let out = 0n;
	for (const part of parts) {
		if (!/^\d+$/.test(part)) return null;
		const n = Number(part);
		if (n < 0 || n > 255) return null;
		out = (out << 8n) | BigInt(n);
	}
	return out;
}

function ipv6ToBigInt(ip: string): bigint | null {
	// Reject embedded IPv4 here — callers must normalize first.
	if (ip.includes(".")) return null;

	const doubleColonCount = (ip.match(/::/g) || []).length;
	if (doubleColonCount > 1) return null;

	let groups: string[];
	if (doubleColonCount === 1) {
		const [head, tail] = ip.split("::");
		const headGroups = head ? head.split(":") : [];
		const tailGroups = tail ? tail.split(":") : [];
		const missing = 8 - headGroups.length - tailGroups.length;
		if (missing < 0) return null;
		groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
	} else {
		groups = ip.split(":");
	}

	if (groups.length !== 8) return null;
	let out = 0n;
	for (const g of groups) {
		if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
		out = (out << 16n) | BigInt(Number.parseInt(g, 16));
	}
	return out;
}

export function parseCidr(entry: string): ParsedCidr | null {
	if (typeof entry !== "string" || entry.length === 0) return null;
	const slash = entry.indexOf("/");
	const host = slash === -1 ? entry : entry.slice(0, slash);
	const prefixStr = slash === -1 ? null : entry.slice(slash + 1);
	if (!isValidIP(host)) return null;

	const normalized = normalizeIP(host, { ipv6Subnet: 128 });
	if (normalized.includes(".")) {
		const value = ipv4ToBigInt(normalized);
		if (value === null) return null;
		const prefix = prefixStr === null ? 32 : Number(prefixStr);
		if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
		const mask =
			prefix === 0 ? 0n : (0xffffffffn << BigInt(32 - prefix)) & 0xffffffffn;
		return { family: "v4", network: value & mask, prefix };
	}

	const value = ipv6ToBigInt(normalized);
	if (value === null) return null;
	const prefix = prefixStr === null ? 128 : Number(prefixStr);
	if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return null;
	const fullMask = (1n << 128n) - 1n;
	const mask =
		prefix === 0 ? 0n : (fullMask << BigInt(128 - prefix)) & fullMask;
	return { family: "v6", network: value & mask, prefix };
}

export function isValidCidr(entry: string): boolean {
	return parseCidr(entry) !== null;
}

export function matchesAnyCidr(ip: string, cidrs: string[]): boolean {
	if (!isValidIP(ip)) return false;
	const normalized = normalizeIP(ip, { ipv6Subnet: 128 });
	const isV4 = normalized.includes(".");
	const ipValue = isV4 ? ipv4ToBigInt(normalized) : ipv6ToBigInt(normalized);
	if (ipValue === null) return false;

	for (const entry of cidrs) {
		const parsed = parseCidr(entry);
		if (!parsed) continue;
		if ((parsed.family === "v4") !== isV4) continue;
		const maskWidth = isV4 ? 32 : 128;
		const fullMask = isV4 ? 0xffffffffn : (1n << 128n) - 1n;
		const mask =
			parsed.prefix === 0
				? 0n
				: (fullMask << BigInt(maskWidth - parsed.prefix)) & fullMask;
		if ((ipValue & mask) === parsed.network) return true;
	}

	return false;
}
