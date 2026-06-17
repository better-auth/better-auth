import { describe, expect, it } from "vitest";
import {
	getBaseURL,
	getHostFromSource,
	getProtocolFromSource,
	getRequestOrigin,
	trimTrailingSlashes,
} from "./url";

describe("trimTrailingSlashes", () => {
	it("should remove trailing slashes", () => {
		expect(trimTrailingSlashes("https://example.com///")).toBe(
			"https://example.com",
		);
		expect(trimTrailingSlashes("///")).toBe("");
	});

	it("should leave non-trailing slashes unchanged", () => {
		const value = `https://example.com/${"/".repeat(10_000)}a`;

		expect(trimTrailingSlashes(value)).toBe(value);
	});
});

describe("getBaseURL", () => {
	it("should append the auth path after trailing slashes", () => {
		expect(
			getBaseURL("https://example.com////", "/auth", undefined, false),
		).toBe("https://example.com/auth");
	});

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

describe("getHostFromSource", () => {
	it("should prefer x-forwarded-host over host header when trustedProxyHeaders is true", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "myapp.vercel.app",
				host: "localhost:3000",
			},
		});

		expect(getHostFromSource(request, true)).toBe("myapp.vercel.app");
	});

	it("should ignore x-forwarded-host when trustedProxyHeaders is falsy", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "myapp.vercel.app",
				host: "localhost:3000",
			},
		});

		expect(getHostFromSource(request)).toBe("localhost:3000");
	});

	it("should fall back to host header if x-forwarded-host is not set", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				host: "localhost:3000",
			},
		});

		expect(getHostFromSource(request, true)).toBe("localhost:3000");
	});

	it("should fall back to request URL if no headers", () => {
		const request = new Request("http://example.com:8080/test");

		expect(getHostFromSource(request)).toBe("example.com:8080");
	});

	it("should reject malicious x-forwarded-host and fall back", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "../../../etc/passwd",
				host: "localhost:3000",
			},
		});

		expect(getHostFromSource(request, true)).toBe("localhost:3000");
	});
});

describe("getProtocolFromSource", () => {
	it("should use explicit protocol config", () => {
		const request = new Request("http://localhost:3000/test");

		expect(getProtocolFromSource(request, "https")).toBe("https");
		expect(getProtocolFromSource(request, "http")).toBe("http");
	});

	it("should use x-forwarded-proto when trustedProxyHeaders is true", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-proto": "https",
			},
		});

		expect(getProtocolFromSource(request, "auto", true)).toBe("https");
	});

	it("should ignore x-forwarded-proto when trustedProxyHeaders is falsy", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-proto": "https",
			},
		});

		expect(getProtocolFromSource(request, "auto")).toBe("http");
	});

	it("should fall back to request URL protocol", () => {
		const request = new Request("https://example.com/test");

		expect(getProtocolFromSource(request, "auto")).toBe("https");
	});

	it("should use request URL protocol as fallback", () => {
		const request = new Request("http://localhost:3000/test");

		expect(getProtocolFromSource(request, "auto")).toBe("http");
	});
});

describe("getRequestOrigin", () => {
	it("derives the origin from the request URL", () => {
		const request = new Request("https://app.example.com/api/auth/session");
		expect(getRequestOrigin(request)).toBe("https://app.example.com");
	});

	it("honors x-forwarded-host when proxy headers are trusted", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "tenant.example.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(getRequestOrigin(request, undefined, true)).toBe(
			"https://tenant.example.com",
		);
	});

	it("ignores x-forwarded-host when proxy headers are not trusted", () => {
		const request = new Request("http://localhost:3000/test", {
			headers: {
				"x-forwarded-host": "evil.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(getRequestOrigin(request, undefined, false)).toBe(
			"http://localhost:3000",
		);
	});

	it("returns null when no host can be determined", () => {
		const headers = new Headers();
		expect(getRequestOrigin(headers)).toBeNull();
	});
});
