import { describe, expect, it } from "vitest";
import {
	isReverseDomainPrivateUseRedirectUri,
	SafeUrlSchema,
} from "./redirect-uri";
import {
	appendQueryParams,
	appendURLPath,
	appendURLSegment,
	isSafeUrlScheme,
	normalizePathname,
} from "./url";

describe("appendURLPath", () => {
	it("treats an empty base URL as a root-relative path", () => {
		expect(appendURLPath("", "/reset-password")).toBe("/reset-password");
	});

	it("appends to a root-relative base URL", () => {
		expect(appendURLPath("/api/auth/", "/get-session")).toBe(
			"/api/auth/get-session",
		);
		expect(appendURLPath("/api/auth?lang=ko#step", "/get-session")).toBe(
			"/api/auth/get-session?lang=ko#step",
		);
	});

	/**
	 * @see https://www.rfc-editor.org/rfc/rfc3986.html#section-4.2
	 */
	it("rejects authority-like paths", () => {
		expect(() => appendURLPath("/", "//evil.example/path")).toThrow(TypeError);
	});

	/**
	 * @see https://url.spec.whatwg.org/#url-path-segment
	 * @see https://www.rfc-editor.org/rfc/rfc3986.html#section-4.2
	 */
	it("rejects authority-like results after normalizing the base", () => {
		for (const base of ["/a/..//evil.example", "/%2e//evil.example"]) {
			expect(() => appendURLPath(base, "/callback")).toThrow(TypeError);
		}
		expect(appendURLPath("/a/..", "/callback")).toBe("/callback");
	});

	/**
	 * @see https://url.spec.whatwg.org/#dom-url-pathname
	 */
	it("supports an empty path on a hierarchical URL", () => {
		expect(appendURLPath("foo://host", "/callback")).toBe(
			"foo://host/callback",
		);
	});

	it("preserves path separators and existing escapes", () => {
		expect(
			appendURLPath(
				"https://auth.example.com/api/auth/",
				"/.well-known/jwks.json",
			),
		).toBe("https://auth.example.com/api/auth/.well-known/jwks.json");
		expect(
			appendURLPath("https://auth.example.com/api/auth", "/keys/%2F"),
		).toBe("https://auth.example.com/api/auth/keys/%2F");
		expect(
			appendURLPath("https://auth.example.com/api/auth", "/keys/%FE"),
		).toBe("https://auth.example.com/api/auth/keys/%FE");
	});

	it("keeps the base path and joins paths at one slash boundary", () => {
		expect(
			appendURLPath("https://auth.example.com/api/auth/", "/oauth2/token"),
		).toBe("https://auth.example.com/api/auth/oauth2/token");
		expect(appendURLPath("https://auth.example.com/", "/oauth2/userinfo")).toBe(
			"https://auth.example.com/oauth2/userinfo",
		);
		expect(
			appendURLPath("https://auth.example.com/api/auth///", "/oauth2"),
		).toBe("https://auth.example.com/api/auth/oauth2");
		expect(
			appendURLPath("https://auth.example.com/api//auth/", "/oauth2"),
		).toBe("https://auth.example.com/api//auth/oauth2");
	});

	it("preserves an encoded base path", () => {
		expect(
			appendURLPath("https://auth.example.com/tenant%2Fone/", "/team/member"),
		).toBe("https://auth.example.com/tenant%2Fone/team/member");
		expect(appendURLPath("https://auth.example.com/%FE/", "/jwks")).toBe(
			"https://auth.example.com/%FE/jwks",
		);
	});

	it("encodes characters in an unescaped path without changing its separators", () => {
		expect(
			appendURLPath("https://auth.example.com/api/auth", "/사용자/a b"),
		).toBe(
			"https://auth.example.com/api/auth/%EC%82%AC%EC%9A%A9%EC%9E%90/a%20b",
		);
	});

	it("preserves existing query and fragment components", () => {
		expect(
			appendURLPath(
				"https://auth.example.com/api/auth?lang=ko#details",
				"/oauth2/token",
			),
		).toBe("https://auth.example.com/api/auth/oauth2/token?lang=ko#details");
	});

	it("rejects paths that cannot be appended as given", () => {
		expect(() => appendURLPath("//evil.example", "/oauth2")).toThrow(TypeError);
		expect(() => appendURLPath("mailto:user@example.com", "/oauth2")).toThrow(
			TypeError,
		);
		expect(() => appendURLPath("https://auth.example.com", "oauth2")).toThrow(
			TypeError,
		);
		expect(() =>
			appendURLPath("https://auth.example.com/api/auth", "/.."),
		).toThrow(TypeError);
		expect(() =>
			appendURLPath("https://auth.example.com/api/auth", "/a/%2e%2e/b"),
		).toThrow(TypeError);
		expect(() =>
			appendURLPath("https://auth.example.com/api/auth", "/jwks?x=1"),
		).toThrow(TypeError);
	});

	/**
	 * @see https://url.spec.whatwg.org/#concept-basic-url-parser
	 */
	it("rejects tabs and newlines before URL parsing strips them", () => {
		for (const path of ["/a\tb", "/a\nb", "/a\rb"]) {
			expect(() => appendURLPath("https://auth.example.com", path)).toThrow(
				TypeError,
			);
		}
	});

	it("rejects every URL dot-segment spelling", () => {
		for (const segment of [".", "%2e", "..", ".%2e", "%2e.", "%2e%2e"]) {
			expect(() =>
				appendURLPath("https://auth.example.com/api/auth", `/a/${segment}/b`),
			).toThrow(TypeError);
		}
	});
});

describe("appendURLSegment", () => {
	it("treats an empty base URL as a root-relative path", () => {
		expect(appendURLSegment("", "team/member")).toBe("/team%2Fmember");
	});

	it("encodes a segment under a root-relative base URL", () => {
		expect(appendURLSegment("/api/auth/callback", "team/member")).toBe(
			"/api/auth/callback/team%2Fmember",
		);
	});

	it("encodes a raw segment without changing path structure", () => {
		expect(
			appendURLSegment(
				"https://auth.example.com/tenant%2Fone/callback",
				"team/member?x#y",
			),
		).toBe(
			"https://auth.example.com/tenant%2Fone/callback/team%2Fmember%3Fx%23y",
		);
		expect(appendURLSegment("https://auth.example.com", "%2F")).toBe(
			"https://auth.example.com/%252F",
		);
		expect(appendURLSegment("https://auth.example.com", "%ZZ")).toBe(
			"https://auth.example.com/%25ZZ",
		);
		expect(appendURLSegment("https://auth.example.com", "한글")).toBe(
			"https://auth.example.com/%ED%95%9C%EA%B8%80",
		);
	});

	it("rejects empty and dot segments", () => {
		for (const segment of ["", ".", ".."] as const) {
			expect(() =>
				appendURLSegment("https://auth.example.com/api/auth", segment),
			).toThrow(TypeError);
		}
	});
});

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
