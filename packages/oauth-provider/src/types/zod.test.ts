import { describe, expect, it } from "vitest";
import { SafeUrlSchema } from "./zod";

describe("SafeUrlSchema", () => {
	describe("HTTPS enforcement", () => {
		it("should accept HTTPS URLs", () => {
			const result = SafeUrlSchema.safeParse("https://example.com/callback");
			expect(result.success).toBe(true);
		});

		it("should accept HTTP localhost", () => {
			const result = SafeUrlSchema.safeParse(
				"http://localhost:3000/api/auth/callback",
			);
			expect(result.success).toBe(true);
		});

		it("should accept HTTP 127.0.0.1", () => {
			const result = SafeUrlSchema.safeParse("http://127.0.0.1:8080/callback");
			expect(result.success).toBe(true);
		});

		it("should accept HTTP [::1] (IPv6 localhost)", () => {
			const result = SafeUrlSchema.safeParse("http://[::1]:3000/callback");
			expect(result.success).toBe(true);
		});

		it("should reject HTTP for non-localhost domains", () => {
			const result = SafeUrlSchema.safeParse("http://example.com/callback");
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.message).toContain("HTTPS");
		});

		it("should reject HTTP for IP addresses other than 127.0.0.1", () => {
			const result = SafeUrlSchema.safeParse("http://192.168.1.1/callback");
			expect(result.success).toBe(false);
		});

		it("should reject HTTP localhost.evil.com (subdomain attack)", () => {
			const result = SafeUrlSchema.safeParse(
				"http://localhost.evil.com/callback",
			);
			expect(result.success).toBe(false);
		});

		it("should reject HTTP 127.0.0.1.evil.com (subdomain attack)", () => {
			const result = SafeUrlSchema.safeParse(
				"http://127.0.0.1.evil.com/callback",
			);
			expect(result.success).toBe(false);
		});
	});

	describe("dangerous schemes", () => {
		it("should reject javascript: scheme", () => {
			const result = SafeUrlSchema.safeParse("javascript:alert(1)");
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.message).toContain("javascript:");
		});

		it("should reject data: scheme", () => {
			const result = SafeUrlSchema.safeParse("data:text/html,<script>");
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.message).toContain("data:");
		});

		it("should reject vbscript: scheme", () => {
			const result = SafeUrlSchema.safeParse("vbscript:msgbox");
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.message).toContain("vbscript:");
		});
	});

	describe("custom schemes (mobile apps)", () => {
		it("should accept custom schemes for mobile apps", () => {
			const result = SafeUrlSchema.safeParse("myapp://oauth/callback");
			expect(result.success).toBe(true);
		});
	});

	describe("URL parsing", () => {
		it("should reject invalid URLs", () => {
			const result = SafeUrlSchema.safeParse("not-a-valid-url");
			expect(result.success).toBe(false);
		});

		it("should reject empty strings", () => {
			const result = SafeUrlSchema.safeParse("");
			expect(result.success).toBe(false);
		});
	});
});
