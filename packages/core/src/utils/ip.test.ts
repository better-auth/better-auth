import { describe, expect, it } from "vitest";
import { createRateLimitKey, isValidIP, normalizeIP } from "./ip";

describe("IP Normalization", () => {
	describe("isValidIP", () => {
		it("should validate IPv4 addresses", () => {
			expect(isValidIP("192.168.1.1")).toBe(true);
			expect(isValidIP("127.0.0.1")).toBe(true);
			expect(isValidIP("0.0.0.0")).toBe(true);
			expect(isValidIP("255.255.255.255")).toBe(true);
		});

		it("should validate IPv6 addresses", () => {
			expect(isValidIP("2001:db8::1")).toBe(true);
			expect(isValidIP("::1")).toBe(true);
			expect(isValidIP("::")).toBe(true);
			expect(isValidIP("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(true);
		});

		it("should reject invalid IPs", () => {
			expect(isValidIP("not-an-ip")).toBe(false);
			expect(isValidIP("999.999.999.999")).toBe(false);
			expect(isValidIP("gggg::1")).toBe(false);
		});
	});

	describe("IPv4 Normalization", () => {
		it("should return IPv4 addresses unchanged", () => {
			expect(normalizeIP("192.168.1.1")).toBe("192.168.1.1");
			expect(normalizeIP("127.0.0.1")).toBe("127.0.0.1");
			expect(normalizeIP("10.0.0.1")).toBe("10.0.0.1");
		});
	});

	describe("IPv6 Normalization", () => {
		it("should normalize compressed IPv6 to full form", () => {
			expect(normalizeIP("2001:db8::1", { ipv6Subnet: 128 })).toBe(
				"2001:0db8:0000:0000:0000:0000:0000:0001",
			);
			expect(normalizeIP("::1", { ipv6Subnet: 128 })).toBe(
				"0000:0000:0000:0000:0000:0000:0000:0001",
			);
			expect(normalizeIP("::", { ipv6Subnet: 128 })).toBe(
				"0000:0000:0000:0000:0000:0000:0000:0000",
			);
		});

		it("should normalize uppercase to lowercase", () => {
			expect(normalizeIP("2001:DB8::1", { ipv6Subnet: 128 })).toBe(
				"2001:0db8:0000:0000:0000:0000:0000:0001",
			);
			expect(normalizeIP("2001:0DB8:ABCD:EF00::1", { ipv6Subnet: 128 })).toBe(
				"2001:0db8:abcd:ef00:0000:0000:0000:0001",
			);
		});

		it("should handle various IPv6 formats consistently", () => {
			// All these represent the same address
			const normalized = "2001:0db8:0000:0000:0000:0000:0000:0001";
			expect(normalizeIP("2001:db8::1", { ipv6Subnet: 128 })).toBe(normalized);
			expect(normalizeIP("2001:0db8:0:0:0:0:0:1", { ipv6Subnet: 128 })).toBe(
				normalized,
			);
			expect(normalizeIP("2001:db8:0::1", { ipv6Subnet: 128 })).toBe(
				normalized,
			);
			expect(normalizeIP("2001:0db8::0:0:0:1", { ipv6Subnet: 128 })).toBe(
				normalized,
			);
		});

		it("should handle IPv6 with :: at different positions", () => {
			expect(
				normalizeIP("2001:db8:85a3::8a2e:370:7334", { ipv6Subnet: 128 }),
			).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
			expect(normalizeIP("::ffff:192.0.2.1")).not.toContain("::");
		});
	});

	describe("IPv4-mapped IPv6 Conversion", () => {
		it("should convert IPv4-mapped IPv6 to IPv4", () => {
			expect(normalizeIP("::ffff:192.0.2.1")).toBe("192.0.2.1");
			expect(normalizeIP("::ffff:127.0.0.1")).toBe("127.0.0.1");
			expect(normalizeIP("::FFFF:10.0.0.1")).toBe("10.0.0.1");
		});

		it("should handle hex-encoded IPv4 in mapped addresses", () => {
			// ::ffff:c000:0201 = ::ffff:192.0.2.1 = 192.0.2.1
			expect(normalizeIP("::ffff:c000:0201")).toBe("192.0.2.1");
			// ::ffff:7f00:0001 = ::ffff:127.0.0.1 = 127.0.0.1
			expect(normalizeIP("::ffff:7f00:0001")).toBe("127.0.0.1");
		});

		it("should handle full form IPv4-mapped IPv6", () => {
			expect(normalizeIP("0:0:0:0:0:ffff:192.0.2.1")).toBe("192.0.2.1");
		});
	});

	describe("IPv6 Subnet Support", () => {
		it("should extract /64 subnet", () => {
			/* cspell:disable-next-line */
			const ip1 = normalizeIP("2001:db8:0:0:1234:5678:90ab:cdef", {
				ipv6Subnet: 64,
			});
			const ip2 = normalizeIP("2001:db8:0:0:ffff:ffff:ffff:ffff", {
				ipv6Subnet: 64,
			});
			// Both should have same /64 prefix
			expect(ip1).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
			expect(ip2).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
			expect(ip1).toBe(ip2);
		});

		it("should extract /48 subnet", () => {
			/* cspell:disable-next-line */
			const ip1 = normalizeIP("2001:db8:1234:5678:90ab:cdef:1234:5678", {
				ipv6Subnet: 48,
			});
			const ip2 = normalizeIP("2001:db8:1234:ffff:ffff:ffff:ffff:ffff", {
				ipv6Subnet: 48,
			});
			// Both should have same /48 prefix
			expect(ip1).toBe("2001:0db8:1234:0000:0000:0000:0000:0000");
			expect(ip2).toBe("2001:0db8:1234:0000:0000:0000:0000:0000");
			expect(ip1).toBe(ip2);
		});

		it("should extract /32 subnet", () => {
			/* cspell:disable-next-line */
			const ip1 = normalizeIP("2001:db8:1234:5678:90ab:cdef:1234:5678", {
				ipv6Subnet: 32,
			});
			const ip2 = normalizeIP("2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", {
				ipv6Subnet: 32,
			});
			// Both should have same /32 prefix
			expect(ip1).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
			expect(ip2).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
			expect(ip1).toBe(ip2);
		});

		it("should handle /64 subnet by default", () => {
			const ip1 = normalizeIP("2001:db8::1");
			const ip2 = normalizeIP("2001:db8::1", { ipv6Subnet: 64 });
			expect(ip1).toBe(ip2);
			expect(ip1).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
		});

		it("should not affect IPv4 addresses when ipv6Subnet is set", () => {
			expect(normalizeIP("192.168.1.1", { ipv6Subnet: 64 })).toBe(
				"192.168.1.1",
			);
		});
	});

	describe("Rate Limit Key Creation", () => {
		it("should create keys with separator", () => {
			expect(createRateLimitKey("192.168.1.1", "/sign-in")).toBe(
				"192.168.1.1|/sign-in",
			);
			expect(createRateLimitKey("2001:db8::1", "/api/auth")).toBe(
				"2001:db8::1|/api/auth",
			);
		});

		it("should prevent collision attacks", () => {
			// Without separator: "192.0.2.1" + "/sign-in" = "192.0.2.1/sign-in"
			//                    "192.0.2" + ".1/sign-in" = "192.0.2.1/sign-in"
			// With separator: they're different
			const key1 = createRateLimitKey("192.0.2.1", "/sign-in");
			const key2 = createRateLimitKey("192.0.2", ".1/sign-in");
			expect(key1).not.toBe(key2);
			expect(key1).toBe("192.0.2.1|/sign-in");
			expect(key2).toBe("192.0.2|.1/sign-in");
		});
	});

	describe("Security: Bypass Prevention", () => {
		it("should prevent IPv6 representation bypass", () => {
			// Attacker tries different representations of same address
			const representations = [
				"2001:db8::1",
				"2001:DB8::1",
				"2001:0db8::1",
				"2001:db8:0::1",
				"2001:0db8:0:0:0:0:0:1",
				"2001:db8::0:1",
			];

			const normalized = representations.map((ip) =>
				normalizeIP(ip, { ipv6Subnet: 128 }),
			);
			// All should normalize to the same value
			const uniqueValues = new Set(normalized);
			expect(uniqueValues.size).toBe(1);
			expect(normalized[0]).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
		});

		it("should prevent IPv4-mapped bypass", () => {
			// Attacker switches between IPv4 and IPv4-mapped IPv6
			const ip1 = normalizeIP("192.0.2.1");
			const ip2 = normalizeIP("::ffff:192.0.2.1");
			const ip3 = normalizeIP("::FFFF:192.0.2.1");
			const ip4 = normalizeIP("::ffff:c000:0201");

			// All should normalize to the same IPv4
			expect(ip1).toBe("192.0.2.1");
			expect(ip2).toBe("192.0.2.1");
			expect(ip3).toBe("192.0.2.1");
			expect(ip4).toBe("192.0.2.1");
		});

		it("should group IPv6 subnet attacks", () => {
			// Attacker rotates through addresses in their /64 allocation
			const attackIPs = [
				"2001:db8:abcd:1234:0000:0000:0000:0001",
				"2001:db8:abcd:1234:1111:2222:3333:4444",
				"2001:db8:abcd:1234:ffff:ffff:ffff:ffff",
				"2001:db8:abcd:1234:aaaa:bbbb:cccc:dddd",
			];

			const normalized = attackIPs.map((ip) =>
				normalizeIP(ip, { ipv6Subnet: 64 }),
			);

			// All should map to same /64 subnet
			const uniqueValues = new Set(normalized);
			expect(uniqueValues.size).toBe(1);
			expect(normalized[0]).toBe("2001:0db8:abcd:1234:0000:0000:0000:0000");
		});
	});

	describe("Edge Cases", () => {
		it("should handle localhost addresses", () => {
			expect(normalizeIP("127.0.0.1")).toBe("127.0.0.1");
			expect(normalizeIP("::1", { ipv6Subnet: 128 })).toBe(
				"0000:0000:0000:0000:0000:0000:0000:0001",
			);
		});

		it("should handle all-zeros address", () => {
			expect(normalizeIP("0.0.0.0")).toBe("0.0.0.0");
			expect(normalizeIP("::", { ipv6Subnet: 128 })).toBe(
				"0000:0000:0000:0000:0000:0000:0000:0000",
			);
		});

		it("should handle link-local addresses", () => {
			expect(normalizeIP("169.254.0.1")).toBe("169.254.0.1");
			expect(normalizeIP("fe80::1", { ipv6Subnet: 128 })).toBe(
				"fe80:0000:0000:0000:0000:0000:0000:0001",
			);
		});
	});
});
