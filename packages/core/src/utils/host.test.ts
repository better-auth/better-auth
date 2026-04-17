import { describe, expect, it } from "vitest";
import {
	classifyHost,
	isLoopbackHost,
	isLoopbackIP,
	isPublicRoutableHost,
} from "./host";

describe("Host Classification", () => {
	describe("Input Normalization", () => {
		it("should strip brackets from IPv6 literals", () => {
			expect(classifyHost("[::1]").literal).toBe("ipv6");
			expect(classifyHost("[::1]").kind).toBe("loopback");
		});

		it("should strip port from IPv4", () => {
			expect(classifyHost("127.0.0.1:3000").canonical).toBe("127.0.0.1");
			expect(classifyHost("127.0.0.1:3000").kind).toBe("loopback");
		});

		it("should strip port from bracketed IPv6", () => {
			expect(classifyHost("[::1]:8080").kind).toBe("loopback");
			expect(classifyHost("[fe80::1]:443").kind).toBe("linkLocal");
		});

		it("should strip port from FQDN", () => {
			expect(classifyHost("localhost:3000").canonical).toBe("localhost");
			expect(classifyHost("example.com:443").canonical).toBe("example.com");
		});

		it("should NOT strip trailing segment from bare IPv6", () => {
			// Multiple colons means no port — don't mangle the address
			expect(classifyHost("::1").kind).toBe("loopback");
			expect(classifyHost("fe80::1").kind).toBe("linkLocal");
		});

		it("should strip IPv6 zone identifier", () => {
			expect(classifyHost("fe80::1%eth0").kind).toBe("linkLocal");
			expect(classifyHost("[fe80::1%en0]:443").kind).toBe("linkLocal");
		});

		it("should strip trailing dot (RFC 1034 absolute DNS form)", () => {
			expect(classifyHost("localhost.").kind).toBe("localhost");
			expect(classifyHost("tenant.localhost.").kind).toBe("localhost");
			expect(classifyHost("metadata.google.internal.").kind).toBe(
				"cloudMetadata",
			);
			expect(classifyHost("instance-data.ec2.internal.").kind).toBe(
				"cloudMetadata",
			);
			expect(classifyHost("127.0.0.1.").kind).toBe("loopback");
			expect(classifyHost("example.com.").canonical).toBe("example.com");
		});

		it("should be case-insensitive", () => {
			expect(classifyHost("LOCALHOST").kind).toBe("localhost");
			expect(classifyHost("Example.COM").canonical).toBe("example.com");
			expect(classifyHost("2001:DB8::1").kind).toBe("documentation");
		});

		it("should trim whitespace", () => {
			expect(classifyHost("  127.0.0.1  ").kind).toBe("loopback");
		});
	});

	describe("IPv4 Classification", () => {
		it("should identify loopback range 127.0.0.0/8", () => {
			expect(classifyHost("127.0.0.1").kind).toBe("loopback");
			expect(classifyHost("127.0.0.0").kind).toBe("loopback");
			expect(classifyHost("127.255.255.255").kind).toBe("loopback");
			expect(classifyHost("127.42.42.42").kind).toBe("loopback");
		});

		it("should identify unspecified 0.0.0.0", () => {
			expect(classifyHost("0.0.0.0").kind).toBe("unspecified");
		});

		it("should identify broadcast 255.255.255.255", () => {
			expect(classifyHost("255.255.255.255").kind).toBe("broadcast");
		});

		it("should identify RFC 1918 private ranges", () => {
			expect(classifyHost("10.0.0.1").kind).toBe("private");
			expect(classifyHost("10.255.255.255").kind).toBe("private");
			expect(classifyHost("172.16.0.1").kind).toBe("private");
			expect(classifyHost("172.31.255.255").kind).toBe("private");
			expect(classifyHost("192.168.0.1").kind).toBe("private");
			expect(classifyHost("192.168.255.255").kind).toBe("private");
		});

		it("should NOT flag boundary-adjacent addresses as private", () => {
			expect(classifyHost("9.255.255.255").kind).toBe("public");
			expect(classifyHost("11.0.0.0").kind).toBe("public");
			expect(classifyHost("172.15.255.255").kind).toBe("public");
			expect(classifyHost("172.32.0.0").kind).toBe("public");
			expect(classifyHost("192.167.255.255").kind).toBe("public");
			expect(classifyHost("192.169.0.0").kind).toBe("public");
		});

		it("should identify link-local 169.254.0.0/16", () => {
			expect(classifyHost("169.254.0.1").kind).toBe("linkLocal");
			expect(classifyHost("169.254.169.254").kind).toBe("linkLocal");
			expect(classifyHost("169.254.255.255").kind).toBe("linkLocal");
		});

		it("should identify shared address space 100.64.0.0/10", () => {
			expect(classifyHost("100.64.0.1").kind).toBe("sharedAddressSpace");
			expect(classifyHost("100.127.255.255").kind).toBe("sharedAddressSpace");
		});

		it("should NOT flag public addresses adjacent to 100.64/10 as shared", () => {
			expect(classifyHost("100.63.255.255").kind).toBe("public");
			expect(classifyHost("100.128.0.0").kind).toBe("public");
		});

		it("should identify documentation ranges (RFC 5737)", () => {
			expect(classifyHost("192.0.2.1").kind).toBe("documentation");
			expect(classifyHost("198.51.100.42").kind).toBe("documentation");
			expect(classifyHost("203.0.113.99").kind).toBe("documentation");
		});

		it("should identify benchmarking 198.18.0.0/15", () => {
			expect(classifyHost("198.18.0.1").kind).toBe("benchmarking");
			expect(classifyHost("198.19.255.255").kind).toBe("benchmarking");
		});

		it("should identify multicast 224.0.0.0/4", () => {
			expect(classifyHost("224.0.0.1").kind).toBe("multicast");
			expect(classifyHost("239.255.255.255").kind).toBe("multicast");
		});

		it("should identify reserved ranges", () => {
			expect(classifyHost("0.0.0.1").kind).toBe("reserved");
			expect(classifyHost("240.0.0.1").kind).toBe("reserved");
			expect(classifyHost("254.255.255.254").kind).toBe("reserved");
		});

		it("should identify public addresses", () => {
			expect(classifyHost("8.8.8.8").kind).toBe("public");
			expect(classifyHost("1.1.1.1").kind).toBe("public");
			expect(classifyHost("142.250.80.46").kind).toBe("public");
		});
	});

	describe("IPv6 Classification", () => {
		it("should identify loopback ::1", () => {
			expect(classifyHost("::1").kind).toBe("loopback");
			expect(classifyHost("0:0:0:0:0:0:0:1").kind).toBe("loopback");
			expect(classifyHost("0000:0000:0000:0000:0000:0000:0000:0001").kind).toBe(
				"loopback",
			);
		});

		it("should identify unspecified ::", () => {
			expect(classifyHost("::").kind).toBe("unspecified");
			expect(classifyHost("0:0:0:0:0:0:0:0").kind).toBe("unspecified");
		});

		it("should identify link-local fe80::/10", () => {
			expect(classifyHost("fe80::1").kind).toBe("linkLocal");
			expect(classifyHost("febf::1").kind).toBe("linkLocal");
		});

		it("should NOT flag fec0::/10 as link-local (deprecated site-local)", () => {
			// fec0::/10 is deprecated site-local, not link-local
			expect(classifyHost("fec0::1").kind).not.toBe("linkLocal");
		});

		it("should identify unique local fc00::/7 as private", () => {
			expect(classifyHost("fc00::1").kind).toBe("private");
			expect(classifyHost("fd00::1").kind).toBe("private");
			expect(classifyHost("fdff::1").kind).toBe("private");
		});

		it("should identify multicast ff00::/8", () => {
			expect(classifyHost("ff00::1").kind).toBe("multicast");
			expect(classifyHost("ff02::1").kind).toBe("multicast");
		});

		it("should identify documentation 2001:db8::/32", () => {
			expect(classifyHost("2001:db8::1").kind).toBe("documentation");
			expect(classifyHost("2001:0db8:abcd::1").kind).toBe("documentation");
		});

		it("should identify public IPv6", () => {
			expect(classifyHost("2606:4700:4700::1111").kind).toBe("public");
			expect(classifyHost("2a00:1450:4001:828::200e").kind).toBe("public");
		});

		it("should expand IPv6 in canonical form", () => {
			expect(classifyHost("::1").canonical).toBe(
				"0000:0000:0000:0000:0000:0000:0000:0001",
			);
			expect(classifyHost("2001:db8::1").canonical).toBe(
				"2001:0db8:0000:0000:0000:0000:0000:0001",
			);
		});
	});

	describe("IPv4-Mapped IPv6 Handling", () => {
		it("should unmap ::ffff:IPv4 and classify by IPv4 rules", () => {
			const mapped = classifyHost("::ffff:127.0.0.1");
			expect(mapped.literal).toBe("ipv4");
			expect(mapped.kind).toBe("loopback");
			expect(mapped.canonical).toBe("127.0.0.1");
		});

		it("should unmap hex-encoded IPv4-mapped IPv6", () => {
			// ::ffff:c000:0201 === ::ffff:192.0.2.1
			const mapped = classifyHost("::ffff:c000:0201");
			expect(mapped.literal).toBe("ipv4");
			expect(mapped.canonical).toBe("192.0.2.1");
			expect(mapped.kind).toBe("documentation");
		});

		it("should unmap full-form IPv4-mapped IPv6", () => {
			const mapped = classifyHost("0:0:0:0:0:ffff:192.0.2.1");
			expect(mapped.literal).toBe("ipv4");
			expect(mapped.canonical).toBe("192.0.2.1");
		});

		it("should classify mapped AWS metadata IP as linkLocal", () => {
			expect(classifyHost("::ffff:169.254.169.254").kind).toBe("linkLocal");
		});
	});

	describe("FQDN Classification", () => {
		it("should identify exact localhost", () => {
			expect(classifyHost("localhost").kind).toBe("localhost");
			expect(classifyHost("localhost").literal).toBe("fqdn");
		});

		it("should identify RFC 6761 .localhost subdomains", () => {
			expect(classifyHost("tenant.localhost").kind).toBe("localhost");
			expect(classifyHost("app.foo.localhost").kind).toBe("localhost");
			expect(classifyHost("my-app.localhost").kind).toBe("localhost");
		});

		it("should NOT match localhost as a substring of unrelated hosts", () => {
			expect(classifyHost("localhostattacker.com").kind).toBe("public");
			expect(classifyHost("notlocalhost").kind).toBe("public");
			expect(classifyHost("localhost.evil.com").kind).toBe("public");
		});

		it("should identify cloud metadata FQDNs", () => {
			expect(classifyHost("metadata.google.internal").kind).toBe(
				"cloudMetadata",
			);
			expect(classifyHost("metadata.goog").kind).toBe("cloudMetadata");
			expect(classifyHost("metadata").kind).toBe("cloudMetadata");
			expect(classifyHost("instance-data").kind).toBe("cloudMetadata");
			expect(classifyHost("instance-data.ec2.internal").kind).toBe(
				"cloudMetadata",
			);
		});

		it("should default unknown FQDNs to public", () => {
			expect(classifyHost("example.com").kind).toBe("public");
			expect(classifyHost("api.example.com").kind).toBe("public");
		});
	});

	describe("isLoopbackIP (strict, RFC 8252 §7.3)", () => {
		it("should return true for IPv4 loopback", () => {
			expect(isLoopbackIP("127.0.0.1")).toBe(true);
			expect(isLoopbackIP("127.5.42.1")).toBe(true);
			expect(isLoopbackIP("127.0.0.1:3000")).toBe(true);
		});

		it("should return true for IPv6 loopback", () => {
			expect(isLoopbackIP("::1")).toBe(true);
			expect(isLoopbackIP("[::1]")).toBe(true);
			expect(isLoopbackIP("[::1]:8080")).toBe(true);
		});

		it("should return false for localhost DNS name", () => {
			// RFC 8252 §8.3: localhost is NOT RECOMMENDED for native OAuth
			expect(isLoopbackIP("localhost")).toBe(false);
			expect(isLoopbackIP("tenant.localhost")).toBe(false);
		});

		it("should return false for 0.0.0.0", () => {
			expect(isLoopbackIP("0.0.0.0")).toBe(false);
		});

		it("should return false for private and link-local", () => {
			expect(isLoopbackIP("10.0.0.1")).toBe(false);
			expect(isLoopbackIP("192.168.1.1")).toBe(false);
			expect(isLoopbackIP("169.254.169.254")).toBe(false);
			expect(isLoopbackIP("fe80::1")).toBe(false);
		});
	});

	describe("isLoopbackHost (permissive)", () => {
		it("should return true for IP loopback and localhost names", () => {
			expect(isLoopbackHost("127.0.0.1")).toBe(true);
			expect(isLoopbackHost("::1")).toBe(true);
			expect(isLoopbackHost("localhost")).toBe(true);
			expect(isLoopbackHost("tenant.localhost")).toBe(true);
			expect(isLoopbackHost("tenant-a.localhost:3000")).toBe(true);
		});

		it("should return false for 0.0.0.0 (security fix)", () => {
			// Oligo's "0.0.0.0 Day" — 0.0.0.0 is unspecified, not loopback
			expect(isLoopbackHost("0.0.0.0")).toBe(false);
		});

		it("should return false for private and public hosts", () => {
			expect(isLoopbackHost("10.0.0.1")).toBe(false);
			expect(isLoopbackHost("example.com")).toBe(false);
			expect(isLoopbackHost("localhostattacker.com")).toBe(false);
		});
	});

	describe("isPublicRoutableHost (SSRF gate)", () => {
		it("should return true for ordinary public hosts", () => {
			expect(isPublicRoutableHost("example.com")).toBe(true);
			expect(isPublicRoutableHost("api.example.com")).toBe(true);
			expect(isPublicRoutableHost("8.8.8.8")).toBe(true);
			expect(isPublicRoutableHost("2606:4700:4700::1111")).toBe(true);
		});

		it("should reject all loopback variants", () => {
			expect(isPublicRoutableHost("127.0.0.1")).toBe(false);
			expect(isPublicRoutableHost("::1")).toBe(false);
			expect(isPublicRoutableHost("localhost")).toBe(false);
			expect(isPublicRoutableHost("tenant.localhost")).toBe(false);
			expect(isPublicRoutableHost("::ffff:127.0.0.1")).toBe(false);
		});

		it("should reject unspecified addresses", () => {
			expect(isPublicRoutableHost("0.0.0.0")).toBe(false);
			expect(isPublicRoutableHost("::")).toBe(false);
		});

		it("should reject private ranges", () => {
			expect(isPublicRoutableHost("10.0.0.1")).toBe(false);
			expect(isPublicRoutableHost("172.16.0.1")).toBe(false);
			expect(isPublicRoutableHost("192.168.1.1")).toBe(false);
			expect(isPublicRoutableHost("fc00::1")).toBe(false);
			expect(isPublicRoutableHost("fd00::1")).toBe(false);
		});

		it("should reject link-local (AWS IMDS)", () => {
			expect(isPublicRoutableHost("169.254.169.254")).toBe(false);
			expect(isPublicRoutableHost("::ffff:169.254.169.254")).toBe(false);
			expect(isPublicRoutableHost("fe80::1")).toBe(false);
		});

		it("should reject cloud metadata FQDNs", () => {
			expect(isPublicRoutableHost("metadata.google.internal")).toBe(false);
			expect(isPublicRoutableHost("metadata.goog")).toBe(false);
			expect(isPublicRoutableHost("instance-data.ec2.internal")).toBe(false);
		});

		it("should reject documentation and benchmarking ranges", () => {
			expect(isPublicRoutableHost("192.0.2.1")).toBe(false);
			expect(isPublicRoutableHost("198.51.100.1")).toBe(false);
			expect(isPublicRoutableHost("2001:db8::1")).toBe(false);
			expect(isPublicRoutableHost("198.18.0.1")).toBe(false);
		});

		it("should reject broadcast and multicast", () => {
			expect(isPublicRoutableHost("255.255.255.255")).toBe(false);
			expect(isPublicRoutableHost("224.0.0.1")).toBe(false);
			expect(isPublicRoutableHost("ff00::1")).toBe(false);
		});
	});

	describe("Security: Bypass Prevention", () => {
		it("should prevent IPv4-mapped IPv6 SSRF bypass", () => {
			// Classic attack: obscure 169.254.169.254 (AWS IMDS) via IPv6 mapping
			const representations = [
				"169.254.169.254",
				"::ffff:169.254.169.254",
				"::FFFF:169.254.169.254",
				"0:0:0:0:0:ffff:169.254.169.254",
			];
			for (const host of representations) {
				expect(isPublicRoutableHost(host)).toBe(false);
			}
		});

		it("should prevent 0.0.0.0 loopback confusion (Oligo 0.0.0.0 Day)", () => {
			// 0.0.0.0 binds to all interfaces — treating it as loopback allows
			// unauthenticated localhost access from browser-origin requests
			expect(isLoopbackHost("0.0.0.0")).toBe(false);
			expect(isLoopbackIP("0.0.0.0")).toBe(false);
			expect(classifyHost("0.0.0.0").kind).toBe("unspecified");
		});

		it("should prevent .localhost substring bypass", () => {
			// Naive `host.includes("localhost")` matches attacker-controlled domains
			expect(classifyHost("evil-localhost.com").kind).toBe("public");
			expect(classifyHost("localhost.attacker.com").kind).toBe("public");
			expect(isPublicRoutableHost("localhost.attacker.com")).toBe(true);
		});

		it("should prevent hex-encoded IPv4-mapped bypass", () => {
			// ::ffff:a9fe:a9fe = ::ffff:169.254.169.254 = AWS IMDS
			expect(isPublicRoutableHost("::ffff:a9fe:a9fe")).toBe(false);
		});

		it("should prevent zone-id smuggling", () => {
			// Naive parsers might treat fe80::1%evil.com as FQDN "evil.com"
			expect(classifyHost("fe80::1%evil.com").kind).toBe("linkLocal");
		});

		it("should prevent absolute-DNS-form SSRF bypass", () => {
			// WHATWG URL parsing preserves trailing dots in `.hostname`, so
			// `metadata.google.internal.` would default to `public` without
			// normalization — a working cloud-metadata bypass.
			expect(isPublicRoutableHost("metadata.google.internal.")).toBe(false);
			expect(isPublicRoutableHost("instance-data.ec2.internal.")).toBe(false);
			expect(isLoopbackHost("localhost.")).toBe(true);
			expect(isLoopbackHost("tenant.localhost.")).toBe(true);
			expect(isLoopbackIP("127.0.0.1.")).toBe(true);
		});

		it("should canonicalize to defeat representation attacks", () => {
			// All of these are the same address; canonical form must match
			const representations = [
				"2001:db8::1",
				"2001:DB8::1",
				"2001:0db8::1",
				"2001:db8:0::1",
				"[2001:db8::1]",
				"[2001:db8::1]:443",
			];
			const canonicals = representations.map((r) => classifyHost(r).canonical);
			expect(new Set(canonicals).size).toBe(1);
		});
	});
});
