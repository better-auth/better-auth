/**
 * Normalizes an IP address for consistent rate limiting.
 *
 * Features:
 * - Normalizes IPv6 to canonical lowercase form
 * - Converts IPv4-mapped IPv6 to IPv4
 * - Supports IPv6 subnet extraction
 * - Handles all edge cases (::1, ::, etc.)
 *
 * Validation is regex-based rather than zod-powered so this module can be
 * imported from client-reachable code paths (e.g. via `utils/host`) without
 * pulling zod into the browser bundle.
 */

interface NormalizeIPOptions {
	/**
	 * For IPv6 addresses, extract the subnet prefix instead of full address.
	 * Common values: 32, 48, 64, 128 (default: 128 = full address)
	 *
	 * @default 128
	 */
	ipv6Subnet?: 128 | 64 | 48 | 32;
}

const IPV4_REGEX =
	/^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Per-group IPv6 hex check (1-4 hex chars). */
const IPV6_GROUP_REGEX = /^[0-9a-fA-F]{1,4}$/;

function isValidIPv4(ip: string): boolean {
	return IPV4_REGEX.test(ip);
}

/**
 * Validate IPv6 by splitting on `:`/`::` and checking each group.
 *
 * Accepts full form, zero-compressed form (`::`), and IPv4-embedded form
 * (e.g. `::ffff:192.0.2.1`, `64:ff9b::192.0.2.1`). Rejects zone-ID suffixes
 * (`%eth0`), multiple `::`, and out-of-range octets or non-hex groups.
 */
function isValidIPv6(ip: string): boolean {
	if (ip.length === 0 || ip.length > 45) return false;
	if (ip.includes("%")) return false;

	const doubleColonCount = ip.split("::").length - 1;
	if (doubleColonCount > 1) return false;

	if (doubleColonCount === 1) {
		const [leftPart = "", rightPart = ""] = ip.split("::");
		const left = leftPart === "" ? [] : leftPart.split(":");
		const right = rightPart === "" ? [] : rightPart.split(":");

		let ipv4Tail = false;
		const lastRight = right[right.length - 1];
		if (lastRight !== undefined && lastRight.includes(".")) {
			if (!isValidIPv4(lastRight)) return false;
			ipv4Tail = true;
		}
		const lastLeft = left[left.length - 1];
		if (lastLeft !== undefined && lastLeft.includes(".")) return false;

		const hexGroups = ipv4Tail
			? [...left, ...right.slice(0, -1)]
			: [...left, ...right];
		for (const group of hexGroups) {
			if (!IPV6_GROUP_REGEX.test(group)) return false;
		}

		const occupied = hexGroups.length + (ipv4Tail ? 2 : 0);
		return occupied < 8;
	}

	const groups = ip.split(":");
	const lastGroup = groups[groups.length - 1];
	if (lastGroup !== undefined && lastGroup.includes(".")) {
		if (groups.length !== 7) return false;
		if (!isValidIPv4(lastGroup)) return false;
		for (const group of groups.slice(0, -1)) {
			if (!IPV6_GROUP_REGEX.test(group)) return false;
		}
		return true;
	}

	if (groups.length !== 8) return false;
	for (const group of groups) {
		if (!IPV6_GROUP_REGEX.test(group)) return false;
	}
	return true;
}

/**
 * Checks if an IP is valid IPv4 or IPv6
 */
export function isValidIP(ip: string): boolean {
	return isValidIPv4(ip) || isValidIPv6(ip);
}

/**
 * Checks if an IP is IPv6
 */
function isIPv6(ip: string): boolean {
	return isValidIPv6(ip);
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
		if (isValidIPv4(ipv4Part)) {
			return ipv4Part;
		}
	}

	// Handle full form: 0:0:0:0:0:ffff:192.0.2.1
	const parts = ipv6.split(":");
	if (parts.length === 7 && parts[5]?.toLowerCase() === "ffff") {
		const ipv4Part = parts[6];
		if (ipv4Part && isValidIPv4(ipv4Part)) {
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
function normalizeIPv6(
	ipv6: string,
	subnetPrefix?: 128 | 32 | 48 | 64,
): string {
	const groups = expandIPv6(ipv6);

	if (subnetPrefix && subnetPrefix < 128) {
		// Apply subnet mask
		const prefix = subnetPrefix;
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
	if (isValidIPv4(ip)) {
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

	// Normalize IPv6
	const subnetPrefix = options.ipv6Subnet || 64;
	return normalizeIPv6(ip, subnetPrefix);
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
