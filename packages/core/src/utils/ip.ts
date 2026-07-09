import * as z from "zod";
import { isDevelopment, isTest } from "../env";
import type { BetterAuthOptions } from "../types";

/**
 * Normalizes an IP address for consistent rate limiting.
 *
 * Features:
 * - Normalizes IPv6 to canonical lowercase form
 * - Converts IPv4-mapped IPv6 to IPv4
 * - Supports IPv6 subnet extraction
 * - Handles all edge cases (::1, ::, etc.)
 */

interface NormalizeIPOptions {
	/**
	 * Prefix length used to collapse IPv6 addresses before keying.
	 * Any integer from 0 to 128 is accepted. Common values: 32, 48, 56, 64, 128.
	 * Values outside 0-128 are clamped.
	 *
	 * @default 64
	 */
	ipv6Subnet?: number;
}

/**
 * Checks if an IP is valid IPv4 or IPv6
 */
export function isValidIP(ip: string): boolean {
	return z.ipv4().safeParse(ip).success || z.ipv6().safeParse(ip).success;
}

/**
 * Checks if an IP is IPv6
 */
function isIPv6(ip: string): boolean {
	return z.ipv6().safeParse(ip).success;
}

/**
 * Converts IPv4-mapped IPv6 address to IPv4
 * e.g., "::ffff:192.0.2.1" -> "192.0.2.1"
 */
function extractIPv4FromMapped(ipv6: string): string | null {
	const lower = ipv6.toLowerCase();

	// Handle ::ffff:192.0.2.1 format
	if (lower.startsWith("::ffff:")) {
		const ipv4Part = lower.substring(7);
		// Check if it's a valid IPv4
		if (z.ipv4().safeParse(ipv4Part).success) {
			return ipv4Part;
		}
	}

	// Handle full form: 0:0:0:0:0:ffff:192.0.2.1
	const parts = ipv6.split(":");
	if (parts.length === 7 && parts[5]?.toLowerCase() === "ffff") {
		const ipv4Part = parts[6];
		if (ipv4Part && z.ipv4().safeParse(ipv4Part).success) {
			return ipv4Part;
		}
	}

	// Handle hex-encoded IPv4 in mapped address
	// e.g., ::ffff:c000:0201 -> 192.0.2.1
	if (lower.includes("::ffff:") || lower.includes(":ffff:")) {
		const groups = expandIPv6(ipv6);
		if (
			groups.length === 8 &&
			groups[0] === "0000" &&
			groups[1] === "0000" &&
			groups[2] === "0000" &&
			groups[3] === "0000" &&
			groups[4] === "0000" &&
			groups[5] === "ffff" &&
			groups[6] &&
			groups[7]
		) {
			// Convert last two groups to IPv4
			const byte1 = Number.parseInt(groups[6].substring(0, 2), 16);
			const byte2 = Number.parseInt(groups[6].substring(2, 4), 16);
			const byte3 = Number.parseInt(groups[7].substring(0, 2), 16);
			const byte4 = Number.parseInt(groups[7].substring(2, 4), 16);
			return `${byte1}.${byte2}.${byte3}.${byte4}`;
		}
	}

	return null;
}

/**
 * Expands a compressed IPv6 address to full form
 * e.g., "2001:db8::1" -> ["2001", "0db8", "0000", "0000", "0000", "0000", "0000", "0001"]
 */
function expandIPv6(ipv6: string): string[] {
	// Handle :: notation (zero compression)
	if (ipv6.includes("::")) {
		const sides = ipv6.split("::");
		const left = sides[0] ? sides[0].split(":") : [];
		const right = sides[1] ? sides[1].split(":") : [];

		// Calculate missing groups
		const totalGroups = 8;
		const missingGroups = totalGroups - left.length - right.length;
		const zeros = Array(missingGroups).fill("0000");

		// Pad existing groups to 4 digits
		const paddedLeft = left.map((g) => g.padStart(4, "0"));
		const paddedRight = right.map((g) => g.padStart(4, "0"));

		return [...paddedLeft, ...zeros, ...paddedRight];
	}

	// No compression, just pad each group
	return ipv6.split(":").map((g) => g.padStart(4, "0"));
}

/**
 * Normalizes an IPv6 address to canonical form
 * e.g., "2001:DB8::1" -> "2001:0db8:0000:0000:0000:0000:0000:0001"
 */
