import { describe, expect, it } from "vitest";
import { matchesRedirectURI } from "./redirect-uri";

describe("matchesRedirectURI", () => {
	describe("exact matches", () => {
		it("should match exact URIs (backward compatibility)", () => {
			expect(
				matchesRedirectURI(
					"https://example.com/callback",
					"https://example.com/callback",
				),
			).toBe(true);
		});

		it("should not match different URIs", () => {
			expect(
				matchesRedirectURI(
					"https://example.com/callback",
					"https://example.com/other",
				),
			).toBe(false);
		});

		it("should match exact URIs with query parameters", () => {
			expect(
				matchesRedirectURI(
					"https://example.com/callback?foo=bar",
					"https://example.com/callback?foo=bar",
				),
			).toBe(true);
		});

		it("should not match URIs with different query parameters", () => {
			expect(
				matchesRedirectURI(
					"https://example.com/callback?foo=bar",
					"https://example.com/callback?foo=baz",
				),
			).toBe(false);
		});
	});

	describe("host wildcard matching", () => {
		it("should match single subdomain wildcard", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"https://app.example.com/callback",
				),
			).toBe(true);
		});

		it("should match multiple subdomain levels with wildcard", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"https://app.staging.example.com/callback",
				),
			).toBe(false); // Single * only matches one level
		});

		it("should match different subdomains", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"https://api.example.com/callback",
				),
			).toBe(true);
		});

		it("should not match different domains", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"https://app.other.com/callback",
				),
			).toBe(false);
		});

		it("should not match root domain when wildcard is used", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"https://example.com/callback",
				),
			).toBe(false);
		});

		it("should match with port specified", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com:8080/callback",
					"https://app.example.com:8080/callback",
				),
			).toBe(true);
		});

		it("should not match different ports", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com:8080/callback",
					"https://app.example.com:3000/callback",
				),
			).toBe(false);
		});

		it("should match default HTTPS port (443) with or without explicit port", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"https://app.example.com:443/callback",
				),
			).toBe(true);
			expect(
				matchesRedirectURI(
					"https://*.example.com:443/callback",
					"https://app.example.com/callback",
				),
			).toBe(true);
		});

		it("should match default HTTP port (80) with or without explicit port", () => {
			expect(
				matchesRedirectURI(
					"http://*.example.com/callback",
					"http://app.example.com:80/callback",
				),
			).toBe(true);
			expect(
				matchesRedirectURI(
					"http://*.example.com:80/callback",
					"http://app.example.com/callback",
				),
			).toBe(true);
		});
	});

	describe("protocol validation", () => {
		it("should not match different protocols", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"http://app.example.com/callback",
				),
			).toBe(false);
		});

		it("should match same protocol", () => {
			expect(
				matchesRedirectURI(
					"http://*.example.com/callback",
					"http://app.example.com/callback",
				),
			).toBe(true);
		});
	});

	describe("path validation", () => {
		it("should require exact path match", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"https://app.example.com/other",
				),
			).toBe(false);
		});

		it("should match exact path", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/oauth/callback",
					"https://app.example.com/oauth/callback",
				),
			).toBe(true);
		});

		it("should match root path", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/",
					"https://app.example.com/",
				),
			).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("should handle invalid registered URI gracefully", () => {
			expect(
				matchesRedirectURI(
					"not-a-valid-uri",
					"https://app.example.com/callback",
				),
			).toBe(false);
		});

		it("should handle invalid requested URI gracefully", () => {
			expect(
				matchesRedirectURI(
					"https://*.example.com/callback",
					"not-a-valid-uri",
				),
			).toBe(false);
		});

		it("should handle empty strings", () => {
			expect(matchesRedirectURI("", "")).toBe(true);
			expect(matchesRedirectURI("", "https://example.com")).toBe(false);
			expect(matchesRedirectURI("https://example.com", "")).toBe(false);
		});

		it("should handle URIs without wildcards correctly", () => {
			// If registered URI has no wildcard, should only match exactly
			expect(
				matchesRedirectURI(
					"https://example.com/callback",
					"https://app.example.com/callback",
				),
			).toBe(false);
		});

		it("should handle wildcard in non-host part (should not match)", () => {
			// Wildcards only work in host, not in path
			expect(
				matchesRedirectURI(
					"https://example.com/*/callback",
					"https://example.com/oauth/callback",
				),
			).toBe(false);
		});
	});

	describe("multiple wildcard patterns", () => {
		it("should match first matching pattern in array", () => {
			const registeredURIs = [
				"https://exact.example.com/callback",
				"https://*.example.com/callback",
				"https://*.other.com/callback",
			];

			// Should match the wildcard pattern
			expect(
				registeredURIs.some((uri) =>
					matchesRedirectURI(uri, "https://app.example.com/callback"),
				),
			).toBe(true);

			// Should match exact pattern
			expect(
				registeredURIs.some((uri) =>
					matchesRedirectURI(uri, "https://exact.example.com/callback"),
				),
			).toBe(true);

			// Should not match
			expect(
				registeredURIs.some((uri) =>
					matchesRedirectURI(uri, "https://unknown.com/callback"),
				),
			).toBe(false);
		});
	});
});

