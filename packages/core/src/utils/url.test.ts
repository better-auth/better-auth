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
	it.for([
		[
			"https://Auth.Example.com:443/api/auth",
			"https://Auth.Example.com:443/api/auth/token",
		],
		["https://example.com", "https://example.com/token"],
		["https://example.com/auth/", "https://example.com/auth/token"],
		["https://example.com/auth///", "https://example.com/auth///token"],
		["/api//auth/", "/api//auth/token"],
		["", "/token"],
		["foo://host", "foo://host/token"],
	] as const)("appends a path to %s", ([base, expected]) => {
		expect(appendURLPath(base, "/token")).toBe(expected);
	});

	it("preserves URL spelling and existing components", () => {
		expect(
			appendURLPath(
				"https://bücher.example/a^b/%2f?next=a%20b#",
				"/사용자/a b/%zz",
			),
		).toBe("https://bücher.example/a^b/%2f/사용자/a b/%zz?next=a%20b#");
	});

	/** @see https://url.spec.whatwg.org/#url-path-segment */
	it.for([
		"/a/..//evil.example",
		"/%2e//evil.example",
	])("preserves dot segments without creating an authority: %s", (base) => {
		const result = appendURLPath(base, "/callback");
		expect(result).toBe(`${base}/callback`);
		expect(new URL(result, "https://app.example").origin).toBe(
			"https://app.example",
		);
	});

	it("preserves dot segments in the appended path", () => {
		expect(appendURLPath("/auth", "/a/../%2e%2e/b")).toBe(
			"/auth/a/../%2e%2e/b",
		);
	});

	it.for([
		"//evil.example",
		"/\\evil.example",
		"mailto:user@example.com",
		"not-a-url",
		" https://example.com",
		"https://example.com/a\nb",
	])("rejects an invalid base: %j", (base) => {
		expect(() => appendURLPath(base, "/token")).toThrow(TypeError);
	});

	it.for([
		"",
		"token",
		"//evil.example",
		"/token?x=1",
		"/token#x",
		"/a\\b",
		"/a\tb",
		"/a\u0000b",
		"/a\u007fb",
		"/a ",
	])("rejects an invalid pathname: %j", (path) => {
		expect(() => appendURLPath("/auth", path)).toThrow(TypeError);
	});
});

describe("appendURLSegments", () => {
	it("encodes raw values without changing path boundaries or existing components", () => {
		expect(
			appendURLSegments(
				"/auth/?x=a%20b#step",
				"callback",
				"team/member?x#y%2F",
			),
		).toBe("/auth/callback/team%2Fmember%3Fx%23y%252F?x=a%20b#step");
	});

	/** @see https://www.rfc-editor.org/rfc/rfc3986.html#section-3.3 */
	it("preserves path-segment punctuation", () => {
		expect(appendURLSegments("/callback", "!$&'()*+,;=:@~")).toBe(
			"/callback/!$&'()*+,;=:@~",
		);
	});

	it("encodes Unicode, spaces, and backslashes", () => {
		expect(appendURLSegments("/auth", "한글 a\\b")).toBe(
			"/auth/%ED%95%9C%EA%B8%80%20a%5Cb",
		);
	});

	it.for(["", ".", ".."])("rejects unrepresentable segments: %j", (segment) => {
		expect(() => appendURLSegments("/auth", segment)).toThrow(TypeError);
	});

	/** @see https://tc39.es/ecma262/multipage/global-object.html#sec-encode */
	it("rejects malformed Unicode", () => {
		expect(() => appendURLSegments("/auth", "\ud800")).toThrow(URIError);
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

	it("preserves the callback spelling when adding query parameters", () => {
		expect(
			appendQueryParams(
				"https://Auth.Example.com:443/a^b?x=1#",
				new URLSearchParams({ x: "2" }),
			),
		).toBe("https://Auth.Example.com:443/a^b?x=1&x=2#");
	});

	/** @see https://url.spec.whatwg.org/#url-path-segment */
	it("keeps a normalized double-slash path on the original origin", () => {
		const result = appendQueryParams(
			"/a/..//evil.example",
			new URLSearchParams({ error: "denied" }),
		);
		expect(new URL(result, "https://app.example").origin).toBe(
			"https://app.example",
		);
		expect(result).toBe("/a/..//evil.example?error=denied");
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
	])(
		"rejects %s, which has neither a host and path nor a reverse-domain scheme",
		(uri) => {
			expect(isNativePrivateUseRedirectUri(new URL(uri))).toBe(false);
		},
	);

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
