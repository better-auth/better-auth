import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "../../plugins/organization";

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
				},
			},
			emailVerification: {
				sendOnSignUp: true,
				sendVerificationEmail: async ({ user, url, token }, request) => {
					mockFn(user, url);
				},
			},
		},
		{
			disableTestUser: true,
		},
	);
	it("should work with custom fields on account table", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "email@test.com",
				password: "password",
				name: "Test Name",
			},
		});
		expect(res.token).toBeDefined();
		const accounts = await db.findMany({
			model: "account",
		});
		expect(accounts).toHaveLength(1);
	});

	it("should send verification email", async () => {
		expect(mockFn).toHaveBeenCalledWith(expect.any(Object), expect.any(String));
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
		expect(session?.session).toMatchObject({
			userAgent: "test-user-agent",
			ipAddress: "127.0.0.1",
		});
	});
});

describe("sign-up with organization", async (it) => {
	const { auth, db } = await getTestInstance(
		{
			plugins: [
				organization({
					autoCreateOrganizationOnSignUp: true,
				}),
			],
		},
		{
			disableTestUser: true,
		},
	);

	it("should create organization on sign up", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "org-test@test.com",
				password: "password",
				name: "Org User",
			},
		});

		expect(res.token).toBeDefined();

		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${res.token}`,
			}),
		});
		expect(session?.session.activeOrganizationId).toBeDefined();

		const orgs = await db.findMany({
			model: "organization",
		});
		expect(orgs.length).toBe(1);
		expect((orgs[0] as { name: string }).name).toBe("Org User");
		expect(session?.session.activeOrganizationId).toBe(
			(orgs[0] as { id: string }).id,
		);
	});
});
