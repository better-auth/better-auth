import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect } from "vitest";
import { organizationClient } from "../../client";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { getOrganizationData } from "../../test/utils";

/**
 * Helper to define `getTestInstance` as a shorter alias, specific to the organization plugin.
 * @internal
 */
async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);

	const adapter = (await instance.auth.$context).adapter;

	return { ...instance, adapter };
}

describe("create invitation URL", async (it) => {
	const plugin = organization({
		membershipLimit: 6,
		async sendInvitationEmail(data, request) {},
		invitationLimit: 5,
	});
	const { auth, signInWithTestUser, signInWithUser, adapter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	// Create an organization for testing
	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should create invitation and return URL", async () => {
		const email = `invite-url-test-${crypto.randomUUID()}@test.com`;
		const result = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email,
				role: "member",
				callbackURL: "https://myapp.com/dashboard",
			},
		});

		expect(result.url).toBeDefined();
		// URL should point to the backend callback endpoint
		expect(result.url).toContain("/organization/accept-invitation-callback");
		expect(result.url).toContain("invitationId=");
		// Callback URL should be encoded in the URL
		expect(result.url).toContain("callbackURL=");
		expect(result.invitation).toBeDefined();
		expect(result.invitation.email).toBe(email);
		expect(result.invitation.role).toBe("member");
		expect(result.invitation.status).toBe("pending");
	});

	it("should create invitation URL with multiple roles", async () => {
		const result = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email: `multi-role-url-${crypto.randomUUID()}@test.com`,
				role: ["admin", "member"],
				callbackURL: "https://myapp.com/dashboard",
			},
		});

		expect(result.url).toBeDefined();
		expect(result.url).toContain("/organization/accept-invitation-callback");
		expect(result.invitation.role).toBe("admin,member");
	});

	it("should validate email format", async () => {
		await expect(
			auth.api.createInvitationURL({
				headers,
				body: {
					organizationId: testOrg.id,
					email: "invalid-email",
					role: "member",
				},
			}),
		).rejects.toThrow();
	});

	it("should not allow inviting a user twice", async () => {
		const email = `duplicate-url-${crypto.randomUUID()}@test.com`;

		await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email,
				role: "member",
			},
		});

		await expect(
			auth.api.createInvitationURL({
				headers,
				body: {
					organizationId: testOrg.id,
					email,
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION
				.message,
		);
	});

	it("should allow resending invitation and return updated URL", async () => {
		const email = `resend-url-${crypto.randomUUID()}@test.com`;

		const result1 = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email,
				role: "member",
				callbackURL: "https://myapp.com/dashboard",
			},
		});

		// Wait a bit to ensure expiresAt will be different
		await new Promise((resolve) => setTimeout(resolve, 10));

		const result2 = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email,
				role: "member",
				callbackURL: "https://myapp.com/dashboard",
				resend: true,
			},
		});

		expect(result2.url).toBeDefined();
		expect(result2.url).toContain("/organization/accept-invitation-callback");
		expect(result2.invitation.id).toBe(result1.invitation.id);
		expect(new Date(result2.invitation.expiresAt).getTime()).toBeGreaterThan(
			new Date(result1.invitation.expiresAt).getTime(),
		);
	});

	it("should not allow inviting user who is already a member", async () => {
		// Create a new organization for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		// Create a new user
		const memberEmail = `already-member-url-${crypto.randomUUID()}@test.com`;
		const signupRes = await auth.api.signUpEmail({
			body: {
				email: memberEmail,
				password: "password123",
				name: "Already Member",
			},
		});

		// Add as member directly via adapter
		await adapter.create({
			model: "member",
			data: {
				id: crypto.randomUUID(),
				organizationId: newOrg.id,
				userId: signupRes.user.id,
				role: "member",
				createdAt: new Date(),
			},
		});

		await expect(
			auth.api.createInvitationURL({
				headers,
				body: {
					organizationId: newOrg.id,
					email: memberEmail,
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION
				.message,
		);
	});

	it("should not allow non-members to create invitation URL", async () => {
		const nonMemberEmail = `non-member-url-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: nonMemberEmail,
				password: "test123456",
				name: "Non Member",
			},
		});
		const { headers: nonMemberHeaders } = await signInWithUser(
			nonMemberEmail,
			"test123456",
		);

		await expect(
			auth.api.createInvitationURL({
				headers: nonMemberHeaders,
				body: {
					organizationId: testOrg.id,
					email: `someone-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND.message);
	});
});

describe("invitation URL hooks", async (it) => {
	let hooksCalled: string[] = [];

	const plugin = organization({
		hooks: {
			beforeCreateInvitation: async (data) => {
				hooksCalled.push("beforeCreateInvitation");
			},
			afterCreateInvitation: async (data) => {
				hooksCalled.push("afterCreateInvitation");
			},
		},
		async sendInvitationEmail() {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should call invitation hooks", async () => {
		hooksCalled = [];

		await auth.api.createInvitationURL({
			headers,
			body: {
				email: `hooks-url-test-${crypto.randomUUID()}@example.com`,
				role: "member",
				callbackURL: "https://myapp.com/dashboard",
			},
		});

		expect(hooksCalled).toContain("beforeCreateInvitation");
		expect(hooksCalled).toContain("afterCreateInvitation");
	});
});
