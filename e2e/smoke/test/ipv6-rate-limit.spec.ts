import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("IPv6 rate limiting", () => {
	it("should group IPv6 addresses from same /64 subnet", async (t) => {
		const cp = spawn("node", [join(fixturesDir, "ipv6-rate-limit.ts")], {
			stdio: "pipe",
		});
		t.after(() => {
			cp.kill("SIGINT");
		});
		cp.stderr.on("data", (data) => {
			console.error(data.toString());
		});
		const port = await new Promise<number>((resolve) => {
			cp.stdout.once("data", (data) => {
				const port = +data.toString();
				assert.ok(port > 0);
				assert.ok(!Number.isNaN(port));
				assert.ok(Number.isFinite(port));
				resolve(port);
			});
		});

		// Different IPv6 addresses from the same /64 subnet
		// 2001:db8:abcd:1234::/64 prefix
		const ipv6Addresses = [
			"2001:db8:abcd:1234:0000:0000:0000:0001",
			"2001:db8:abcd:1234:1111:2222:3333:4444",
			"2001:db8:abcd:1234:ffff:ffff:ffff:ffff",
		];

		// Make requests with different IPv6 addresses from same /64
		// Rate limit is max 3 requests, so 4th should be blocked
		for (let i = 0; i < 4; i++) {
			const ipv6 = ipv6Addresses[i % ipv6Addresses.length]!;
			const response = await fetch(
				`http://localhost:${port}/api/auth/sign-in/email`,
				{
					method: "POST",
					body: JSON.stringify({
						email: "test@test.com",
						password: "password",
					}),
					headers: {
						"content-type": "application/json",
						origin: `http://localhost:${port}`,
						"x-forwarded-for": ipv6,
					},
				},
			);

			if (i >= 3) {
				assert.equal(
					response.status,
					429,
					`Request ${i + 1} with IP ${ipv6} should be rate limited (429)`,
				);
			} else {
				assert.notEqual(
					response.status,
					429,
					`Request ${i + 1} with IP ${ipv6} should not be rate limited`,
				);
			}
		}
	});

	it("should not group IPv6 addresses from different /64 subnets", async (t) => {
		const cp = spawn("node", [join(fixturesDir, "ipv6-rate-limit.ts")], {
			stdio: "pipe",
		});
		t.after(() => {
			cp.kill("SIGINT");
		});
		cp.stderr.on("data", (data) => {
			console.error(data.toString());
		});
		const port = await new Promise<number>((resolve) => {
			cp.stdout.once("data", (data) => {
				const port = +data.toString();
				assert.ok(port > 0);
				assert.ok(!Number.isNaN(port));
				assert.ok(Number.isFinite(port));
				resolve(port);
			});
		});

		// Different /64 subnets
		const differentSubnets = [
			"2001:db8:abcd:1111:0000:0000:0000:0001", // /64 subnet 1
			"2001:db8:abcd:2222:0000:0000:0000:0001", // /64 subnet 2
			"2001:db8:abcd:3333:0000:0000:0000:0001", // /64 subnet 3
		];

		// Each subnet should have its own rate limit counter
		// So 3 requests from 3 different subnets should all succeed
		for (const ipv6 of differentSubnets) {
			const response = await fetch(
				`http://localhost:${port}/api/auth/sign-in/email`,
				{
					method: "POST",
					body: JSON.stringify({
						email: "test@test.com",
						password: "password",
					}),
					headers: {
						"content-type": "application/json",
						origin: `http://localhost:${port}`,
						"x-forwarded-for": ipv6,
					},
				},
			);

			assert.notEqual(
				response.status,
				429,
				`Request with IP ${ipv6} should not be rate limited (different subnet)`,
			);
		}
	});

	it("should normalize different IPv6 representations", async (t) => {
		const cp = spawn("node", [join(fixturesDir, "ipv6-rate-limit.ts")], {
			stdio: "pipe",
		});
		t.after(() => {
			cp.kill("SIGINT");
		});
		cp.stderr.on("data", (data) => {
			console.error(data.toString());
		});
		const port = await new Promise<number>((resolve) => {
			cp.stdout.once("data", (data) => {
				const port = +data.toString();
				assert.ok(port > 0);
				assert.ok(!Number.isNaN(port));
				assert.ok(Number.isFinite(port));
				resolve(port);
			});
		});

		// Different representations of the same IPv6 address
		const sameAddressDifferentFormats = [
			"2001:db8::1",
			"2001:DB8::1", // uppercase
			"2001:0db8::1", // leading zeros
			"2001:db8:0:0:0:0:0:1", // expanded
		];

		// All should be normalized to the same address and share rate limit
		for (let i = 0; i < 4; i++) {
			const ipv6 = sameAddressDifferentFormats[i]!;
			const response = await fetch(
				`http://localhost:${port}/api/auth/sign-in/email`,
				{
					method: "POST",
					body: JSON.stringify({
						email: "test@test.com",
						password: "password",
					}),
					headers: {
						"content-type": "application/json",
						origin: `http://localhost:${port}`,
						"x-forwarded-for": ipv6,
					},
				},
			);

			if (i >= 3) {
				assert.equal(
					response.status,
					429,
					`Request ${i + 1} with IP ${ipv6} should be rate limited (same address)`,
				);
			} else {
				assert.notEqual(
					response.status,
					429,
					`Request ${i + 1} with IP ${ipv6} should not be rate limited`,
				);
			}
		}
	});
});
