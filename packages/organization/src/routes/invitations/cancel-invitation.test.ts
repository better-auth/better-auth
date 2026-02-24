import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("cancel invitation", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
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

	it("should not cancel invitation with invalid invitation ID", async () => {
		await expect(
			auth.api.cancelInvitation({
				headers,
				body: {
					invitationId: "invalid-id-123",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND.message);
	});

	it("should not allow canceling invitation if user is not a member of the organization", async () => {
		// Create invitation
		const invitedEmail = `cancel-nonmember-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Create another user who is not a member
		const nonMemberEmail = `nonmember-${crypto.randomUUID()}@test.com`;
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
			auth.api.cancelInvitation({
				headers: nonMemberHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND.message);
	});

	it("should not allow canceling invitation without proper permissions", async () => {
		// Create invitation
		const invitedEmail = `cancel-no-permission-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Create a user and add them as a regular member (without cancel permission)
		const memberEmail = `member-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: memberEmail,
				password: "test123456",
				name: "Regular Member",
			},
		});

		// Invite and accept to make them a member
		const memberInvitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: memberEmail,
				role: "member",
			},
		});
		const { headers: memberHeaders } = await signInWithUser(
			memberEmail,
			"test123456",
		);
		await auth.api.acceptInvitation({
			headers: memberHeaders,
			body: {
				invitationId: memberInvitation.invitation.id,
			},
		});

		// Try to cancel the original invitation as regular member
		await expect(
			auth.api.cancelInvitation({
				headers: memberHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION
				.message,
		);
	});

	it("should cancel invitation successfully as owner", async () => {
		const invitedEmail = `cancel-success-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		expect(invitation.invitation.status).toBe("pending");

		// Cancel the invitation as owner
		const result = await auth.api.cancelInvitation({
			headers,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.status).toBe("canceled");
	});

	it("should cancel invitation successfully as admin", async () => {
		// Create a new org for this test
		const adminOrgData = getOrganizationData();
		const adminOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: adminOrgData.name,
				slug: adminOrgData.slug,
			},
		});

		// Create an admin user
		const adminEmail = `admin-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: adminEmail,
				password: "test123456",
				name: "Admin User",
			},
		});

		// Invite and accept as admin
		const adminInvitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: adminOrg.id,
				email: adminEmail,
				role: "admin",
			},
		});
		const { headers: adminHeaders } = await signInWithUser(
			adminEmail,
			"test123456",
		);
		await auth.api.acceptInvitation({
			headers: adminHeaders,
			body: {
				invitationId: adminInvitation.invitation.id,
			},
		});

		// Create another invitation to cancel
		const invitedEmail = `cancel-by-admin-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: adminOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Cancel as admin
		const result = await auth.api.cancelInvitation({
			headers: adminHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.status).toBe("canceled");
	});

	it("canceled invitation cannot be accepted", async () => {
		const invitedEmail = `cancel-accept-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Cancel the invitation
		await auth.api.cancelInvitation({
			headers,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		// Sign up the invited user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Invited User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Try to accept the canceled invitation
		await expect(
			auth.api.acceptInvitation({
				headers: invitedHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND.message);
	});
});

describe("cancel invitation - hooks", async (it) => {
	let hooksCalled: string[] = [];

	const plugin = organization({
		hooks: {
			beforeCancelInvitation: async (data) => {
				hooksCalled.push("beforeCancelInvitation");
			},
			afterCancelInvitation: async (data) => {
				hooksCalled.push("afterCancelInvitation");
			},
		},
		async sendInvitationEmail() {},
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

	it("should call cancel invitation hooks", async () => {
		hooksCalled = [];

		const invitedEmail = `hooks-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		await auth.api.cancelInvitation({
			headers,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(hooksCalled).toContain("beforeCancelInvitation");
		expect(hooksCalled).toContain("afterCancelInvitation");
	});
});
