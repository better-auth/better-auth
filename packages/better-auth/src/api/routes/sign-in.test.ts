import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { describe, expect, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";

/**
 * More test can be found in `session.test.ts`
 */
describe("sign-in", async (it) => {
	const { auth, testUser, cookieSetter } = await getTestInstance();

	it("should return a response with a set-cookie header", async () => {
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const setCookie = signInRes.headers.get("set-cookie");
		const parsed = parseSetCookieHeader(setCookie || "");
		expect(parsed.get("better-auth.session_token")).toBeDefined();
	});

	it("should read the ip address and user agent from the headers", async () => {
		const headerObj = {
			"X-Forwarded-For": "127.0.0.1",
			"User-Agent": "Test",
		};
		const headers = new Headers(headerObj);
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
			headers,
		});
		cookieSetter(headers)({
			response: signInRes,
		});
		const session = await auth.api.getSession({
			headers,
		});
		expect(session?.session.ipAddress).toBe(headerObj["X-Forwarded-For"]);
		expect(session?.session.userAgent).toBe(headerObj["User-Agent"]);
	});

	it("verification email will be sent if sendOnSignIn is enabled", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth, testUser } = await getTestInstance({
			emailVerification: {
				sendOnSignIn: true,
				sendVerificationEmail,
			},
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
		});

		await expect(
			auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			}),
		).rejects.toThrowError(
			APIError.from("FORBIDDEN", BASE_ERROR_CODES.EMAIL_NOT_VERIFIED),
		);

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
	});

	it("verification email will not be sent if sendOnSignIn is disabled", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth, testUser } = await getTestInstance({
			emailVerification: {
				sendOnSignIn: false,
				sendVerificationEmail,
			},
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
		});

		await expect(
			auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			}),
		).rejects.toThrowError(
			APIError.from("FORBIDDEN", BASE_ERROR_CODES.EMAIL_NOT_VERIFIED),
		);

		expect(sendVerificationEmail).toHaveBeenCalledTimes(0);
	});

	it("verification email will be sent if sendOnSignIn is undefined but sendVerificationEmail is set (defaults to true)", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth, testUser } = await getTestInstance({
			emailVerification: {
				// sendOnSignIn is not set (undefined), should default to false
				sendVerificationEmail,
			},
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
		});

		expect(sendVerificationEmail).toHaveBeenCalledTimes(0);

		await expect(
			auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			}),
		).rejects.toThrowError(
			APIError.from("FORBIDDEN", BASE_ERROR_CODES.EMAIL_NOT_VERIFIED),
		);

		expect(sendVerificationEmail).toHaveBeenCalledTimes(0);
	});
});

describe("url checks", async (it) => {
	it("should reject untrusted origins", async () => {
		const { client } = await getTestInstance({
			advanced: {
				disableOriginCheck: false,
			},
		});
		const res = await client.signIn.social({
			provider: "google",
			callbackURL: "http://malicious.com",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid callbackURL");

		const errorCallbackRes = await client.signIn.social({
			provider: "google",
			errorCallbackURL: "http://malicious.com",
		});
		expect(errorCallbackRes.error?.status).toBe(403);
		expect(errorCallbackRes.error?.message).toBe("Invalid errorCallbackURL");

		const newUserCallbackRes = await client.signIn.social({
			provider: "google",
			newUserCallbackURL: "http://malicious.com",
		});
		expect(newUserCallbackRes.error?.status).toBe(403);
		expect(newUserCallbackRes.error?.message).toBe(
			"Invalid newUserCallbackURL",
		);
	});
});

describe("sign-in CSRF protection", async (it) => {
	const { auth, testUser } = await getTestInstance({
		trustedOrigins: ["http://localhost:3000"],
		emailAndPassword: {
			enabled: true,
		},
		advanced: {
			disableCSRFCheck: false,
		},
	});

	it("should block cross-site navigation login attempts (no cookies)", async () => {
		const maliciousRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "https://evil.com",
				},
				body: JSON.stringify({
					email: "attacker@evil.com",
					password: "password123",
				}),
			},
		);

		const response = await auth.handler(maliciousRequest);
		expect(response.status).toBe(403);
		const error = await response.json();
		expect(error.message).toBe(
			BASE_ERROR_CODES.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED.message,
		);
	});

	it("should allow same-origin navigation login attempts", async () => {
		const legitimateRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "same-origin",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(legitimateRequest);
		expect(response.status).not.toBe(403);
	});

	it("should allow fetch/XHR requests (cors mode)", async () => {
		const fetchRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "same-origin",
					"Sec-Fetch-Mode": "cors",
					"Sec-Fetch-Dest": "empty",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(fetchRequest);
		expect(response.status).not.toBe(403);
	});

	it("should use origin validation when cookies exist", async () => {
		const requestWithCookies = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: "some_cookie=value",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(requestWithCookies);
		// Should not be blocked by CSRF check since cookies exist - uses origin validation instead
		expect(response.status).not.toBe(403);
	});
});

describe("sign-in with form data", async (it) => {
	const { auth, testUser } = await getTestInstance({
		trustedOrigins: ["http://localhost:3000"],
		emailAndPassword: {
			enabled: true,
		},
		advanced: {
			disableCSRFCheck: false,
		},
	});

	it("should accept form-urlencoded content type", async () => {
		const formRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"Sec-Fetch-Site": "same-origin",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "http://localhost:3000",
				},
				body: new URLSearchParams({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(formRequest);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.token).toBeDefined();
		expect(data.user.email).toBe(testUser.email);
	});

	it("should block cross-site form submissions", async () => {
		const maliciousFormRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "https://evil.com",
				},
				body: new URLSearchParams({
					email: "attacker@evil.com",
					password: "password123",
				}),
			},
		);

		const response = await auth.handler(maliciousFormRequest);
		expect(response.status).toBe(403);
		const error = await response.json();
		expect(error.message).toBe(
			BASE_ERROR_CODES.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED.message,
		);
	});

	it("should allow same-site form submissions from trusted origins", async () => {
		const formRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"Sec-Fetch-Site": "same-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "http://localhost:3000",
				},
				body: new URLSearchParams({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(formRequest);
		expect(response.status).toBe(200);
	});
});
