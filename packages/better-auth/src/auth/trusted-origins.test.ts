import { createAuthEndpoint } from "@better-auth/core/api";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { getTestInstance } from "../test-utils";
import type { BetterAuthOptions } from "../types";

async function createAuthTestInstance(overrides?: Partial<BetterAuthOptions>) {
	const testServerPlugin = {
		id: "test-plugin",
		endpoints: {
			testTrustedOrigin: createAuthEndpoint(
				"/test-trusted-origin",
				{
					method: "GET",
					query: z.object({
						url: z.string(),
						allowRelativePaths: z.coerce.boolean().optional(),
					}),
				},
				async (ctx) => {
					const settings =
						typeof ctx.query.allowRelativePaths === "boolean"
							? { allowRelativePaths: ctx.query.allowRelativePaths }
							: undefined;
					return ctx.context.isTrustedOrigin(ctx.query.url, settings);
				},
			),
		},
	};

	const testClientPlugin = {
		id: "test-client-plugin",
		$InferServerPlugin: {} as typeof testServerPlugin,
	};

	const { auth, client } = await getTestInstance(
		{
			plugins: [testServerPlugin],
			...overrides,
		},
		{ clientOptions: { plugins: [testClientPlugin] } },
	);

	const isTrustedOrigin = async (
		url: string,
		settings?: { allowRelativePaths: boolean },
	) => {
		const result = await client.testTrustedOrigin({
			query: { url, ...settings },
		});

		if (result.error) {
			throw result.error;
		}

		return result.data;
	};

	return { auth, client, isTrustedOrigin };
}

describe("trusted origins", () => {
	describe("trusted origins list support", () => {
		it("should always allow the app's origin", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance();

			await expect(isTrustedOrigin("http://localhost:3000")).resolves.toBe(
				true,
			);

			await expect(
				isTrustedOrigin("http://localhost:3000/some/path"),
			).resolves.toBe(true);
		});

		it("should reject origins that start with a trusted origin", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: ["https://trusted.com"],
			});

			await expect(
				isTrustedOrigin("https://trusted.com.malicious.com"),
			).resolves.toBe(false);
		});

		it("should reject untrusted origin subdomains", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: ["https://trusted.com"],
			});

			await expect(
				isTrustedOrigin("http://sub-domain.trusted.com"),
			).resolves.toBe(false);
		});

		it("should allow origins that directly match a trusted origin", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: ["https://trusted.com"],
			});

			await expect(isTrustedOrigin("https://trusted.com")).resolves.toBe(true);

			await expect(
				isTrustedOrigin("https://trusted.com/some/path"),
			).resolves.toBe(true);
		});
	});

	describe("relative paths support", () => {
		it("should reject relative paths by default", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance();

			await expect(isTrustedOrigin("/")).resolves.toBe(false);
			await expect(isTrustedOrigin("/some-absolute-url")).resolves.toBe(false);
		});

		it("should allow relative paths", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance();

			try {
				await isTrustedOrigin("/", { allowRelativePaths: true });
			} catch (error) {
				console.log(error);
			}

			await expect(
				isTrustedOrigin("/", { allowRelativePaths: true }),
			).resolves.toBe(true);
			await expect(
				isTrustedOrigin("/dashboard", { allowRelativePaths: true }),
			).resolves.toBe(true);
		});

		it("should allow relative paths with query params", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance();

			await expect(
				isTrustedOrigin("/dashboard?email=123@email.com", {
					allowRelativePaths: true,
				}),
			).resolves.toBe(true);
		});

		it("should allow relative paths with plus signs", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance();

			await expect(
				isTrustedOrigin("/dashboard+page?test=123+456", {
					allowRelativePaths: true,
				}),
			).resolves.toBe(true);
		});

		it("should reject urls with double dash", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance();

			await expect(
				isTrustedOrigin("//evil.com", { allowRelativePaths: true }),
			).resolves.toBe(false);
		});

		it("should reject urls with encoded malicious content", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance();

			const maliciousPatterns = [
				"/%5C/evil.com",
				`/\\/\\/evil.com`,
				"/%5C/evil.com",
				"/..%2F..%2Fevil.com",
				"javascript:alert('xss')",
				"data:text/html,<script>alert('xss')</script>",
			];

			for (const pattern of maliciousPatterns) {
				await expect(
					isTrustedOrigin(pattern, { allowRelativePaths: true }),
				).resolves.toBe(false);
			}
		});
	});

	describe("wildcards support", () => {
		it("should allow origins that match a wildcard trusted origin", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: ["*.my-site.com"],
			});

			await expect(
				isTrustedOrigin("https://sub-domain.my-site.com"),
			).resolves.toBe(true);

			await expect(
				isTrustedOrigin("https://sub-domain.my-site.com/callback"),
			).resolves.toBe(true);

			await expect(
				isTrustedOrigin("https://another-sub.my-site.com"),
			).resolves.toBe(true);

			await expect(
				isTrustedOrigin("https://another-sub.my-site.com/callback"),
			).resolves.toBe(true);
		});

		it("should reject urls with malicious domain with wildcard trusted origins", async (ctx) => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: ["*.example.com"],
			});
			await expect(isTrustedOrigin("malicious.com?.example.com")).resolves.toBe(
				false,
			);
		});

		it("should work with protocol specific wildcard trusted origins", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: ["https://*.protocol-site.com"],
			});

			// Test HTTPS protocol specific wildcard - should work
			await expect(
				isTrustedOrigin("https://api.protocol-site.com"),
			).resolves.toBe(true);

			// Test HTTP with HTTPS protocol wildcard - should fail
			await expect(
				isTrustedOrigin("http://api.protocol-site.com"),
			).resolves.toBe(false);
		});

		it("should work with custom scheme wildcards (e.g. exp:// for Expo)", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: [
					"exp://10.0.0.*:*/*",
					"exp://192.168.*.*:*/*",
					"exp://172.*.*.*:*/*",
				],
			});

			// Test with IP matching the wildcard pattern
			await expect(isTrustedOrigin("exp://10.0.0.29:8081/--/")).resolves.toBe(
				true,
			);

			// Test with different IP range that matches
			await expect(
				isTrustedOrigin("exp://192.168.1.100:8081/--/"),
			).resolves.toBe(true);

			// Test with different IP range that matches
			await expect(isTrustedOrigin("exp://172.16.0.1:8081/--/")).resolves.toBe(
				true,
			);

			// Test with IP that doesn't match any pattern - should fail
			await expect(isTrustedOrigin("exp://203.0.113.0:8081/--/")).resolves.toBe(
				false,
			);
		});
	});

	describe("dynamic trusted origins", () => {
		it("should allow dynamically computed trusted origins", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: async (request) => {
					const url = new URL(
						new URL(request.url).searchParams.get("url") ?? "unknown",
					);
					return [url.origin];
				},
			});

			await expect(
				isTrustedOrigin("http://localhost:5000/callback"),
			).resolves.toBe(true);
		});

		it("should not allow dynamically computed trusted origins", async () => {
			const { isTrustedOrigin } = await createAuthTestInstance({
				trustedOrigins: async (request) => {
					return []; // no additional trusted origins
				},
			});

			await expect(
				isTrustedOrigin("http://localhost:5000/callback"),
			).resolves.toBe(false);
		});
	});
});