function normalizeIPv6(ipv6: string, subnetPrefix?: number): string {
	const groups = expandIPv6(ipv6);

	if (subnetPrefix !== undefined && subnetPrefix < 128) {
		// Clamp to a valid bit range so out-of-spec inputs degrade safely:
		// negative or fractional values would otherwise produce malformed masks.
		const prefix = Math.max(0, Math.floor(subnetPrefix));
		let bitsRemaining: number = prefix;

		const maskedGroups = groups.map((group) => {
			if (bitsRemaining <= 0) {
				return "0000";
			}
			if (bitsRemaining >= 16) {
				bitsRemaining -= 16;
				return group;
			}

			// Partial mask for this group
			const value = Number.parseInt(group, 16);
			const mask = (0xffff << (16 - bitsRemaining)) & 0xffff;
			const masked = value & mask;
			bitsRemaining = 0;
			return masked.toString(16).padStart(4, "0");
		});

		return maskedGroups.join(":").toLowerCase();
	}

	return groups.join(":").toLowerCase();
}

/**
 * Normalizes an IP address (IPv4 or IPv6) for consistent rate limiting.
 *
 * @param ip - The IP address to normalize
 * @param options - Normalization options
 * @returns Normalized IP address
 *
 * @example
 * normalizeIP("2001:DB8::1")
 * // -> "2001:0db8:0000:0000:0000:0000:0000:0000"
 *
 * @example
 * normalizeIP("::ffff:192.0.2.1")
 * // -> "192.0.2.1" (converted to IPv4)
 *
 * @example
 * normalizeIP("2001:db8::1", { ipv6Subnet: 64 })
 * // -> "2001:0db8:0000:0000:0000:0000:0000:0000" (subnet /64)
 */
export function normalizeIP(
	ip: string,
	options: NormalizeIPOptions = {},
): string {
	// IPv4 addresses are already normalized
	if (z.ipv4().safeParse(ip).success) {
		return ip.toLowerCase();
	}

	// Check if it's IPv6
	if (!isIPv6(ip)) {
		// Return as-is if not valid (shouldn't happen due to prior validation)
		return ip.toLowerCase();
	}

	// Check for IPv4-mapped IPv6
	const ipv4 = extractIPv4FromMapped(ip);
	if (ipv4) {
		return ipv4.toLowerCase();
	}

	// Normalize IPv6. Use ?? so an explicit 0 (mask-all) is honoured.
	const subnetPrefix = options.ipv6Subnet ?? 64;
	return normalizeIPv6(ip, subnetPrefix);
}

/**
 * Raw bytes of an IP for CIDR comparison. Returns `null` for an invalid IP.
 */
function ipToBytes(ip: string): Uint8Array | null {
	if (z.ipv4().safeParse(ip).success) {
		return Uint8Array.from(ip.split(".").map((octet) => Number(octet)));
	}
	if (!isIPv6(ip)) {
		return null;
	}
	const mapped = extractIPv4FromMapped(ip);
	if (mapped) {
		return Uint8Array.from(mapped.split(".").map((octet) => Number(octet)));
	}
	const groups = expandIPv6(ip);
	const bytes = new Uint8Array(16);
	for (let i = 0; i < 8; i++) {
		const group = Number.parseInt(groups[i] ?? "0", 16);
		bytes[i * 2] = (group >> 8) & 0xff;
		bytes[i * 2 + 1] = group & 0xff;
	}
	return bytes;
}

// A CIDR prefix length must be decimal digits only, so values like "8x" or
// "1e3" that `Number()` would otherwise coerce are rejected.
const CIDR_PREFIX_PATTERN = /^\d+$/;

/**
 * Parses an IP or `IP/prefix` string into network bytes and a prefix length.
 * The prefix must be digits only and within the address family. `null` if the
 * value is not a valid IP or CIDR range, which keeps a malformed entry from
 * silently behaving like a non-match.
 */
function parseCIDR(
	value: string,
): { bytes: Uint8Array; prefix: number } | null {
	const slash = value.lastIndexOf("/");
	const bytes = ipToBytes(slash === -1 ? value : value.slice(0, slash));
	if (!bytes) {
		return null;
	}
	const maxBits = bytes.length * 8;
	if (slash === -1) {
		return { bytes, prefix: maxBits };
	}
	const prefixPart = value.slice(slash + 1);
	if (!CIDR_PREFIX_PATTERN.test(prefixPart)) {
		return null;
	}
	const prefix = Number(prefixPart);
	return prefix <= maxBits ? { bytes, prefix } : null;
}

