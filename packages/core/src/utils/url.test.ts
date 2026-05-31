import { describe, expect, it } from "vitest";
import { SafeUrlSchema } from "./redirect-uri";
import { isSafeUrlScheme } from "./url";

describe("isSafeUrlScheme", () => {
	it("rejects code-execution schemes", () => {
		expect(isSafeUrlScheme("javascript:alert(1)")).toBe(false);
		expect(isSafeUrlScheme("data:text/html,<script>alert(1)</script>")).toBe(
			false,
		);
		expect(isSafeUrlScheme("vbscript:msgbox(1)")).toBe(false);
	});

	it("normalizes the scheme before checking (mixed case is still blocked)", () => {
		expect(isSafeUrlScheme("JavaScript:alert(1)")).toBe(false);
		expect(isSafeUrlScheme("JAVASCRIPT:alert(1)")).toBe(false);
	});

	it("allows http(s), relative paths, and custom app schemes", () => {
		expect(isSafeUrlScheme("https://example.com/callback")).toBe(true);
		expect(isSafeUrlScheme("http://localhost:3000/callback")).toBe(true);
		expect(isSafeUrlScheme("/dashboard")).toBe(true);
		expect(isSafeUrlScheme("myapp://callback")).toBe(true);
	});
});

describe("SafeUrlSchema", () => {
	it("rejects dangerous schemes", () => {
		expect(SafeUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
		expect(SafeUrlSchema.safeParse("data:text/html,x").success).toBe(false);
		expect(SafeUrlSchema.safeParse("vbscript:x").success).toBe(false);
	});

	it("requires https for non-loopback hosts", () => {
		expect(SafeUrlSchema.safeParse("http://example.com/cb").success).toBe(
			false,
		);
		expect(SafeUrlSchema.safeParse("https://example.com/cb").success).toBe(
			true,
		);
	});

	it("allows http for loopback hosts", () => {
		expect(SafeUrlSchema.safeParse("http://localhost:3000/cb").success).toBe(
			true,
		);
		expect(SafeUrlSchema.safeParse("http://127.0.0.1/cb").success).toBe(true);
	});

	it("rejects redirect URIs with a fragment component", () => {
		expect(
			SafeUrlSchema.safeParse("https://example.com/cb#token").success,
		).toBe(false);
		expect(SafeUrlSchema.safeParse("https://example.com/cb#").success).toBe(
			false,
		);
		expect(SafeUrlSchema.safeParse("https://example.com/cb").success).toBe(
			true,
		);
	});
});
