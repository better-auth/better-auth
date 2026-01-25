import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { afterEach, describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("sign-up with custom fields", async (it) => {
	const mockFn = vi.fn();
	const { auth, db } = await getTestInstance(
		{
			account: {
				fields: {
					providerId: "provider_id",
					accountId: "account_id",
				},
			},
			user: {
				additionalFields: {
					newField: {
						type: "string",
						required: false,
					},
					newField2: {
						type: "string",
						required: false,
					},
					isAdmin: {
						type: "boolean",
						defaultValue: true,
						input: false,
					},
					role: {
						input: false,
						type: "string",
						required: false,
					},
				},
			},
			emailVerification: {
				sendOnSignUp: true,
				sendVerificationEmail: mockFn,
			},
		},
		{
			disableTestUser: true,
		},
	);

	afterEach(() => {
		mockFn.mockReset();
	});

	it("should work with custom fields on account table", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "email@test.com",
				password: "password",
				name: "Test Name",
				image: "https://picsum.photos/200",
			},
		});
		expect(res.token).toBeDefined();
		const users = await db.findMany({
			model: "user",
		});
		const accounts = await db.findMany({
			model: "account",
		});
		expect(accounts).toHaveLength(1);

		expect("isAdmin" in (users[0] as any)).toBe(true);
		expect((users[0] as any).isAdmin).toBe(true);

		expect(mockFn).toHaveBeenCalledTimes(1);
		expect(mockFn).toHaveBeenCalledWith(
			expect.objectContaining({
				token: expect.any(String),
				url: expect.any(String),
				user: expect.any(Object),
			}),
			undefined,
		);
	});

	it("should succeed when passing empty name", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "noname@test.com",
				password: "password",
				name: "",
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${res.token}`,
			}),
		});
		expect(session).toBeDefined();
		expect(session!.user.name).toBe("");
	});

	it("should get the ipAddress and userAgent from headers", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "email2@test.com",
				password: "password",
				name: "Test Name",
			},
			headers: new Headers({
				"x-forwarded-for": "127.0.0.1",
				"user-agent": "test-user-agent",
			}),
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${res.token}`,
			}),
		});
		expect(session).toBeDefined();
		expect(session!.session).toMatchObject({
			userAgent: "test-user-agent",
			ipAddress: "127.0.0.1",
		});
	});

	it("should rollback when session creation fails", async ({ skip }) => {
		const ctx = await auth.$context;
		if (!ctx.adapter.options?.adapterConfig.transaction) {
			skip();
		}
		const originalCreateSession = ctx.internalAdapter.createSession;
		ctx.internalAdapter.createSession = vi
			.fn()
			.mockRejectedValue(new Error("Session creation failed"));

		await expect(
			auth.api.signUpEmail({
				body: {
					email: "rollback@test.com",
					password: "password",
					name: "Rollback Test",
				},
			}),
		).rejects.toThrow();

		const users = await db.findMany({ model: "user" });
		const rollbackUser = users.find(
			(u: any) => u.email === "rollback@test.com",
		);
		expect(rollbackUser).toBeUndefined();

		ctx.internalAdapter.createSession = originalCreateSession;
	});

	it("should not allow user to set the field that is set to input: false", async () => {
		await expect(
			auth.api.signUpEmail({
				body: {
					email: "input-false@test.com",
					password: "password",
					name: "Input False Test",
					//@ts-expect-error
					role: "admin",
				},
			}),
		).rejects.toThrow("role is not allowed to be set");
	});

	it("should return additionalFields in signUpEmail response", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "additional-fields@test.com",
				password: "password",
				name: "Additional Fields Test",
				newField: "custom-value",
			},
		});

		// additionalFields should be returned in API response
		expect(res.user).toBeDefined();
		expect(res.user.newField).toBe("custom-value");
		// defaultValue should also be applied and returned
		expect(res.user.isAdmin).toBe(true);
	});

	it("should throw status code 400 when passing invalid body", async () => {
		await expect(
			auth.api.signUpEmail({
				body: {
					name: "Test",
					email: "body-validation@test.com",
					// @ts-expect-error
					password: undefined,
				},
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				statusCode: 400,
			}),
		);
	});
});

