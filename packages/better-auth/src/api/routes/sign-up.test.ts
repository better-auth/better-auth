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
