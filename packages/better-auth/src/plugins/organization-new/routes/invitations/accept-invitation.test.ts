import { describe, expect } from "vitest";
import { teams } from "../../addons";
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
		expect(result!.organization).toBeDefined();
		expect(result!.organization.id).toBe(testOrg.id);
		expect(result!.organization.name).toBe(testOrg.name);
		expect(result!.organization.slug).toBe(testOrg.slug);
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
		//@ts-expect-error - session is not defined
		expect(session?.session?.activeOrganizationId).toBe(testOrg.id);
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
		expect(result!.organization).toBeDefined();
		expect(result!.organization.id).toBe(testOrg.id);
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
		expect(result!.organization).toBeDefined();
		expect(result!.organization.id).toBe(org.id);
		expect(result!.organization.name).toBe(orgData.name);
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
		expect(result!.organization).toBeDefined();
		expect(result!.organization.id).toBe(org.id);
	});
});

describe("accept invitation - teams addon", async (it) => {
	const teamsAddon = teams();
	const plugin = organization({
		use: [teamsAddon],
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
	const { headers } = await signInWithTestUser();

	// Create an organization for testing (default team is auto-created)
	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should accept invitation with single team and set active team", async () => {
		// Get the default team
		const orgTeamsRes = await auth.api.listTeams({
			headers,
			query: {
				organizationId: testOrg.id,
			},
		});
		expect(orgTeamsRes.teams.length).toBeGreaterThan(0);
		const defaultTeam = orgTeamsRes.teams[0]!;

		// Create invitation with team
		const invitedEmail = `team-single-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
				teamId: defaultTeam.id,
			},
		});
		expect(invitation.invitation.teamId).toBe(defaultTeam.id);

		// Sign up and accept the invitation
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Team User",
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
		expect(result!.member).toBeDefined();

		// Check that user is a member of the team
		const userTeamsRes = await auth.api.listUserTeams({
			headers: invitedHeaders,
		});
		expect(userTeamsRes.teams.some((t) => t?.id === defaultTeam.id)).toBe(true);

		// Check that active team is set (single team case)
		const session = await auth.api.getSession({
			headers: invitedHeaders,
		});
		// @ts-expect-error - activeTeamId is added by teams addon
		expect(session?.session?.activeTeamId).toBe(defaultTeam.id);
	});

	it("should accept invitation with multiple teams and NOT set active team", async () => {
		// Create a second team
		const secondTeam = await auth.api.createTeam({
			headers,
			body: {
				organizationId: testOrg.id,
				name: `second-team-${crypto.randomUUID()}`,
			},
		});

		// Get the default team
		const orgTeamsRes = await auth.api.listTeams({
			headers,
			query: {
				organizationId: testOrg.id,
			},
		});
		const defaultTeam = orgTeamsRes.teams.find((t) => t?.id !== secondTeam.id)!;

		// Create invitation with multiple teams
		const invitedEmail = `team-multi-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
				teamId: [defaultTeam.id, secondTeam.id],
			},
		});
		expect(invitation.invitation.teamId).toBe(
			`${defaultTeam.id},${secondTeam.id}`,
		);

		// Sign up and accept the invitation
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Multi Team User",
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

		// Check that user is a member of both teams
		const userTeamsRes = await auth.api.listUserTeams({
			headers: invitedHeaders,
		});
		expect(userTeamsRes.teams.some((t) => t?.id === defaultTeam.id)).toBe(true);
		expect(userTeamsRes.teams.some((t) => t?.id === secondTeam.id)).toBe(true);

		// Check that active team is NOT set (multiple teams case)
		const session = await auth.api.getSession({
			headers: invitedHeaders,
		});
		// @ts-expect-error - activeTeamId is added by teams addon
		expect(session?.session?.activeTeamId).toBeNull();
	});

	it("should accept invitation without teamId and not add to any team", async () => {
		// Create invitation without teamId
		const invitedEmail = `no-team-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});
		expect(invitation.invitation.teamId).toBeNull();

		// Sign up and accept the invitation
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "No Team User",
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

		// Check that user is NOT a member of any team
		const userTeamsRes = await auth.api.listUserTeams({
			headers: invitedHeaders,
		});
		expect(userTeamsRes.teams.length).toBe(0);
	});
});

describe("accept invitation - team member limit", async (it) => {
	const teamsAddon = teams({
		maximumMembersPerTeam: 1, // Only 1 member allowed per team
	});
	const plugin = organization({
		use: [teamsAddon],
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should reject invitation creation when team member limit is already reached", async () => {
		// Create a new org (owner is auto-added to default team)
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Get the default team (owner is already member #1)
		const orgTeamsRes = await auth.api.listTeams({
			headers,
			query: {
				organizationId: org.id,
			},
		});
		const defaultTeam = orgTeamsRes.teams[0]!;

		// Try to create invitation with team - should fail because limit is 1 and owner is already there
		const invitedEmail = `team-limit-${crypto.randomUUID()}@test.com`;
		await expect(
			auth.api.createInvitation({
				headers,
				body: {
					organizationId: org.id,
					email: invitedEmail,
					role: "member",
					teamId: defaultTeam.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED.message,
		);
	});
});

describe("accept invitation - team member limit function", async (it) => {
	const teamsAddon = teams({
		maximumMembersPerTeam: async ({ teamId, organizationId }) => {
			// Dynamic limit based on team or org
			// Note: The limit check happens AFTER adding the member, so effective limit is N-1
			// With limit=4, we can have owner + 2 invited users = 3 members max
			return 4;
		},
	});
	const plugin = organization({
		use: [teamsAddon],
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
	const { headers } = await signInWithTestUser();

	it("should respect dynamic team member limit function", async () => {
		// Create a new org
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Get the default team (owner is already member #1)
		const orgTeamsRes = await auth.api.listTeams({
			headers,
			query: {
				organizationId: org.id,
			},
		});
		const defaultTeam = orgTeamsRes.teams[0]!;

		// First invitation should succeed (member #2, limit is 4)
		const firstInvitedEmail = `team-func-1-${crypto.randomUUID()}@test.com`;
		const firstInvitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: firstInvitedEmail,
				role: "member",
				teamId: defaultTeam.id,
			},
		});

		await auth.api.signUpEmail({
			body: {
				email: firstInvitedEmail,
				password: "test123456",
				name: "First Team Member",
			},
		});
		const { headers: firstInvitedHeaders } = await signInWithUser(
			firstInvitedEmail,
			"test123456",
		);

		const firstResult = await auth.api.acceptInvitation({
			headers: firstInvitedHeaders,
			body: {
				invitationId: firstInvitation.invitation.id,
			},
		});
		expect(firstResult).not.toBeNull();
		expect(firstResult!.invitation.status).toBe("accepted");

		// Second invitation should succeed (member #3, limit is 4)
		const secondInvitedEmail = `team-func-2-${crypto.randomUUID()}@test.com`;
		const secondInvitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: secondInvitedEmail,
				role: "member",
				teamId: defaultTeam.id,
			},
		});

		await auth.api.signUpEmail({
			body: {
				email: secondInvitedEmail,
				password: "test123456",
				name: "Second Team Member",
			},
		});
		const { headers: secondInvitedHeaders } = await signInWithUser(
			secondInvitedEmail,
			"test123456",
		);

		const secondResult = await auth.api.acceptInvitation({
			headers: secondInvitedHeaders,
			body: {
				invitationId: secondInvitation.invitation.id,
			},
		});
		expect(secondResult).not.toBeNull();
		expect(secondResult!.invitation.status).toBe("accepted");

		// Third invitation creation should fail (would be member #4, but team limit check
		// happens at creation time with count >= limit, so 3 >= 4 = false, passes)
		// However, at acceptance time, 4 >= 4 = true, so it would fail there
		// For now, verify that after 3 members, the fourth invitation creation still passes
		// (because 3 < 4), but acceptance would fail
		const thirdInvitedEmail = `team-func-3-${crypto.randomUUID()}@test.com`;
		const thirdInvitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: thirdInvitedEmail,
				role: "member",
				teamId: defaultTeam.id,
			},
		});
		expect(thirdInvitation.invitation).toBeDefined();

		// Accepting the third invitation should fail (member count becomes 4, 4 >= 4 = true)
		await auth.api.signUpEmail({
			body: {
				email: thirdInvitedEmail,
				password: "test123456",
				name: "Third Team Member",
			},
		});
		const { headers: thirdInvitedHeaders } = await signInWithUser(
			thirdInvitedEmail,
			"test123456",
		);

		await expect(
			auth.api.acceptInvitation({
				headers: thirdInvitedHeaders,
				body: {
					invitationId: thirdInvitation.invitation.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED.message,
		);
	});
});
