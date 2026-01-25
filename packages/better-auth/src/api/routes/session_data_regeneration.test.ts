import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";

describe("session_data regeneration after expiry", async () => {
	it("should regenerate session_data cookie when it expires but session_token is still valid", async () => {
		const { client, testUser } = await getTestInstance({
			session: {
				expiresIn: 60 * 60 * 24 * 7, // 7 days
				updateAge: 60 * 60 * 24, // 1 day
				cookieCache: {
					enabled: true,
					maxAge: 5, // 5 seconds for testing (simulating a short expiry)
				},
			},
		});

		const headers = new Headers();

		// Sign in - this should set both session_token and session_data
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					console.log("Sign-in cookies:", setCookie);
					const parsed = parseSetCookieHeader(setCookie!);
					expect(parsed.get("better-auth.session_data")).toBeDefined();
					expect(parsed.get("better-auth.session_token")).toBeDefined();

					// Store only session_token (simulating session_data expiry)
					const sessionToken = parsed.get("better-auth.session_token");
					headers.set(
						"cookie",
						`better-auth.session_token=${sessionToken?.value}`,
					);
				},
			},
		);

		// Now make a getSession call WITHOUT session_data cookie
		// This simulates the case where session_data has expired but session_token is still valid
		let sessionDataRegenerated = false;
		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					console.log("GetSession cookies:", setCookie);
					if (setCookie) {
						const parsed = parseSetCookieHeader(setCookie);
						if (parsed.get("better-auth.session_data")?.value) {
							sessionDataRegenerated = true;
						}
					}
				},
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
		expect(sessionDataRegenerated).toBe(true); // This is the key assertion
	});

	it("should regenerate session_data when dontRememberMe is true", async () => {
		const { client, testUser } = await getTestInstance({
			session: {
				expiresIn: 60 * 60 * 24 * 7, // 7 days
				updateAge: 60 * 60 * 24, // 1 day
				cookieCache: {
					enabled: true,
					maxAge: 60 * 5, // 5 minutes
				},
			},
		});

		const headers = new Headers();

		// Sign in with rememberMe: false
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
				rememberMe: false,
			},
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					const parsed = parseSetCookieHeader(setCookie!);

					// With rememberMe: false, max-age should be undefined (session cookie)
					expect(
						parsed.get("better-auth.session_token")?.["max-age"],
					).toBeUndefined();
					expect(
						parsed.get("better-auth.session_data")?.["max-age"],
					).toBeUndefined();

					// Store only session_token and dont_remember cookie (simulating session_data expiry)
					const sessionToken = parsed.get("better-auth.session_token");
					const dontRemember = parsed.get("better-auth.dont_remember");
					headers.set(
						"cookie",
						`better-auth.session_token=${sessionToken?.value}; better-auth.dont_remember=${dontRemember?.value}`,
					);
				},
			},
		);

		// Now make a getSession call WITHOUT session_data cookie
		let sessionDataRegenerated = false;
		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					console.log("GetSession (dontRememberMe) cookies:", setCookie);
					if (setCookie) {
						const parsed = parseSetCookieHeader(setCookie);
						if (parsed.get("better-auth.session_data")?.value) {
							sessionDataRegenerated = true;
						}
					}
				},
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
		// BUG: session_data is NOT regenerated when dontRememberMe is true!
		// This assertion will fail if there's a bug
		expect(sessionDataRegenerated).toBe(true);
	});
});
