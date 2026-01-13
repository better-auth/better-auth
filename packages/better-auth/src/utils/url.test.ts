import { describe, expect, it, vi } from "vitest";
import { getBaseCallbackURL, getBaseURL } from "./url";

describe("getBaseURL", () => {
	describe("trustedProxyHeaders validation", () => {
		it("should reject malicious protocol in X-Forwarded-Proto", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "example.com",
					"x-forwarded-proto": "javascript",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);
			expect(result).toBe("http://localhost:3000/auth");
		});

		it("should reject file protocol in X-Forwarded-Proto", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "example.com",
					"x-forwarded-proto": "file",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("http://localhost:3000/auth");
		});

		it("should reject path traversal in X-Forwarded-Host", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "../../../etc/passwd",
					"x-forwarded-proto": "http",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);
			expect(result).toBe("http://localhost:3000/auth");
		});

		it("should reject null bytes in X-Forwarded-Host", () => {
			expect(() => {
				new Request("http://localhost:3000/test", {
					headers: {
						"x-forwarded-host": "evil.com\u0000.example.com",
						"x-forwarded-proto": "http",
					},
				});
			}).toThrow();
		});

		it("should reject HTML injection in X-Forwarded-Host", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "<script>alert('xss')</script>",
					"x-forwarded-proto": "http",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("http://localhost:3000/auth");
		});

		it("should reject empty X-Forwarded-Host", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "",
					"x-forwarded-proto": "http",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("http://localhost:3000/auth");
		});

		it("should reject whitespace-only X-Forwarded-Host", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "   ",
					"x-forwarded-proto": "http",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("http://localhost:3000/auth");
		});

		it("should accept valid hostname with port", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "example.com:8080",
					"x-forwarded-proto": "https",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("https://example.com:8080/auth");
		});

		it("should accept valid IPv4 address", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "192.168.1.1",
					"x-forwarded-proto": "https",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("https://192.168.1.1/auth");
		});

		it("should accept valid IPv4 address with port", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "192.168.1.1:3000",
					"x-forwarded-proto": "http",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("http://192.168.1.1:3000/auth");
		});

		it("should accept valid IPv6 address in brackets", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "[2001:db8::1]",
					"x-forwarded-proto": "https",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("https://[2001:db8::1]/auth");
		});

		it("should accept localhost", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "localhost",
					"x-forwarded-proto": "http",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("http://localhost/auth");
		});

		it("should accept localhost with port", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "localhost:8080",
					"x-forwarded-proto": "http",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("http://localhost:8080/auth");
		});

		it("should reject invalid port numbers", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "example.com:999999",
					"x-forwarded-proto": "http",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			// Should fall back to request URL due to invalid port
			expect(result).toBe("http://localhost:3000/auth");
		});

		it("should only accept http or https protocols", () => {
			const protocols = ["ftp", "ws", "wss", "data", "blob", "javascript"];

			for (const proto of protocols) {
				const request = new Request("http://localhost:3000/test", {
					headers: {
						"x-forwarded-host": "example.com",
						"x-forwarded-proto": proto,
					},
				});

				const result = getBaseURL(undefined, "/auth", request, false, true);

				expect(result).toBe("http://localhost:3000/auth");
			}
		});

		it("should not use proxy headers when trustedProxyHeaders is false", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "evil.com",
					"x-forwarded-proto": "https",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, false);

			expect(result).toBe("http://localhost:3000/auth");
		});

		it("should require both headers to be present", () => {
			// Only host
			const request1 = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "example.com",
				},
			});

			const result1 = getBaseURL(undefined, "/auth", request1, false, true);
			expect(result1).toBe("http://localhost:3000/auth");

			// Only proto
			const request2 = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-proto": "https",
				},
			});

			const result2 = getBaseURL(undefined, "/auth", request2, false, true);
			expect(result2).toBe("http://localhost:3000/auth");
		});

		it("should handle subdomain correctly", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "api.example.com",
					"x-forwarded-proto": "https",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("https://api.example.com/auth");
		});

		it("should handle deep subdomain correctly", () => {
			const request = new Request("http://localhost:3000/test", {
				headers: {
					"x-forwarded-host": "api.v1.staging.example.com",
					"x-forwarded-proto": "https",
				},
			});

			const result = getBaseURL(undefined, "/auth", request, false, true);

			expect(result).toBe("https://api.v1.staging.example.com/auth");
		});
	});
});

