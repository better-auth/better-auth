import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";
import { lastLoginMethod, lastLoginMethodClient } from "../../plugins";

/**
 * More test can be found in `session.test.ts`
 */
describe("sign-in", async (it) => {
	const { auth, testUser, cookieSetter, client } = await getTestInstance(
		{
			plugins: [lastLoginMethod()],
		},
		{
			clientOptions: {
				plugins: [lastLoginMethodClient()],
			},
		},
	);

	it("should return a response with a set-cookie header", async () => {
		const signInHeaders = new Headers();

		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});

		cookieSetter(signInHeaders)({
			response: signInRes,
		});

		const setCookie = signInRes.headers.get("set-cookie");
		const parsed = parseSetCookieHeader(setCookie || "");
		expect(parsed.get("better-auth.session_token")).toBeDefined();

		const lastLoginMethod = await client.lastUsedLoginMethod(
			{},
			{ headers: signInHeaders },
		);
		expect(lastLoginMethod.data).toBe("email-password");
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
});
