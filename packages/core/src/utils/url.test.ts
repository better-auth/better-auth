import { describe, expect, it } from "vitest";
import {
	isNativePrivateUseRedirectUri,
	isReverseDomainPrivateUseRedirectUri,
	SafeUrlSchema,
} from "./redirect-uri";
import {
	appendQueryParams,
	appendURLPath,
	appendURLSegments,
	isSafeUrlScheme,
	normalizePathname,
} from "./url";

describe("appendURLPath", () => {
	it.each([
		"https://Auth.Example.com/api/auth",
		"https://auth.example.com:443/api/auth",
		"https://bücher.example/api/auth",
		"https://auth.example.com/api^auth",
		"https://auth.example.com/tenant%2fone",
	])("preserves the configured base URL spelling: %s", (baseURL) => {
		expect(appendURLPath(baseURL, "/oauth2/userinfo")).toBe(
			`${baseURL}/oauth2/userinfo`,
		);
	});

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
	it("preserves root-relative path text without introducing an authority", () => {
		for (const base of ["/a/..//evil.example", "/%2e//evil.example"]) {
			const result = appendURLPath(base, "/callback");
			expect(result).toBe(`${base}/callback`);
			expect(new URL(result, "https://app.example.com").origin).toBe(
				"https://app.example.com",
			);
		}
		expect(appendURLPath("/a/..", "/callback")).toBe("/a/../callback");
	});

	/**
	 * @see https://url.spec.whatwg.org/#dom-url-pathname
	 */
	it("supports an empty path on a hierarchical URL", () => {
		expect(appendURLPath("foo://host", "/callback")).toBe(
			"foo://host/callback",
		);
	});

	it.each([
		["foo:/api", "foo:/api/callback"],
		["foo://", "foo:///callback"],
		["file:///", "file:///callback"],
		["file:///tmp/auth/", "file:///tmp/auth/callback"],
		["https://Auth.Example.com:443/", "https://Auth.Example.com:443/callback"],
	])("preserves the scheme and authority of %s", (baseURL, expectedURL) => {
		expect(appendURLPath(baseURL, "/callback")).toBe(expectedURL);
	});

	it.each([
		"https://example.com/\napi",
		"https://example.com/api\u0000auth",
		"https://example.com/api\u001fauth",
		"https://example.com/api\u007fauth",
		" https://example.com/api ",
	])("rejects control characters and surrounding whitespace: %s", (baseURL) => {
		expect(() => appendURLPath(baseURL, "/callback")).toThrow(TypeError);
	});

	it("preserves suffix text and encoded path text", () => {
		expect(
			appendURLPath(
				"https://Auth.Example.com:443/기존%2f경로/?next=a%2Fb#",
				"/%EC%83%88%20%EA%B2%BD%EB%A1%9C/%2F",
			),
		).toBe(
			"https://Auth.Example.com:443/기존%2f경로/%EC%83%88%20%EA%B2%BD%EB%A1%9C/%2F?next=a%2Fb#",
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
		).toBe("https://auth.example.com/api/auth///oauth2");
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

	it("preserves base path bytes when URL parsing normalizes dot segments", () => {
		expect(appendURLPath("https://example.com/a//%2e/", "/callback")).toBe(
			"https://example.com/a//%2e/callback",
		);
		expect(appendURLPath("https://example.com/a/../", "/callback")).toBe(
			"https://example.com/a/../callback",
		);
	});

	it("preserves pathname text without encoding or decoding it", () => {
		expect(appendURLPath("/auth", "/사용자/a b")).toBe("/auth/사용자/a b");
		expect(appendURLPath("/auth", "/a%zz")).toBe("/auth/a%zz");
	});

	it.each([
		"/-._~!$&'()*+,;=:@/AZaz09",
		"/%00%2f%FE",
	])("accepts encoded path characters without changing them: %s", (path) => {
		expect(appendURLPath("/auth", path)).toBe(`/auth${path}`);
	});

	it.each([
		"/%",
		"/%0",
		"/%gg",
		"/a^b",
		"/[]",
	])("does not act as a URI syntax validator: %s", (path) => {
		expect(appendURLPath("/auth", path)).toBe(`/auth${path}`);
	});

	it.each([
		"/token?x=1",
		"/token#step",
		"/a\\b",
		"//evil.example",
	])("rejects paths that introduce another URL component: %s", (path) => {
		expect(() => appendURLPath("/auth", path)).toThrow(TypeError);
	});

	it.each([
		"\n",
		"\r",
		"\r\n",
		"\u2028",
		"\u2029",
	])("rejects controls and trailing whitespace in the appended path: %j", (ending) => {
		expect(() => appendURLPath("/auth", `/token${ending}`)).toThrow(TypeError);
	});

	it("preserves path structure without resolving dot segments", () => {
		expect(appendURLPath("https://example.com/auth", "/a/../b//c")).toBe(
			"https://example.com/auth/a/../b//c",
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

	it("preserves backslashes in existing query and fragment text", () => {
		expect(
			appendURLPath("https://example.com/auth?next=\\foo#\\bar", "/token"),
		).toBe("https://example.com/auth/token?next=\\foo#\\bar");
	});

	it("preserves Unicode line separators in existing suffix text", () => {
		expect(
			appendURLPath("https://example.com/auth?q=a\u2028b#c\u2029d", "/token"),
		).toBe("https://example.com/auth/token?q=a\u2028b#c\u2029d");
	});

	it.each([
		"https://example.com/a\\b",
		"/a\\b",
	])("rejects backslashes in the base path: %s", (baseURL) => {
		expect(() => appendURLPath(baseURL, "/callback")).toThrow(TypeError);
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
			appendURLPath("https://auth.example.com/api/auth", "/jwks?x=1"),
		).toThrow(TypeError);
	});

	/**
	 * @see https://url.spec.whatwg.org/#concept-basic-url-parser
	 */
	it("rejects tabs and newlines before URL parsing strips them", () => {
		for (const path of [
			"/a\tb",
			"/a\nb",
			"/a\rb",
			"/a\u0000b",
			"/a\u001fb",
			"/a\u007fb",
		]) {
			expect(() => appendURLPath("https://auth.example.com", path)).toThrow(
				TypeError,
			);
		}
	});

	it("preserves every encoded dot-segment spelling without normalizing it", () => {
		for (const segment of [".", "%2e", "..", ".%2e", "%2e.", "%2e%2e"]) {
			expect(
				appendURLPath("https://auth.example.com/api/auth", `/a/${segment}/b`),
			).toBe(`https://auth.example.com/api/auth/a/${segment}/b`);
		}
	});
});

describe("appendURLSegments", () => {
	it("encodes each raw value independently", () => {
		expect(
			appendURLSegments(
				"https://Auth.Example.com:443/api/auth/",
				"callback",
				"team/member?x#y%2F",
			),
		).toBe(
			"https://Auth.Example.com:443/api/auth/callback/team%2Fmember%3Fx%23y%252F",
		);
	});

	it("encodes raw Unicode and spaces as data", () => {
		expect(appendURLSegments("https://example.com/auth", "사용자", "a b")).toBe(
			"https://example.com/auth/%EC%82%AC%EC%9A%A9%EC%9E%90/a%20b",
		);
	});

	/**
	 * @see https://tc39.es/ecma262/multipage/global-object.html#sec-encode
	 */
	it.each([
		"\ud800",
		"\udfff",
		"a\ud800",
		"\udfffz",
	])("preserves URIError for a lone surrogate: %j", (segment) => {
		expect(() => appendURLSegments("/auth", "callback", segment)).toThrow(
			URIError,
		);
	});

	it("encodes a valid surrogate pair", () => {
		expect(appendURLSegments("/auth", "user\ud83d\ude00")).toBe(
			"/auth/user%F0%9F%98%80",
		);
	});

	it("propagates TypeError when the URL cannot accept a path", () => {
		expect(() => appendURLSegments("urn:example:id", "callback")).toThrow(
			TypeError,
		);
	});

	it("retains existing query and fragment text", () => {
		expect(
			appendURLSegments("/auth?x=a%20b#step", "callback", "acme:prod"),
		).toBe("/auth/callback/acme:prod?x=a%20b#step");
	});

	it.each([
		"",
		".",
		"..",
	])("rejects an unrepresentable raw segment: %j", (segment) => {
		expect(() => appendURLSegments("/auth", "callback", segment)).toThrow(
			TypeError,
		);
	});

	/**
	 * @see https://www.rfc-editor.org/rfc/rfc3986.html#section-3.3
	 */
	it.each([
		"acme:prod",
		"okta@corp",
		"a+b",
		"!$&'()*+,;=:@~",
	])("preserves valid path-segment characters: %s", (segment) => {
		expect(appendURLSegments("https://example.com/callback", segment)).toBe(
			`https://example.com/callback/${segment}`,
		);
	});

	it("treats an empty base URL as a root-relative path", () => {
		expect(appendURLSegments("", "team/member")).toBe("/team%2Fmember");
	});

	it("encodes a segment under a root-relative base URL", () => {
		expect(appendURLSegments("/api/auth/callback", "team/member")).toBe(
			"/api/auth/callback/team%2Fmember",
		);
	});

	it("encodes a raw segment without changing path structure", () => {
		expect(
			appendURLSegments(
				"https://auth.example.com/tenant%2Fone/callback",
				"team/member?x#y",
			),
		).toBe(
			"https://auth.example.com/tenant%2Fone/callback/team%2Fmember%3Fx%23y",
		);
		expect(appendURLSegments("https://auth.example.com", "%2F")).toBe(
			"https://auth.example.com/%252F",
		);
		expect(appendURLSegments("https://auth.example.com", "%ZZ")).toBe(
			"https://auth.example.com/%25ZZ",
		);
		expect(appendURLSegments("https://auth.example.com", "한글")).toBe(
			"https://auth.example.com/%ED%95%9C%EA%B8%80",
		);
	});

	it("rejects empty and dot segments", () => {
		for (const segment of ["", ".", ".."] as const) {
			expect(() =>
				appendURLSegments("https://auth.example.com/api/auth", segment),
			).toThrow(TypeError);
		}
	});

	it.each([
		"/",
		"?",
		"#",
		"\\",
		"%",
		"\u0000",
		" ",
		"한글",
	])("keeps a raw value within one segment: %j", (segment) => {
		const result = new URL(
			appendURLSegments("https://example.com/base", segment),
		);
		expect(result.origin).toBe("https://example.com");
		expect(result.search).toBe("");
		expect(result.hash).toBe("");
		expect(result.pathname.split("/")).toHaveLength(3);
		expect(decodeURIComponent(result.pathname.slice("/base/".length))).toBe(
			segment,
		);
	});
});

describe("appendQueryParams", () => {
	it.each([
		"https://Auth.Example.com:443/api/auth",
		"https://bücher.example/api/auth",
		"https://example.com/api^auth",
	])("preserves URL spelling when appending query parameters: %s", (url) => {
		expect(
			appendQueryParams(url, new URLSearchParams({ next: "/dashboard" })),
		).toBe(`${url}?next=%2Fdashboard`);
	});

	it("composes path, segment, and query without reserializing the base", () => {
		const base = "https://Auth.Example.com:443/api/auth/?lang=ko#details";
		const callback = appendURLSegments(
			appendURLPath(base, "/callback"),
			"acme:prod",
		);
		expect(
			appendQueryParams(callback, new URLSearchParams({ next: "/dashboard" })),
		).toBe(
			"https://Auth.Example.com:443/api/auth/callback/acme:prod?lang=ko&next=%2Fdashboard#details",
		);
		expect(base).toBe("https://Auth.Example.com:443/api/auth/?lang=ko#details");
	});

	it("preserves an empty query marker and repeated existing parameters", () => {
		expect(
			appendQueryParams("/callback?#", new URLSearchParams({ x: "3" })),
		).toBe("/callback?x=3#");
		expect(
			appendQueryParams("/callback?x=1&x=2#", new URLSearchParams({ x: "3" })),
		).toBe("/callback?x=1&x=2&x=3#");
	});

	it("keeps a trailing question mark in an existing query value", () => {
		expect(
			appendQueryParams(
				"/callback?next=a?#details",
				new URLSearchParams({ x: "1" }),
			),
		).toBe("/callback?next=a?&x=1#details");
	});

	it("preserves an opaque URL when appending query parameters", () => {
		expect(
			appendQueryParams(
				"mailto:user@example.com#details",
				new URLSearchParams({ subject: "hello" }),
			),
		).toBe("mailto:user@example.com?subject=hello#details");
	});

	it("does not mutate parameters or accumulate changes across calls", () => {
		const input = "https://Auth.Example.com:443/callback?x=1#";
		const params = new URLSearchParams({ x: "2" });
		expect(appendQueryParams(input, params)).toBe(
			appendQueryParams(input, params),
		);
		expect(params.toString()).toBe("x=2");
		expect(input).toBe("https://Auth.Example.com:443/callback?x=1#");
	});

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

	/**
	 * @see https://www.rfc-editor.org/rfc/rfc3986.html#section-4.2
	 * @see https://url.spec.whatwg.org/#url-path-segment
	 */
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

	it("keeps a root-relative location on the same origin without reserializing its path", () => {
		const result = appendQueryParams(
			"/a/..//evil.example.com",
			new URLSearchParams({ error: "access_denied" }),
		);
		expect(result).toBe("/a/..//evil.example.com?error=access_denied");
		expect(new URL(result, "https://app.example.com").origin).toBe(
			"https://app.example.com",
		);
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
		expect(
			isReverseDomainPrivateUseRedirectUri(
				new URL("cursor://anysphere.cursor-mcp/oauth/callback"),
			),
		).toBe(false);
	});
});

describe("isNativePrivateUseRedirectUri", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10946
	 */
	it.each([
		"cursor://anysphere.cursor-mcp/oauth/callback",
		"com.example.app://host/callback",
		"com.example.app:/callback",
	])("accepts %s", (uri) => {
		expect(isNativePrivateUseRedirectUri(new URL(uri))).toBe(true);
	});

	it.each([
		"cursor://anysphere.cursor-mcp",
		"cursor://anysphere.cursor-mcp?x=1",
		"myapp:/callback",
	])("rejects %s, which has neither a host and path nor a reverse-domain scheme", (uri) => {
		expect(isNativePrivateUseRedirectUri(new URL(uri))).toBe(false);
	});

	it.each([
		"https://example.com/cb",
		"file://host/callback",
		"ws://host/callback",
		"wss://host/callback",
		"blob://host/callback",
		"about://host/callback",
		"view-source://host/callback",
	])("rejects reserved scheme %s", (uri) => {
		expect(isNativePrivateUseRedirectUri(new URL(uri))).toBe(false);
	});
});
