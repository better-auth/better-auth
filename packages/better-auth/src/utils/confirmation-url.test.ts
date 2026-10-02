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
