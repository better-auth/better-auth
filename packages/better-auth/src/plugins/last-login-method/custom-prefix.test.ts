import type { BetterAuthOptions } from "@better-auth/core";
import { test as baseTest, describe, expect } from "vitest";
import type { CookieAttributes } from "../../cookies";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import type { LastLoginMethodOptions } from ".";
import { lastLoginMethod } from ".";

const DEFAULT_COOKIE_NAME = "better-auth.last_used_login_method";

const test = baseTest
	.extend("options", {} as Pick<BetterAuthOptions, "baseURL" | "advanced">)
	.extend("pluginOptions", {} as LastLoginMethodOptions)
	.extend("cookies", async ({ options, pluginOptions }) => {
		const { auth, testUser } = await getTestInstance({
			...options,
			plugins: [lastLoginMethod(pluginOptions)],
		});
		const { headers } = await auth.api.signInEmail({
			returnHeaders: true,
			body: {
				email: testUser.email,
				password: testUser.password,
			},
		});
		const { authCookies } = await auth.$context;
		const cookies = parseSetCookieHeader(headers.get("set-cookie") ?? "");
		return {
			get: (name: string) => cookies.get(name),
			session: cookies.get(authCookies.sessionToken.name),
		};
	});

function scopeAttributes(cookie: CookieAttributes | undefined) {
	return {
		domain: cookie?.domain,
		path: cookie?.path,
		secure: cookie?.secure,
		samesite: cookie?.samesite,
	};
}

describe("lastLoginMethod cookie name", () => {
	describe("with a custom cookiePrefix", () => {
		test.override("options", {
			advanced: {
				cookiePrefix: "custom-auth",
			},
		});

		test("keeps the default name", ({ cookies }) => {
			expect(cookies.get(DEFAULT_COOKIE_NAME)?.value).toBe("email");
		});
	});

	describe("with a cookieName that includes the prefix", () => {
		test
			.override("options", {
				advanced: {
					cookiePrefix: "my-app",
				},
			})
			.override("pluginOptions", {
				cookieName: "my-app.last_method",
			});

		test("uses the name verbatim", ({ cookies }) => {
			expect(cookies.get("my-app.last_method")?.value).toBe("email");
		});
	});

	describe("with a cookieName without the prefix", () => {
		test
			.override("options", {
				advanced: {
					cookiePrefix: "my-app",
				},
			})
			.override("pluginOptions", { cookieName: "last_login_method" });

		test("does not apply cookiePrefix", ({ cookies }) => {
			expect(cookies.get("last_login_method")?.value).toBe("email");
		});
	});
});

describe("lastLoginMethod cookie attributes", () => {
	describe("with cross-subdomain cookies", () => {
		test.override("options", {
			baseURL: "https://auth.example.com",
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
					domain: "example.com",
				},
			},
		});

		test("mirrors the session cookie scope", ({ cookies }) => {
			const cookie = cookies.get(DEFAULT_COOKIE_NAME);

			expect(scopeAttributes(cookie)).toMatchObject({
				domain: "example.com",
				samesite: "lax",
				secure: true,
			});
			expect(scopeAttributes(cookie)).toEqual(scopeAttributes(cookies.session));
		});

		test("is readable by client scripts", ({ cookies }) => {
			expect(cookies.get(DEFAULT_COOKIE_NAME)?.httponly).toBeUndefined();
		});
	});

	describe("with SameSite=None", () => {
		test.override("options", {
			baseURL: "https://api.example.com",
			advanced: {
				defaultCookieAttributes: {
					sameSite: "none",
					secure: true,
				},
			},
		});

		test("mirrors the session cookie scope", ({ cookies }) => {
			const cookie = cookies.get(DEFAULT_COOKIE_NAME);

			expect(scopeAttributes(cookie)).toMatchObject({
				domain: undefined,
				samesite: "none",
				secure: true,
			});
			expect(scopeAttributes(cookie)).toEqual(scopeAttributes(cookies.session));
		});
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-4.1.3
	 */
	describe("with SameSite=None and secure disabled", () => {
		test.override("options", {
			baseURL: "http://localhost:3000",
			advanced: {
				defaultCookieAttributes: {
					sameSite: "none",
					secure: false,
				},
			},
		});

		test("still sets Secure like the session cookie", ({ cookies }) => {
			const cookie = cookies.get(DEFAULT_COOKIE_NAME);

			expect(scopeAttributes(cookie)).toMatchObject({
				samesite: "none",
				secure: true,
			});
			expect(scopeAttributes(cookie)).toEqual(scopeAttributes(cookies.session));
		});
	});
});
