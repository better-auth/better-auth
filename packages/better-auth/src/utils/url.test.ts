import type { DynamicBaseURLConfig } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { matchesHostPattern } from "../auth/trusted-origins";
import {
	getBaseURL,
	getHostFromRequest,
	getProtocolFromRequest,
	isDynamicBaseURLConfig,
	resolveBaseURL,
	resolveDynamicBaseURL,
} from "./url";

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

describe("matchesHostPattern", () => {
	describe("exact matches", () => {
		it("should match exact hostname", () => {
			expect(matchesHostPattern("myapp.com", "myapp.com")).toBe(true);
		});

		it("should match hostname with port", () => {
			expect(matchesHostPattern("localhost:3000", "localhost:3000")).toBe(true);
		});

		it("should be case insensitive", () => {
			expect(matchesHostPattern("MyApp.COM", "myapp.com")).toBe(true);
			expect(matchesHostPattern("myapp.com", "MyApp.COM")).toBe(true);
		});

		it("should not match different hostnames", () => {
			expect(matchesHostPattern("evil.com", "myapp.com")).toBe(false);
		});
	});

	describe("wildcard patterns", () => {
		it("should match *.domain pattern (Vercel style)", () => {
			expect(matchesHostPattern("preview-123.vercel.app", "*.vercel.app")).toBe(
				true,
			);
			expect(matchesHostPattern("my-app-abc.vercel.app", "*.vercel.app")).toBe(
				true,
			);
			expect(matchesHostPattern("vercel.app", "*.vercel.app")).toBe(false);
		});

		it("should match prefix-* pattern", () => {
			expect(
				matchesHostPattern("preview-123.myapp.com", "preview-*.myapp.com"),
			).toBe(true);
			expect(
				matchesHostPattern("preview-abc.myapp.com", "preview-*.myapp.com"),
			).toBe(true);
			expect(
				matchesHostPattern("staging-123.myapp.com", "preview-*.myapp.com"),
			).toBe(false);
		});

		it("should match middle wildcard pattern", () => {
			expect(
				matchesHostPattern(
					"api-v1-staging.myapp.com",
					"api-*-staging.myapp.com",
				),
			).toBe(true);
			expect(
				matchesHostPattern(
					"api-v2-staging.myapp.com",
					"api-*-staging.myapp.com",
				),
			).toBe(true);
		});

		it("should match ? single character wildcard", () => {
			expect(matchesHostPattern("api1.myapp.com", "api?.myapp.com")).toBe(true);
			expect(matchesHostPattern("api2.myapp.com", "api?.myapp.com")).toBe(true);
			expect(matchesHostPattern("api12.myapp.com", "api?.myapp.com")).toBe(
				false,
			);
		});
	});

	describe("protocol handling", () => {
		it("should strip protocol from host if accidentally included", () => {
			expect(matchesHostPattern("https://myapp.com", "myapp.com")).toBe(true);
			expect(matchesHostPattern("myapp.com", "https://myapp.com")).toBe(true);
		});

		it("should strip path from host if accidentally included", () => {
			expect(matchesHostPattern("myapp.com/api/auth", "myapp.com")).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("should return false for empty strings", () => {
			expect(matchesHostPattern("", "myapp.com")).toBe(false);
			expect(matchesHostPattern("myapp.com", "")).toBe(false);
			expect(matchesHostPattern("", "")).toBe(false);
		});
	});
});

describe("getHostFromRequest", () => {
	it("should prefer x-forwarded-host over host header", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "myapp.vercel.app",
				host: "localhost:3000",
			},
		});

		expect(getHostFromRequest(request)).toBe("myapp.vercel.app");
	});

	it("should fall back to host header if x-forwarded-host is not set", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				host: "localhost:3000",
			},
		});

		expect(getHostFromRequest(request)).toBe("localhost:3000");
	});

	it("should fall back to request URL if no headers", () => {
		const request = new Request("http://example.com:8080/test");

		expect(getHostFromRequest(request)).toBe("example.com:8080");
	});

	it("should reject malicious x-forwarded-host and fall back", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "../../../etc/passwd",
				host: "localhost:3000",
			},
		});

		expect(getHostFromRequest(request)).toBe("localhost:3000");
	});
});

