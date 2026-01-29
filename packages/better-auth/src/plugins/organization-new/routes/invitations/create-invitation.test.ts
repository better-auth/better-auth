import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("create invitation", async (it) => {
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

	it.each([
		{
			role: "owner" as const,
			email: `invite-owner-${crypto.randomUUID()}@test.com`,
		},
		{
			role: "admin" as const,
			email: `invite-admin-${crypto.randomUUID()}@test.com`,
		},
		{
			role: "member" as const,
			email: `invite-member-${crypto.randomUUID()}@test.com`,
		},
	])("invites user to organization with role $role", async ({
		role,
		email,
	}) => {
		const result = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email,
				role,
			},
		});
		expect(result.invitation).toBeDefined();
		expect(result.invitation.email).toBe(email);
		expect(result.invitation.role).toBe(role);
		expect(result.invitation.status).toBe("pending");
	});

	it("should create invitation with multiple roles", async () => {
		const result = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: `multi-role-${crypto.randomUUID()}@test.com`,
				role: ["admin", "member"],
			},
		});
		expect(result.invitation.role).toBe("admin,member");
	});

	it("should validate email format", async () => {
		await expect(
			auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: "invalid-email",
					role: "member",
				},
			}),
		).rejects.toThrow();
	});

	it("should not allow inviting a user twice regardless of email casing", async () => {
		const rng = crypto.randomUUID();
		const userEmail = `${rng}@email.com`;

		const result = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: userEmail,
				role: "member",
			},
		});
		expect(result.invitation).toBeDefined();
		expect(result.invitation.email).toBe(userEmail);

		// Try to invite the same email again
		await expect(
			auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: userEmail,
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION
				.message,
		);

		// Try to invite the same email with different casing
		await expect(
			auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: userEmail.toUpperCase(),
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION
				.message,
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
		const memberEmail = `already-member-${crypto.randomUUID()}@test.com`;
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

		// Try to invite the user who is already a member
		await expect(
			auth.api.createInvitation({
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

		// Also test with uppercase email
		await expect(
			auth.api.createInvitation({
				headers,
				body: {
					organizationId: newOrg.id,
					email: memberEmail.toUpperCase(),
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION
				.message,
		);
	});

	it("should not allow inviting member with a creator role unless they are creator", async () => {
		// Create a new organization
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		// Create an admin user
		const adminEmail = `admin-user-${crypto.randomUUID()}@test.com`;
		const adminSignup = await auth.api.signUpEmail({
			body: {
				email: adminEmail,
				password: "test123456",
				name: "Admin User",
			},
		});

		// Add admin to org via adapter
		await adapter.create({
			model: "member",
			data: {
				id: crypto.randomUUID(),
				organizationId: newOrg.id,
				userId: adminSignup.user.id,
				role: "admin",
				createdAt: new Date(),
			},
		});

		// Sign in as admin and try to invite someone with owner role
		const { headers: adminHeaders } = await signInWithUser(
			adminEmail,
			"test123456",
		);

		await expect(
			auth.api.createInvitation({
				headers: adminHeaders,
				body: {
					organizationId: newOrg.id,
					email: `some-user-${crypto.randomUUID()}@test.com`,
					role: "owner",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE
				.message,
		);
	});

	it("should not allow non-members to invite", async () => {
		// Create a user who is not a member of the org
		const nonMemberEmail = `non-member-${crypto.randomUUID()}@test.com`;
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
			auth.api.createInvitation({
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

describe("invitation limit", async (it) => {
	const plugin = organization({
		invitationLimit: 1,
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const org = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should invite member to organization", async () => {
		const result = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: `invite-limit-test-${crypto.randomUUID()}@test.com`,
				role: "member",
			},
		});
		expect(result.invitation.status).toBe("pending");
	});

	it("should throw error when invitation limit is reached", async () => {
		await expect(
			auth.api.createInvitation({
				headers,
				body: {
					organizationId: org.id,
					email: `invite-limit-test-2-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED.message,
		);
	});

	it("should throw error with custom invitation limit", async () => {
		const { auth: auth2, signInWithTestUser: signInWithTestUser2 } =
			await defineInstance([
				organization({
					invitationLimit: async (data, ctx) => {
						return 0;
					},
					async sendInvitationEmail() {},
				}),
			]);
		const { headers: headers2 } = await signInWithTestUser2();
		const customOrgData = getOrganizationData();
		const customOrg = await auth2.api.createOrganization({
			body: {
				name: customOrgData.name,
				slug: customOrgData.slug,
			},
			headers: headers2,
		});

		await expect(
			auth2.api.createInvitation({
				body: {
					email: `custom-limit-test-${crypto.randomUUID()}@test.com`,
					role: "member",
					organizationId: customOrg.id,
				},
				headers: headers2,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED.message,
		);
	});
});

describe("resend invitation should reuse existing", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, adapter } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const org = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should reuse existing invitation when resend is true", async () => {
		const email = `resend-test-${crypto.randomUUID()}@test.com`;
		const result = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email,
				role: "member",
			},
		});
		expect(result.invitation.status).toBe("pending");
		const originalInviteId = result.invitation.id;
		const originalExpiresAt = result.invitation.expiresAt;

		// Wait a bit to ensure expiresAt will be different
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Resend the invitation
		const resendResult = (await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email,
				role: "member",
				resend: true,
			},
		})) as any;

		// Check response - resend may return different structure
		expect(resendResult).toBeDefined();

		// Try to access invitation either at top level or nested
		const resendInvitation = resendResult.id
			? resendResult
			: resendResult.invitation || resendResult;
		expect(resendInvitation).toBeDefined();
		expect(resendInvitation.id).toBe(originalInviteId);
		expect(resendInvitation.status).toBe("pending");
		// expiresAt should be updated
		expect(new Date(resendInvitation.expiresAt).getTime()).toBeGreaterThan(
			new Date(originalExpiresAt).getTime(),
		);

		// Check DB to ensure only 1 invitation exists (not duplicated)
		const invitations = await adapter.findMany({
			model: "invitation",
			where: [
				{ field: "email", value: email },
				{ field: "organizationId", value: org.id },
			],
		});
		expect(invitations.length).toBe(1);
	});
});

describe("organization invitation hooks", async (it) => {
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

		await auth.api.createInvitation({
			headers,
			body: {
				email: `hooks-test-${crypto.randomUUID()}@example.com`,
				role: "member",
			},
		});

		expect(hooksCalled).toContain("beforeCreateInvitation");
		expect(hooksCalled).toContain("afterCreateInvitation");
	});
});

describe("member permission to invite", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser, adapter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const org = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should not allow members without invite permission to invite", async () => {
		// Create a member user
		const memberEmail = `member-no-invite-${crypto.randomUUID()}@test.com`;
		const signupRes = await auth.api.signUpEmail({
			body: {
				email: memberEmail,
				password: "test123456",
				name: "Member User",
			},
		});

		// Add as member (default member role doesn't have invite permission)
		await adapter.create({
			model: "member",
			data: {
				id: crypto.randomUUID(),
				organizationId: org.id,
				userId: signupRes.user.id,
				role: "member",
				createdAt: new Date(),
			},
		});

		const { headers: memberHeaders } = await signInWithUser(
			memberEmail,
			"test123456",
		);

		await expect(
			auth.api.createInvitation({
				headers: memberHeaders,
				body: {
					organizationId: org.id,
					email: `someone-to-invite-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES
				.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION.message,
		);
	});

	it("should allow admins to invite members", async () => {
		// Create an admin user
		const adminEmail = `admin-can-invite-${crypto.randomUUID()}@test.com`;
		const signupRes = await auth.api.signUpEmail({
			body: {
				email: adminEmail,
				password: "test123456",
				name: "Admin User",
			},
		});

		// Add as admin
		await adapter.create({
			model: "member",
			data: {
				id: crypto.randomUUID(),
				organizationId: org.id,
				userId: signupRes.user.id,
				role: "admin",
				createdAt: new Date(),
			},
		});

		const { headers: adminHeaders } = await signInWithUser(
			adminEmail,
			"test123456",
		);

		const inviteEmail = `admin-invited-${crypto.randomUUID()}@test.com`;
		const result = await auth.api.createInvitation({
			headers: adminHeaders,
			body: {
				organizationId: org.id,
				email: inviteEmail,
				role: "member",
			},
		});
		expect(result.invitation.email).toBe(inviteEmail);
		expect(result.invitation.role).toBe("member");
	});
});
