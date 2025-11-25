import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
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

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

		await expect(
			auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			}),
		).rejects.toThrowError(
			new APIError("FORBIDDEN", {
				message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
			}),
		);

		expect(sendVerificationEmail).toHaveBeenCalledTimes(2);
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

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

		await expect(
			auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			}),
		).rejects.toThrowError(
			new APIError("FORBIDDEN", {
				message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
			}),
		);

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
	});

	describe("Form-based Authentication", async (it) => {
		const { auth, testUser, customFetchImpl } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
		});

		it("should work with standard HTML form POST (simulating <form method='POST' action='/sign-in/email'>)", async () => {
			// Simulate a standard HTML form submission
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "http://localhost:3000",
						Referer: "http://localhost:3000/login",
					},
					body: formData.toString(),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(testUser.email);
			expect(data.token).toBeDefined();

			// Verify session cookie is set
			const setCookie = response.headers.get("set-cookie");
			expect(setCookie).toBeTruthy();
			expect(setCookie).toContain("better-auth.session_token");
		});

		it("should set session cookie with correct attributes (SameSite=Lax, HttpOnly, Secure in prod)", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "http://localhost:3000",
					},
					body: formData.toString(),
				},
			);

			expect(response.status).toBe(200);
			const setCookie = response.headers.get("set-cookie");
			expect(setCookie).toBeTruthy();

			// Parse the cookie to verify attributes
			const cookies = parseSetCookieHeader(setCookie || "");
			const sessionCookie = cookies.get("better-auth.session_token");

			expect(sessionCookie).toBeDefined();
			expect(sessionCookie?.value).toBeTruthy();

			// Verify cookie attributes
			expect(sessionCookie?.samesite).toBe("lax");
			expect(sessionCookie?.httponly).toBe(true);
			expect(sessionCookie?.path).toBe("/");
			// Secure might be false in test (http://localhost) but true in production
		});

		it("should return same error codes for form sign-in as JSON sign-in", async () => {
			// Test invalid email with form
			const formData = new URLSearchParams({
				email: "invalid-email",
				password: "password123",
			});

			const formResponse = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "http://localhost:3000",
					},
					body: formData.toString(),
				},
			);

			expect(formResponse.status).toBe(400);
			const formError = await formResponse.json();

			// Test invalid email with JSON (should match)
			const jsonResponse = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email: "invalid-email",
						password: "password123",
					}),
				},
			);

			expect(jsonResponse.status).toBe(400);
			const jsonError = await jsonResponse.json();

			// Errors should match
			expect(formError.message).toBe(jsonError.message);
			expect(formError.message).toBe(BASE_ERROR_CODES.INVALID_EMAIL);
		});

		it("should not set session cookie on form sign-in error (same as JSON)", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: "wrong-password",
			});

			const formResponse = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "http://localhost:3000",
					},
					body: formData.toString(),
				},
			);

			expect(formResponse.status).toBe(401);
			// No session cookie should be set on error
			const setCookie = formResponse.headers.get("set-cookie");
			expect(setCookie).toBeNull();

			// JSON should behave the same
			const jsonResponse = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email: testUser.email,
						password: "wrong-password",
					}),
				},
			);

			expect(jsonResponse.status).toBe(401);
			const jsonSetCookie = jsonResponse.headers.get("set-cookie");
			expect(jsonSetCookie).toBeNull();
		});
	});
});

describe("url checks", async (it) => {
	it("should reject untrusted origins", async () => {
		const { client } = await getTestInstance();
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
