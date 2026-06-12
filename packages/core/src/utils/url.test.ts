import { describe, expect, it } from "vitest";
import { SafeUrlSchema } from "./redirect-uri";
import { isSafeUrlScheme, normalizePathname } from "./url";

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

describe("normalizePathname", () => {
	it("strips the basePath prefix", () => {
		expect(
			normalizePathname("http://localhost:3000/api/auth/sign-in", "/api/auth"),
		).toBe("/sign-in");
	});

	it("canonicalizes a trailing-slash basePath", () => {
		// A baseURL of "https://app.com/api/auth/" yields basePath "/api/auth/".
		// Without canonicalization the prefix never matches and the full path
		// leaks through to disabledPaths / rate-limit special-rule matching.
		expect(
			normalizePathname("http://localhost:3000/api/auth/sign-in", "/api/auth/"),
		).toBe("/sign-in");
		expect(
			normalizePathname("http://localhost:3000/api/auth", "/api/auth/"),
		).toBe("/");
	});

	it("treats '/' and empty basePath as no prefix", () => {
		expect(normalizePathname("http://localhost:3000/sign-in/", "/")).toBe(
			"/sign-in",
		);
		expect(normalizePathname("http://localhost:3000/sign-in", "")).toBe(
			"/sign-in",
		);
	});

	it("does not strip a basePath that is only a string prefix of the path", () => {
		expect(
			normalizePathname("http://localhost:3000/api/authevil/x", "/api/auth"),
		).toBe("/api/authevil/x");
	});

	it("returns '/' for a malformed URL", () => {
		expect(normalizePathname("not a url", "/api/auth")).toBe("/");
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