/**
 * Whether `ipBytes` falls inside an already-parsed CIDR network.
 */
function matchesCIDR(
	ipBytes: Uint8Array,
	net: { bytes: Uint8Array; prefix: number },
): boolean {
	if (ipBytes.length !== net.bytes.length) {
		return false;
	}
	let bitsRemaining = net.prefix;
	for (let i = 0; i < ipBytes.length && bitsRemaining > 0; i++) {
		const take = bitsRemaining >= 8 ? 8 : bitsRemaining;
		const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff;
		if (((ipBytes[i] ?? 0) & mask) !== ((net.bytes[i] ?? 0) & mask)) {
			return false;
		}
		bitsRemaining -= 8;
	}
	return true;
}

/**
 * Trusted-proxy entries that are not a valid IP address or CIDR range.
 */
export function findInvalidTrustedProxies(entries: string[]): string[] {
	return entries.filter((entry) => parseCIDR(entry) === null);
}

/**
 * Resolves the client IP from a forwarded header. The leftmost token is spoofable,
 * so with `trustedProxies` the chain is stripped from the right to the first
 * untrusted hop. Otherwise only a single-value header is trusted. Returns `null`
 * when no trustworthy client IP can be resolved.
 */
export function getIPFromHeader(
	value: string,
	options: {
		ipv6Subnet?: number;
		trustedProxies?: string[];
	} = {},
): string | null {
	const forwardedIps = value
		.split(",")
		.map((ip) => ip.trim())
		.filter(Boolean);
	if (forwardedIps.length === 0) {
		return null;
	}

	// Parse trusted proxies once, dropping malformed entries so a config typo
	// cannot leave the chain enabled-but-empty and return a real proxy hop as
	// the client. With no valid proxy the chain mode does not engage.
	const trustedProxies = (options.trustedProxies ?? [])
		.map(parseCIDR)
		.filter((proxy): proxy is { bytes: Uint8Array; prefix: number } => {
			return proxy !== null;
		});

	if (trustedProxies.length > 0) {
		for (let i = forwardedIps.length - 1; i >= 0; i--) {
			const ip = forwardedIps[i];
			const ipBytes = ip ? ipToBytes(ip) : null;
			// A malformed hop breaks the chain: fail closed.
			if (!ip || !ipBytes) {
				return null;
			}
			if (trustedProxies.some((proxy) => matchesCIDR(ipBytes, proxy))) {
				continue;
			}
			return normalizeIP(ip, { ipv6Subnet: options.ipv6Subnet });
		}
		return null;
	}

	// Without valid trusted proxies a multi-hop chain is unresolvable.
	if (forwardedIps.length !== 1) {
		return null;
	}
	const selectedIp = forwardedIps[0];
	if (!selectedIp || !isValidIP(selectedIp)) {
		return null;
	}

	return normalizeIP(selectedIp, { ipv6Subnet: options.ipv6Subnet });
}

const LOCALHOST_IP = "127.0.0.1";
const DEFAULT_IP_HEADERS = ["x-forwarded-for"];

/**
 * Resolves the client IP for a request from the configured IP headers.
 * Honors `disableIpTracking`, walks `ipAddressHeaders` in order (default
 * `x-forwarded-for`), and falls back to localhost in development and test.
 * Returns `null` when tracking is disabled or no trustworthy IP can be resolved.
 */
export function getIp(
	req: Request | Headers,
	options: BetterAuthOptions,
): string | null {
	if (options.advanced?.ipAddress?.disableIpTracking) {
		return null;
	}

	const headers = "headers" in req ? req.headers : req;

	const ipHeaders =
		options.advanced?.ipAddress?.ipAddressHeaders || DEFAULT_IP_HEADERS;

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

	if (isTest() || isDevelopment()) {
		return LOCALHOST_IP;
	}

	return null;
}

/**
 * Creates a rate limit key from IP and path
 * Uses a separator to prevent collision attacks
 *
 * @param ip - The IP address (should be normalized)
 * @param path - The request path
 * @returns Rate limit key
 */
export function createRateLimitKey(ip: string, path: string): string {
	// Use | as separator to prevent collision attacks
	// e.g., "192.0.2.1" + "/sign-in" vs "192.0.2" + ".1/sign-in"
	return `${ip}|${path}`;
}