describe("getProtocolFromRequest", () => {
	it("should use explicit protocol config", () => {
		const request = new Request("http://localhost:3000/test");

		expect(getProtocolFromRequest(request, "https")).toBe("https");
		expect(getProtocolFromRequest(request, "http")).toBe("http");
	});

	it("should use x-forwarded-proto when set to auto", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-proto": "https",
			},
		});

		expect(getProtocolFromRequest(request, "auto")).toBe("https");
	});

	it("should fall back to request URL protocol", () => {
		const request = new Request("https://example.com/test");

		expect(getProtocolFromRequest(request, "auto")).toBe("https");
	});

	it("should default to https for security", () => {
		const request = new Request("http://localhost:3000/test");

		expect(getProtocolFromRequest(request, "auto")).toBe("http");
	});
});

describe("isDynamicBaseURLConfig", () => {
	it("should return true for valid dynamic config", () => {
		const config: DynamicBaseURLConfig = {
			allowedHosts: ["myapp.com", "*.vercel.app"],
		};

		expect(isDynamicBaseURLConfig(config)).toBe(true);
	});

	it("should return false for string config", () => {
		expect(isDynamicBaseURLConfig("https://myapp.com")).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isDynamicBaseURLConfig(undefined)).toBe(false);
	});

	it("should return false for object without allowedHosts", () => {
		expect(isDynamicBaseURLConfig({} as any)).toBe(false);
	});
});

describe("resolveDynamicBaseURL", () => {
	const config: DynamicBaseURLConfig = {
		allowedHosts: ["myapp.com", "*.vercel.app", "preview-*.myapp.com"],
	};

	it("should resolve allowed host from x-forwarded-host", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "preview-123.vercel.app",
				"x-forwarded-proto": "https",
			},
		});

		const result = resolveDynamicBaseURL(config, request, "/api/auth");

		expect(result).toBe("https://preview-123.vercel.app/api/auth");
	});

	it("should resolve allowed exact match host", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "myapp.com",
				"x-forwarded-proto": "https",
			},
		});

		const result = resolveDynamicBaseURL(config, request, "/api/auth");

		expect(result).toBe("https://myapp.com/api/auth");
	});

	it("should resolve preview wildcard pattern", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "preview-abc123.myapp.com",
				"x-forwarded-proto": "https",
			},
		});

		const result = resolveDynamicBaseURL(config, request, "/api/auth");

		expect(result).toBe("https://preview-abc123.myapp.com/api/auth");
	});

	it("should throw for disallowed host without fallback", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "evil.com",
				"x-forwarded-proto": "https",
			},
		});

		expect(() => resolveDynamicBaseURL(config, request, "/api/auth")).toThrow(
			'Host "evil.com" is not in the allowed hosts list',
		);
	});

	it("should use fallback for disallowed host", () => {
		const configWithFallback: DynamicBaseURLConfig = {
			allowedHosts: ["myapp.com"],
			fallback: "https://myapp.com",
		};

		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "evil.com",
				"x-forwarded-proto": "https",
			},
		});

		const result = resolveDynamicBaseURL(
			configWithFallback,
			request,
			"/api/auth",
		);

		expect(result).toBe("https://myapp.com/api/auth");
	});

	it("should respect protocol config", () => {
		const configWithProtocol: DynamicBaseURLConfig = {
			allowedHosts: ["myapp.com"],
			protocol: "https",
		};

		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "myapp.com",
				"x-forwarded-proto": "http", // This should be overridden
			},
		});

		const result = resolveDynamicBaseURL(
			configWithProtocol,
			request,
			"/api/auth",
		);

		expect(result).toBe("https://myapp.com/api/auth");
	});
});

describe("resolveBaseURL", () => {
	it("should handle static string config", () => {
		const result = resolveBaseURL("https://myapp.com", "/api/auth");

		expect(result).toBe("https://myapp.com/api/auth");
	});

	it("should handle dynamic config with request", () => {
		const config: DynamicBaseURLConfig = {
			allowedHosts: ["myapp.com", "*.vercel.app"],
		};

		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "preview.vercel.app",
				"x-forwarded-proto": "https",
			},
		});

		const result = resolveBaseURL(config, "/api/auth", request);

		expect(result).toBe("https://preview.vercel.app/api/auth");
	});

	it("should fall back to legacy behavior for undefined config", () => {
		const request = new Request("http://example.com:3000/test");

		const result = resolveBaseURL(undefined, "/api/auth", request);

		expect(result).toBe("http://example.com:3000/api/auth");
	});
});
