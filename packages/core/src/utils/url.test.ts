import { describe, expect, it } from "vitest";
import {
	isReverseDomainPrivateUseRedirectUri,
	SafeUrlSchema,
} from "./redirect-uri";
import { appendQueryParams, isSafeUrlScheme, normalizePathname } from "./url";

describe("appendQueryParams", () => {
	it("should append query parameters before the fragment", () => {
		const params = new URLSearchParams({ error: "access denied" });

		expect(appendQueryParams("/login#step2", params)).toBe(
			"/login?error=access+denied#step2",
		);
		expect(
			appendQueryParams("https://example.com/login?lang=ko#step2", params),
		).toBe("https://example.com/login?lang=ko&error=access+denied#step2");
		expect(appendQueryParams("myapp://callback#step2", params)).toBe(
			"myapp://callback?error=access+denied#step2",
		);
	});

	it("should preserve existing query encoding", () => {
		const params = new URLSearchParams({ error: "access_denied" });

		expect(
			appendQueryParams("/search?q=hello%20world&next=~#results", params),
		).toBe("/search?q=hello%20world&next=~&error=access_denied#results");
	});

	it("should reuse a trailing query separator", () => {
		const params = new URLSearchParams({ error: "access_denied" });

		expect(appendQueryParams("/login?source=oauth&#retry", params)).toBe(
			"/login?source=oauth&error=access_denied#retry",
		);
	});

	it("should preserve empty fragment markers", () => {
		const params = new URLSearchParams({ error: "access_denied" });

		expect(appendQueryParams("/login#", params)).toBe(
			"/login?error=access_denied#",
		);
		expect(appendQueryParams("https://example.com/login#", params)).toBe(
			"https://example.com/login?error=access_denied#",
		);
	});

	it("should preserve backslashes in the query and fragment", () => {
		const params = new URLSearchParams({ error: "access_denied" });

		expect(appendQueryParams(`/callback?next=\\foo#\\bar`, params)).toBe(
			`/callback?next=\\foo&error=access_denied#\\bar`,
		);
	});

	it("should preserve the input when no parameters are provided", () => {
		expect(appendQueryParams("/login?#step2", new URLSearchParams())).toBe(
			"/login?#step2",
		);
	});

	it.each([
		new URLSearchParams({ error: "access_denied" }),
		new URLSearchParams(),
	])("should reject ambiguous relative URLs", (params) => {
		for (const input of [
			"//evil.example.com",
			"//better-auth.invalid/path",
			`/\\better-auth.invalid/path`,
		]) {
			expect(() => appendQueryParams(input, params)).toThrow(
				"Expected an absolute or root-relative URL",
			);
		}
	});
});

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

describe("isReverseDomainPrivateUseRedirectUri", () => {
	it("accepts only the RFC 8252 single-slash private-use form", () => {
		expect(
			isReverseDomainPrivateUseRedirectUri(
				new URL("com.example.app:/callback"),
			),
		).toBe(true);
		expect(
			isReverseDomainPrivateUseRedirectUri(new URL("com.example.app:callback")),
		).toBe(false);
		expect(
			isReverseDomainPrivateUseRedirectUri(
				new URL("com.example.app:///callback"),
			),
		).toBe(false);
	});
});
