import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("accept invitation", async (it) => {
	const plugin = organization({
		membershipLimit: 6,
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

	it("should not accept invitation with invalid invitation ID", async () => {
		// Create a user to accept the invitation
		const invitedEmail = `invited-invalid-${crypto.randomUUID()}@test.com`;
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

		await expect(
			auth.api.acceptInvitation({
				headers: invitedHeaders,
				body: {
					invitationId: "invalid-id-123",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND.message);
	});

	it("should not allow accepting invitation for another user", async () => {
		// Create invitation for one user
		const targetEmail = `target-${crypto.randomUUID()}@test.com`;
		const wrongEmail = `wrong-${crypto.randomUUID()}@test.com`;

		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: targetEmail,
				role: "member",
			},
		});

		// Sign up both users
		await auth.api.signUpEmail({
			body: {
				email: targetEmail,
				password: "test123456",
				name: "Target User",
			},
		});
		await auth.api.signUpEmail({
			body: {
				email: wrongEmail,
				password: "test123456",
				name: "Wrong User",
			},
		});

		// Try to accept with wrong user
		const { headers: wrongHeaders } = await signInWithUser(
			wrongEmail,
			"test123456",
		);

		await expect(
			auth.api.acceptInvitation({
				headers: wrongHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION
				.message,
		);
	});

	it("should accept invitation successfully", async () => {
		const invitedEmail = `accept-success-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
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

		// Accept the invitation
		const result = await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result!.invitation.status).toBe("accepted");
		expect(result!.member).toBeDefined();
		expect(result!.member.organizationId).toBe(testOrg.id);
		expect(result!.member.role).toBe("member");
	});

	it("should set active organization after accepting invitation", async () => {
		const invitedEmail = `active-org-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "admin",
			},
		});

		// Sign up and accept
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

		await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		// Check session has active organization set
		const session = await auth.api.getSession({
			headers: invitedHeaders,
		});
		expect(session?.session.activeOrganizationId).toBe(testOrg.id);
	});

	it("should accept invitation with email case insensitively", async () => {
		// Create invitation with lowercase email
		const rng = crypto.randomUUID();
		const lowerEmail = `case-test-${rng}@test.com`;

		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: lowerEmail,
				role: "member",
			},
		});

		// Sign up with uppercase email
		await auth.api.signUpEmail({
			body: {
				email: lowerEmail.toUpperCase(),
				password: "test123456",
				name: "Case Test User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			lowerEmail.toUpperCase(),
			"test123456",
		);

		// Should be able to accept
		const result = await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result!.invitation.status).toBe("accepted");
	});

	it("should not accept already accepted invitation", async () => {
		const invitedEmail = `double-accept-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up and accept first time
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

		await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		// Try to accept again
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

describe("accept invitation - membership limit", async (it) => {
	const plugin = organization({
		membershipLimit: 2,
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser, adapter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should not allow accepting invitation when membership limit is reached", async () => {
		// Create org (owner is member #1)
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Add another member directly to reach limit (2)
		const existingMemberEmail = `existing-${crypto.randomUUID()}@test.com`;
		const signupRes = await auth.api.signUpEmail({
			body: {
				email: existingMemberEmail,
				password: "test123456",
				name: "Existing Member",
			},
		});
		await adapter.create({
			model: "member",
			data: {
				id: crypto.randomUUID(),
				organizationId: org.id,
				userId: signupRes.user.id,
				role: "member",
				createdAt: new Date(),
			},
			forceAllowId: true,
		});

		// Create invitation for another user
		const invitedEmail = `over-limit-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up invited user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Over Limit User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Try to accept - should fail due to membership limit
		await expect(
			auth.api.acceptInvitation({
				headers: invitedHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED.message,
		);
	});
});

describe("accept invitation - membership limit function", async (it) => {
	const plugin = organization({
		membershipLimit: (user, organization) => {
			// For organizations with "limited" in name, limit to 1 member
			if (organization.name.includes("limited")) {
				return 1;
			}
			return 100;
		},
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
	const { headers } = await signInWithTestUser();

	it("should respect dynamic membershipLimit function when accepting invitation", async () => {
		// Create org with "limited" in name (limit = 1, so only owner)
		const orgData = getOrganizationData({
			name: "limited-org-test",
			slug: `limited-org-test-${crypto.randomUUID()}`,
		});
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create invitation
		const invitedEmail = `limit-func-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up and try to accept
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Limited User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Should fail because limit is 1 (only owner)
		await expect(
			auth.api.acceptInvitation({
				headers: invitedHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED.message,
		);
	});

	it("should allow accepting invitation when organization name does not trigger limit", async () => {
		// Create org without "limited" in name (limit = 100)
		const orgData = getOrganizationData({
			name: "normal-org-test",
			slug: `normal-org-test-${crypto.randomUUID()}`,
		});
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create and accept invitation
		const invitedEmail = `normal-func-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Normal User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Should succeed
		const result = await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result!.invitation.status).toBe("accepted");
		expect(result!.member.organizationId).toBe(org.id);
	});
});

describe("accept invitation - expired invitation", async (it) => {
	const plugin = organization({
		invitationExpiresIn: 1, // 1 second
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
	const { headers } = await signInWithTestUser();

	it("should not accept expired invitation", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const invitedEmail = `expired-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up the user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Expired User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Wait for invitation to expire
		await new Promise((resolve) => setTimeout(resolve, 1100));

		// Try to accept expired invitation
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

describe("accept invitation - hooks", async (it) => {
	let hooksCalled: string[] = [];

	const plugin = organization({
		hooks: {
			beforeAcceptInvitation: async (data) => {
				hooksCalled.push("beforeAcceptInvitation");
			},
			afterAcceptInvitation: async (data) => {
				hooksCalled.push("afterAcceptInvitation");
			},
		},
		async sendInvitationEmail() {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const org = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should call accept invitation hooks", async () => {
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

		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Hooks User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(hooksCalled).toContain("beforeAcceptInvitation");
		expect(hooksCalled).toContain("afterAcceptInvitation");
	});
});

describe("accept invitation - multiple roles", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
	const { headers } = await signInWithTestUser();

	it("should accept invitation with multiple roles", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const invitedEmail = `multi-role-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: ["admin", "member"],
			},
		});
		expect(invitation.invitation.role).toBe("admin,member");

		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Multi Role User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		const result = await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result!.invitation.status).toBe("accepted");
		expect(result!.member.role).toBe("admin,member");
	});
});