describe("getBaseCallbackURL", () => {
	it("should return baseCallbackURL when explicitly provided", () => {
		const result = getBaseCallbackURL(
			"http://localhost:4000",
			"http://localhost:3000",
		);
		expect(result).toBe("http://localhost:4000");
	});

	it("should fallback to baseURL origin when baseCallbackURL is not provided", () => {
		const result = getBaseCallbackURL(
			undefined,
			"http://localhost:3000/api/auth",
		);
		expect(result).toBe("http://localhost:3000");
	});

	it("should return undefined when neither baseCallbackURL nor baseURL is provided", () => {
		const result = getBaseCallbackURL(undefined, undefined);
		expect(result).toBeUndefined();
	});

	it("should handle baseURL without path", () => {
		const result = getBaseCallbackURL(undefined, "http://localhost:3000");
		expect(result).toBe("http://localhost:3000");
	});

	it("should preserve full baseCallbackURL including path", () => {
		const result = getBaseCallbackURL(
			"http://localhost:4000/custom/path",
			"http://localhost:3000",
		);
		expect(result).toBe("http://localhost:4000/custom/path");
	});

	it("should handle empty string baseCallbackURL by falling back to baseURL", () => {
		const result = getBaseCallbackURL("", "http://localhost:3000");
		expect(result).toBe("http://localhost:3000");
	});

	it("should handle invalid baseURL gracefully", () => {
		const result = getBaseCallbackURL(undefined, "not-a-valid-url");
		expect(result).toBe("not-a-valid-url");
	});

	describe("environment variable support", () => {
		it("should use BETTER_AUTH_CALLBACK_URL env variable", () => {
			vi.stubEnv("BETTER_AUTH_CALLBACK_URL", "http://localhost:5000");

			const result = getBaseCallbackURL(
				undefined,
				"http://localhost:3000",
				true,
			);
			expect(result).toBe("http://localhost:5000");

			vi.unstubAllEnvs();
		});

		it("should use NEXT_PUBLIC_BETTER_AUTH_CALLBACK_URL env variable", () => {
			vi.stubEnv(
				"NEXT_PUBLIC_BETTER_AUTH_CALLBACK_URL",
				"http://localhost:5001",
			);

			const result = getBaseCallbackURL(
				undefined,
				"http://localhost:3000",
				true,
			);
			expect(result).toBe("http://localhost:5001");

			vi.unstubAllEnvs();
		});

		it("should use PUBLIC_BETTER_AUTH_CALLBACK_URL env variable", () => {
			vi.stubEnv("PUBLIC_BETTER_AUTH_CALLBACK_URL", "http://localhost:5002");

			const result = getBaseCallbackURL(
				undefined,
				"http://localhost:3000",
				true,
			);
			expect(result).toBe("http://localhost:5002");

			vi.unstubAllEnvs();
		});

		it("should use NUXT_PUBLIC_BETTER_AUTH_CALLBACK_URL env variable", () => {
			vi.stubEnv(
				"NUXT_PUBLIC_BETTER_AUTH_CALLBACK_URL",
				"http://localhost:5003",
			);

			const result = getBaseCallbackURL(
				undefined,
				"http://localhost:3000",
				true,
			);
			expect(result).toBe("http://localhost:5003");

			vi.unstubAllEnvs();
		});

		it("should prefer explicit baseCallbackURL over env variable", () => {
			vi.stubEnv("BETTER_AUTH_CALLBACK_URL", "http://localhost:5000");

			const result = getBaseCallbackURL(
				"http://localhost:4000",
				"http://localhost:3000",
				true,
			);
			expect(result).toBe("http://localhost:4000");

			vi.unstubAllEnvs();
		});

		it("should not use env variables when loadEnv is false", () => {
			vi.stubEnv("BETTER_AUTH_CALLBACK_URL", "http://localhost:5000");

			const result = getBaseCallbackURL(
				undefined,
				"http://localhost:3000",
				false,
			);
			expect(result).toBe("http://localhost:3000");

			vi.unstubAllEnvs();
		});

		it("should prioritize env variables in order", () => {
			vi.stubEnv("BETTER_AUTH_CALLBACK_URL", "http://first:1000");
			vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_CALLBACK_URL", "http://second:2000");

			const result = getBaseCallbackURL(
				undefined,
				"http://localhost:3000",
				true,
			);
			// BETTER_AUTH_CALLBACK_URL should take priority
			expect(result).toBe("http://first:1000");

			vi.unstubAllEnvs();
		});
	});
});
