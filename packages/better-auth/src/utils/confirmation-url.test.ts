import { describe, expect, it } from "vitest";
import { assertExplicitCallbackURL } from "./confirmation-url";

const baseURL = "https://auth.example.com/api/auth";
const blocked = ["/delete-user/callback"];

const codeOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (error) {
		return (error as { body?: { code?: string } }).body?.code;
	}
	return undefined;
};

describe("assertExplicitCallbackURL", () => {
	it("returns an absolute URL unchanged", () => {
		expect(
			assertExplicitCallbackURL(
				baseURL,
				"https://app.example.com/account/delete?step=2",
				blocked,
			),
		).toBe("https://app.example.com/account/delete?step=2");
	});

	it("accepts a mobile deep link", () => {
		expect(assertExplicitCallbackURL(baseURL, "myapp://confirm", blocked)).toBe(
			"myapp://confirm",
		);
	});

	it("requires a callbackURL", () => {
		expect(
			codeOf(() => assertExplicitCallbackURL(baseURL, undefined, blocked)),
		).toBe("CALLBACK_URL_REQUIRED");
		expect(codeOf(() => assertExplicitCallbackURL(baseURL, "", blocked))).toBe(
			"CALLBACK_URL_REQUIRED",
		);
	});

	it.each([
		["a relative path", "/account/delete"],
		["a protocol-relative URL", "//app.example.com/account"],
		["not a URL at all", "not a url"],
		["a javascript: URL", "javascript:alert(1)"],
		["a data: URL", "data:text/html,<script>alert(1)</script>"],
	])("rejects %s", (_label, callbackURL) => {
		expect(
			codeOf(() => assertExplicitCallbackURL(baseURL, callbackURL, blocked)),
		).toBe("INVALID_CALLBACK_URL");
	});

	it.each([
		"https://auth.example.com/api/auth/delete-user/callback",
		"https://auth.example.com/api/auth/delete-user/callback/",
		"https://auth.example.com/api/auth/delete-user/callback?token=x",
		"https://auth.example.com/api/auth/delete-user/callback#frag",
		"https://auth.example.com/api/auth/Delete-User/Callback",
		"https://auth.example.com/api/auth/x/../delete-user/callback",
		"https://auth.example.com:443/api/auth/delete-user/callback",
	])("rejects a link back to the instant callback: %s", (callbackURL) => {
		expect(
			codeOf(() => assertExplicitCallbackURL(baseURL, callbackURL, blocked)),
		).toBe("INVALID_CALLBACK_URL");
	});

	it.each([
		"https://auth.example.com/api/auth/delete%2Duser/callback",
		"https://auth.example.com/api/auth/delete%2duser/callback",
		"https://auth.example.com/api/auth/%64elete-user/callback",
		"https://auth.example.com/api/%61uth/delete-user/callback",
		"https://auth.example.com/api/auth/delete%252Duser/callback",
		"https://auth.example.com/api/auth/x/%2e%2e/delete-user/callback",
		"https://auth.example.com/api/auth/x%2f..%2fdelete-user/callback",
		"https://auth.example.com/api/auth/delete-user%2Fcallback",
	])("rejects a percent-encoded link back to the instant callback: %s", (callbackURL) => {
		expect(
			codeOf(() => assertExplicitCallbackURL(baseURL, callbackURL, blocked)),
		).toBe("INVALID_CALLBACK_URL");
	});

	it("rejects a malformed percent-encoding instead of comparing it raw", () => {
		expect(
			codeOf(() =>
				assertExplicitCallbackURL(
					baseURL,
					"https://auth.example.com/api/auth/%E0%A4%A",
					blocked,
				),
			),
		).toBe("INVALID_CALLBACK_URL");
	});

	it.each([
		"https://app.example.com/confirm?token=stale",
		"https://app.example.com/confirm?a=1&token=",
		"https://app.example.com/confirm?TOKEN=x&b=2",
		"myapp://confirm?token=x",
	])("rejects a callbackURL that already carries a token: %s", (callbackURL) => {
		expect(
			codeOf(() => assertExplicitCallbackURL(baseURL, callbackURL, blocked)),
		).toBe("INVALID_CALLBACK_URL");
	});

	it.each([
		"https://auth.example.com/account/50%25/confirm",
		"https://auth.example.com/account/100%25",
		"https://auth.example.com/api/auth/100%25-done/confirm",
		"https://auth.example.com/caf%C3%A9/confirm",
	])("allows a legitimate path that contains an encoded percent sign or non-ASCII text: %s", (callbackURL) => {
		expect(assertExplicitCallbackURL(baseURL, callbackURL, blocked)).toBe(
			callbackURL,
		);
	});

	it("still rejects a blocked path that mixes single and double encoding", () => {
		expect(
			codeOf(() =>
				assertExplicitCallbackURL(
					baseURL,
					"https://auth.example.com/api/auth/%64elete%252Duser/callback",
					blocked,
				),
			),
		).toBe("INVALID_CALLBACK_URL");
	});

	it("allows unrelated query parameters and harmless encoding", () => {
		const url =
			"https://app.example.com/a%20b/confirm?next=%2Fhome&tokenizer=1";
		expect(assertExplicitCallbackURL(baseURL, url, blocked)).toBe(url);
	});

	it("honors a base URL without a path", () => {
		expect(
			codeOf(() =>
				assertExplicitCallbackURL(
					"https://auth.example.com",
					"https://auth.example.com/delete-user/callback",
					blocked,
				),
			),
		).toBe("INVALID_CALLBACK_URL");
	});

	it("allows the same path on a different origin, and other paths on the auth origin", () => {
		expect(
			assertExplicitCallbackURL(
				baseURL,
				"https://app.example.com/api/auth/delete-user/callback",
				blocked,
			),
		).toBe("https://app.example.com/api/auth/delete-user/callback");
		expect(
			assertExplicitCallbackURL(
				baseURL,
				"https://auth.example.com/api/auth/delete-user/preview",
				blocked,
			),
		).toBe("https://auth.example.com/api/auth/delete-user/preview");
	});
});
