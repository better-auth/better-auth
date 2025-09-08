import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";
import { APIError } from "better-call";
import { BASE_ERROR_CODES } from "../../error/codes";

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
});
