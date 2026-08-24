import { describe, expect, it } from "vitest";
import {
	domainMatches,
	parseProviderDomains,
	parseProviderEmailVerified,
	validateEmailDomain,
} from "./utils";

describe("parseProviderEmailVerified", () => {
	it('treats only boolean true and the string "true" as verified', () => {
		expect(parseProviderEmailVerified(true)).toBe(true);
		expect(parseProviderEmailVerified("true")).toBe(true);
	});

	it('treats the string "false" as unverified (the coercion bug)', () => {
		expect(parseProviderEmailVerified("false")).toBe(false);
	});

	it("treats every other value as unverified", () => {
		for (const value of [
			false,
			"False",
			"TRUE",
			"0",
			"1",
			0,
			1,
			"",
			" ",
			undefined,
			null,
			{},
			[],
			["true"],
		]) {
			expect(parseProviderEmailVerified(value)).toBe(false);
		}
	});
});

describe("parseProviderDomains", () => {
	it("normalizes comma-separated provider domains", () => {
		expect(
			parseProviderDomains(
				"https://company.com/path, subsidiary.com, COMPANY.com",
			),
		).toEqual(["company.com", "subsidiary.com"]);
	});

	it("returns null when no domain can be parsed", () => {
		expect(parseProviderDomains(", ,")).toBeNull();
		expect(parseProviderDomains("")).toBeNull();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/7324
 */
describe("validateEmailDomain", () => {
	// Tests for issue #7324: Enterprise multi-domain SSO support
	// https://github.com/better-auth/better-auth/issues/7324

	describe("single domain", () => {
		it("should validate email matches domain exactly", () => {
			expect(validateEmailDomain("user@company.com", "company.com")).toBe(true);
		});

		it("should validate email matches subdomain", () => {
			expect(validateEmailDomain("user@hr.company.com", "company.com")).toBe(
				true,
			);
			expect(
				validateEmailDomain("user@dept.hr.company.com", "company.com"),
			).toBe(true);
		});

		it("should reject email from different domain", () => {
			expect(validateEmailDomain("user@other.com", "company.com")).toBe(false);
		});

		it("should reject email where domain is a suffix but not subdomain", () => {
			// "notcompany.com" should not match "company.com"
			expect(validateEmailDomain("user@notcompany.com", "company.com")).toBe(
				false,
			);
		});

		it("should be case-insensitive", () => {
			expect(validateEmailDomain("USER@COMPANY.COM", "company.com")).toBe(true);
			expect(validateEmailDomain("user@company.com", "COMPANY.COM")).toBe(true);
		});
	});

	describe("multiple domains (enterprise multi-domain SSO)", () => {
		// Issue #7324: Single IdP (e.g., Okta) serving multiple email domains
		it("should validate email against any domain in comma-separated list", () => {
			const domains = "company.com,subsidiary.com,acquired-company.com";
			expect(validateEmailDomain("user@company.com", domains)).toBe(true);
			expect(validateEmailDomain("user@subsidiary.com", domains)).toBe(true);
			expect(validateEmailDomain("user@acquired-company.com", domains)).toBe(
				true,
			);
		});

		it("should validate subdomains for any domain in the list", () => {
			const domains = "company.com,subsidiary.com";
			expect(validateEmailDomain("user@hr.company.com", domains)).toBe(true);
			expect(validateEmailDomain("user@dept.subsidiary.com", domains)).toBe(
				true,
			);
		});

		it("should reject email not matching any domain", () => {
			const domains = "company.com,subsidiary.com,acquired-company.com";
			expect(validateEmailDomain("user@other.com", domains)).toBe(false);
			expect(validateEmailDomain("user@notcompany.com", domains)).toBe(false);
		});

		it("should handle whitespace in domain list", () => {
			const domains = "company.com, subsidiary.com , acquired-company.com";
			expect(validateEmailDomain("user@company.com", domains)).toBe(true);
			expect(validateEmailDomain("user@subsidiary.com", domains)).toBe(true);
			expect(validateEmailDomain("user@acquired-company.com", domains)).toBe(
				true,
			);
		});

		it("should handle empty domains in list gracefully", () => {
			const domains = "company.com,,subsidiary.com";
			expect(validateEmailDomain("user@company.com", domains)).toBe(true);
			expect(validateEmailDomain("user@subsidiary.com", domains)).toBe(true);
		});

		it("should be case-insensitive for multiple domains", () => {
			const domains = "Company.COM,SUBSIDIARY.com";
			expect(validateEmailDomain("user@company.com", domains)).toBe(true);
			expect(validateEmailDomain("USER@SUBSIDIARY.COM", domains)).toBe(true);
		});

		it("should use the same normalized domains as ownership verification", () => {
			const domains = "https://attacker.com/path,victim.com";
			expect(domainMatches("attacker.com", domains)).toBe(true);
			expect(validateEmailDomain("user@attacker.com", domains)).toBe(true);
			expect(validateEmailDomain("user@victim.com", domains)).toBe(true);
		});

		it("should not normalize malformed email domains", () => {
			expect(
				validateEmailDomain("user@https://victim.com/path", "victim.com"),
			).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("should return false for empty email", () => {
			expect(validateEmailDomain("", "company.com")).toBe(false);
		});

		it("should return false for empty domain", () => {
			expect(validateEmailDomain("user@company.com", "")).toBe(false);
		});

		it("should return false for email without @", () => {
			expect(validateEmailDomain("usercompany.com", "company.com")).toBe(false);
		});

		it("should return false for domain list with only whitespace/commas", () => {
			expect(validateEmailDomain("user@company.com", ", ,")).toBe(false);
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8361
 */
describe("parseProviderDomains hostname normalization", () => {
	it("should extract hostname from a bare domain", () => {
		expect(parseProviderDomains("github.com")).toEqual(["github.com"]);
	});

	it("should extract hostname from a full URL", () => {
		expect(parseProviderDomains("https://github.com")).toEqual(["github.com"]);
	});

	it("should extract hostname from a URL with port", () => {
		expect(parseProviderDomains("https://github.com:8081")).toEqual([
			"github.com",
		]);
	});

	it("should extract hostname from a subdomain", () => {
		expect(parseProviderDomains("auth.github.com")).toEqual([
			"auth.github.com",
		]);
	});

	it("should extract hostname from a URL with path", () => {
		expect(parseProviderDomains("https://github.com/path/to/resource")).toEqual(
			["github.com"],
		);
	});

	it("should return null for an empty string", () => {
		expect(parseProviderDomains("")).toBeNull();
	});
});
