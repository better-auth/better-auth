import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";
import { organization } from "../../plugins/organization";

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
});

describe("sign-in with organization", async (it) => {
	it("should set active organization on sign in", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				organization({
					autoCreateOrganizationOnSignUp: true,
				}),
			],
		});
		const newUserEmail = `test-user-${Date.now()}@example.com`;
		const newUserPassword = "password123";
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: newUserEmail,
				password: newUserPassword,
				name: "Test User Org",
			},
		});

		expect(signUpRes).toBeDefined();
		if (!signUpRes) return;

		const newUserId = signUpRes.user.id;

		const org = await auth.api.createOrganization({
			body: {
				name: "test-org-1",
				slug: `test-org-1-${Date.now()}`,
				userId: newUserId,
			},
		});

		expect(org).toBeDefined();
		if (!org) return;

		const signInRes = await auth.api.signInEmail({
			body: {
				email: newUserEmail,
				password: newUserPassword,
				activeOrganizationId: org.id,
			} as any,
			asResponse: true,
		});

		const setCookie = signInRes.headers.get("set-cookie");
		const parsed = parseSetCookieHeader(setCookie || "");
		const sessionToken = parsed.get("better-auth.session_token");
		expect(sessionToken).toBeDefined();
		if (!sessionToken) return;
		const session = await auth.api.getSession({
			headers: new Headers({
				cookie: `better-auth.session_token=${sessionToken.value}`,
			}),
		});
		expect((session?.session as any).activeOrganizationId).toBe(org.id);
	});
});