describe("sign-up CSRF protection", async (it) => {
	const { auth } = await getTestInstance(
		{
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: false,
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should block cross-site navigation sign-up attempts (no cookies)", async () => {
		const maliciousRequest = new Request(
			"http://localhost:3000/api/auth/sign-up/email",
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
					email: "victim@example.com",
					password: "password123",
					name: "Victim",
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

	it("should allow same-origin navigation sign-up attempts", async () => {
		const legitimateRequest = new Request(
			"http://localhost:3000/api/auth/sign-up/email",
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
					email: "newuser@example.com",
					password: "password123",
					name: "New User",
				}),
			},
		);

		const response = await auth.handler(legitimateRequest);
		expect(response.status).not.toBe(403);
	});

	it("should allow fetch/XHR sign-up requests (cors mode)", async () => {
		const fetchRequest = new Request(
			"http://localhost:3000/api/auth/sign-up/email",
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
					email: "fetchuser@example.com",
					password: "password123",
					name: "Fetch User",
				}),
			},
		);

		const response = await auth.handler(fetchRequest);
		expect(response.status).not.toBe(403);
	});

	it("should use origin validation when cookies exist", async () => {
		const requestWithCookies = new Request(
			"http://localhost:3000/api/auth/sign-up/email",
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
					email: "cookieuser@example.com",
					password: "password123",
					name: "Cookie User",
				}),
			},
		);

		const response = await auth.handler(requestWithCookies);
		// Should not be blocked by CSRF check since cookies exist - uses origin validation instead
		expect(response.status).not.toBe(403);
	});
});

describe("sign-up with form data", async (it) => {
	const { auth } = await getTestInstance(
		{
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: false,
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should accept form-urlencoded content type", async () => {
		const formRequest = new Request(
			"http://localhost:3000/api/auth/sign-up/email",
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
					email: "formuser@example.com",
					password: "password123",
					name: "Form User",
				}),
			},
		);

		const response = await auth.handler(formRequest);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.token).toBeDefined();
		expect(data.user.email).toBe("formuser@example.com");
	});

	it("should block cross-site form submissions", async () => {
		const maliciousFormRequest = new Request(
			"http://localhost:3000/api/auth/sign-up/email",
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
					email: "victim@example.com",
					password: "password123",
					name: "Victim",
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
			"http://localhost:3000/api/auth/sign-up/email",
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
					email: "samesiteuser@example.com",
					password: "password123",
					name: "Same Site User",
				}),
			},
		);

		const response = await auth.handler(formRequest);
		expect(response.status).toBe(200);
	});
});

describe("sign-up sendOnSignUp option behavior", async (it) => {
	it("should not send verification email when sendOnSignUp is false, even with requireEmailVerification", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth } = await getTestInstance(
			{
				emailVerification: {
					sendOnSignUp: false,
					sendVerificationEmail,
				},
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: true,
				},
			},
			{
				disableTestUser: true,
			},
		);

		await auth.api.signUpEmail({
			body: {
				email: "no-verification@test.com",
				password: "password123",
				name: "No Verification",
			},
		});

		expect(sendVerificationEmail).not.toHaveBeenCalled();
	});

	it("should send verification email when sendOnSignUp is true", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth } = await getTestInstance(
			{
				emailVerification: {
					sendOnSignUp: true,
					sendVerificationEmail,
				},
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: true,
				},
			},
			{
				disableTestUser: true,
			},
		);

		await auth.api.signUpEmail({
			body: {
				email: "with-verification@test.com",
				password: "password123",
				name: "With Verification",
			},
		});

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
	});

	it("should send verification email when sendOnSignUp is not set but requireEmailVerification is true (default)", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth } = await getTestInstance(
			{
				emailVerification: {
					sendVerificationEmail,
				},
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: true,
				},
			},
			{
				disableTestUser: true,
			},
		);

		await auth.api.signUpEmail({
			body: {
				email: "default-verification@test.com",
				password: "password123",
				name: "Default Verification",
			},
		});

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
	});
});
