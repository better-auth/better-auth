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
	const { auth } = await getTestInstance({
		plugins: [organization({})],
	});

	it("should set active organization on sign in", async () => {
		const newUserEmail = `test-user-${Date.now()}@example.com`;
		const newUserPassword = "password123";
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: newUserEmail,
				password: newUserPassword,
				name: "Test User Org",
			},
		});
		console.log(signUpRes);
		expect(signUpRes).toBeDefined();
		if (!signUpRes) return;

		const newUserId = signUpRes.user.id;

		// 2. Create an organization for this user
		const org = await auth.api.createOrganization({
			body: {
				name: "test-org",
				slug: `test-org-${Date.now()}`, // needs to be unique
				userId: newUserId,
			},
		});
		console.log(org);

		expect(org).toBeDefined();
		if (!org) return;

		// 3. Sign in as the new user
		const signInRes = await auth.api.signInEmail({
			body: {
				email: newUserEmail,
				password: newUserPassword,
			},
			asResponse: true,
		});

		// 4. Assertions
		const setCookie = signInRes.headers.get("set-cookie");
		const parsed = parseSetCookieHeader(setCookie || "");
		const sessionToken = parsed.get("better-auth.session_token");
		expect(sessionToken).toBeDefined();

		const session = await auth.api.getSession({
			headers: new Headers({
				cookie: `better-auth.session_token=${sessionToken?.value}`,
			}),
		});
		console.log(session);
		expect(session?.session.activeOrganizationId).toBe(org.id);
	});
});
