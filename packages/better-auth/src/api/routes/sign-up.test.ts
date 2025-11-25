import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { afterEach, describe, expect, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
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
		);
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
});

describe("sign-up form-based authentication", async (it) => {
	const { auth, customFetchImpl } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
		},
	});

	it("should work with standard HTML form POST (simulating <form method='POST' action='/sign-up/email'>)", async () => {
		const email = `test-form-${Date.now()}@example.com`;
		// Simulate a standard HTML form submission
		const formData = new URLSearchParams({
			email,
			password: "password123",
			name: "Form Test User",
		});

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/sign-up/email",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Origin: "http://localhost:3000",
					Referer: "http://localhost:3000/signup",
				},
				body: formData.toString(),
			},
		);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.user).toBeDefined();
		expect(data.user.email).toBe(email);
		expect(data.user.name).toBe("Form Test User");
		expect(data.token).toBeDefined();

		// Verify session cookie is set
		const setCookie = response.headers.get("set-cookie");
		expect(setCookie).toBeTruthy();
		expect(setCookie).toContain("better-auth.session_token");
	});

	it("should set session cookie with correct attributes (SameSite=Lax, HttpOnly)", async () => {
		const email = `test-cookie-${Date.now()}@example.com`;
		const formData = new URLSearchParams({
			email,
			password: "password123",
			name: "Cookie Test User",
		});

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/sign-up/email",
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
		const { parseSetCookieHeader } = await import("../../cookies");
		const cookies = parseSetCookieHeader(setCookie || "");
		const sessionCookie = cookies.get("better-auth.session_token");

		expect(sessionCookie).toBeDefined();
		expect(sessionCookie?.value).toBeTruthy();

		// Verify cookie attributes
		expect(sessionCookie?.samesite).toBe("lax");
		expect(sessionCookie?.httponly).toBe(true);
		expect(sessionCookie?.path).toBe("/");
	});

	it("should return same error codes for form sign-up as JSON sign-up", async () => {
		const email = `test-duplicate-form-${Date.now()}@example.com`;

		// First, create a user with JSON
		await customFetchImpl("http://localhost:3000/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:3000",
			},
			body: JSON.stringify({
				email,
				password: "password123",
				name: "First User",
			}),
		});

		// Try to sign up again with form (should fail)
		const formData = new URLSearchParams({
			email,
			password: "password123",
			name: "Second User",
		});

		const formResponse = await customFetchImpl(
			"http://localhost:3000/api/auth/sign-up/email",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Origin: "http://localhost:3000",
				},
				body: formData.toString(),
			},
		);

		expect(formResponse.status).toBe(422);
		const formError = await formResponse.json();

		// Try to sign up again with JSON (should match)
		const jsonResponse = await customFetchImpl(
			"http://localhost:3000/api/auth/sign-up/email",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email,
					password: "password123",
					name: "Third User",
				}),
			},
		);

		expect(jsonResponse.status).toBe(422);
		const jsonError = await jsonResponse.json();

		// Errors should match
		expect(formError.message).toBe(jsonError.message);
		expect(formError.message).toBe(
			BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
		);
	});
});
