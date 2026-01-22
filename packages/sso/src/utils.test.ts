import { describe, expect, it } from "vitest";
import { validateEmailDomain } from "./utils";

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
