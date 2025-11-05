import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
import { describe, expect, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import {
	organization,
	setLastUsedOrganizationAsActive,
} from "../../plugins/organization";
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

	it("should automatically set lastUsed organization as active on sign-in", async () => {
		const orgPlugin = organization();
		const { auth, db, cookieSetter } = await getTestInstance({
			plugins: [orgPlugin],
			databaseHooks: {
				session: {
					create: {
						after: async (session, ctx) => {
							await setLastUsedOrganizationAsActive(
								session,
								ctx,
								orgPlugin.options,
							);
						},
					},
				},
			},
		});

		// Create a user and sign up
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "lastused-test@example.com",
				password: "password123",
				name: "LastUsed Test User",
			},
			asResponse: true,
		});

		const signUpData = await signUpRes.json();
		const userId = signUpData.user.id;

		// Create two organizations
		const org1 = await auth.api.createOrganization({
			body: {
				name: "LastUsed Org 1",
				slug: "lastused-org-1",
				userId,
			},
		});
		if (org1 === null) throw new Error("org1 is null");

		const org2 = await auth.api.createOrganization({
			body: {
				name: "LastUsed Org 2",
				slug: "lastused-org-2",
				userId,
			},
		});
		if (org2 === null) throw new Error("org2 is null");

		// Set org1 as active (this will set lastUsed = true for org1)
		const signUpCookie = signUpRes.headers.get("set-cookie") || "";
		await auth.api.setActiveOrganization({
			body: { organizationId: org1.id },
			headers: new Headers({ cookie: signUpCookie }),
		});

		// Verify org1 has lastUsed = true
		const org1AfterSet = (await db.findOne({
			model: "organization",
			where: [{ field: "id", value: org1.id }],
		})) as { id: string; lastUsed: boolean };

		expect(org1AfterSet?.lastUsed).toBe(true);

		// Sign out (to clear session)
		await auth.api.signOut({
			headers: new Headers({
				cookie: signUpRes.headers.get("set-cookie") || "",
			}),
		});

		// Sign in again
		const signInRes = await auth.api.signInEmail({
			body: {
				email: "lastused-test@example.com",
				password: "password123",
			},
			asResponse: true,
		});

		const headers = new Headers();
		cookieSetter(headers)({
			response: signInRes,
		});

		// Get the session after sign-in
		const session = await auth.api.getSession({
			headers,
		});

		// The lastUsed organization (org1) should be automatically set as active
		expect(session?.session.activeOrganizationId).toBe(org1.id);
	});

	it("should not set any organization if no lastUsed organization exists", async () => {
		const orgPlugin = organization();
		const { auth, cookieSetter } = await getTestInstance({
			plugins: [orgPlugin],
			databaseHooks: {
				session: {
					create: {
						after: async (session, ctx) => {
							await setLastUsedOrganizationAsActive(
								session,
								ctx,
								orgPlugin.options,
							);
						},
					},
				},
			},
		});

		// Create a user and sign up
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "no-lastused@example.com",
				password: "password123",
				name: "No LastUsed User",
			},
			asResponse: true,
		});

		const headers = new Headers();
		cookieSetter(headers)({
			response: signUpRes,
		});
		const signUpData = await signUpRes.json(); // 👈 parse the response body
		const userId = signUpData.user.id;

		// Create an organization but don't set it as active (so lastUsed stays false)
		await auth.api.createOrganization({
			body: {
				name: "Never Used Org",
				slug: "never-used-org",
				userId,
			},
			headers,
		});

		// Sign out
		await auth.api.signOut({
			headers,
		});

		// Sign in again
		const signInRes = await auth.api.signInEmail({
			body: {
				email: "no-lastused@example.com",
				password: "password123",
			},
			asResponse: true,
		});

		cookieSetter(headers)({
			response: signInRes,
		});

		// Get the session after sign-in
		const session = await auth.api.getSession({
			headers,
		});

		// No organization should be set as active (no lastUsed org exists)
		expect(session?.session.activeOrganizationId).toBeNull();
	});
});
