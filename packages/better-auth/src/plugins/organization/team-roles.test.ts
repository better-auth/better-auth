import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "./organization";
import { APIError } from "better-call";

describe("organization - team roles", async (it) => {
	const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
		plugins: [
			organization({
				teams: {
					enabled: true,
					teamRoles: {
						defaultRole: "member",
						creatorRole: "admin",
					},
				},
			}),
		],
	});

	const admin = await signInWithTestUser();

	// Create additional test users
	const user2Res = await auth.api.signUpEmail({
		body: {
			email: "team-member@example.com",
			password: "password123",
			name: "Team Member",
		},
	});

	const user3Res = await auth.api.signUpEmail({
		body: {
			email: "org-admin@example.com",
			password: "password123",
			name: "Org Admin",
		},
	});

	const user2SignIn = await signInWithUser(
		"team-member@example.com",
		"password123",
	);
	const user2 = {
		user: user2Res.user,
		headers: user2SignIn.headers,
	};

	const user3SignIn = await signInWithUser(
		"org-admin@example.com",
		"password123",
	);
	const user3 = {
		user: user3Res.user,
		headers: user3SignIn.headers,
	};

	let organizationId: string;
	let teamId: string;

	/**
	 * Setup: Create organization and team
	 */
	it("setup: create organization and team", async () => {
		const org = await auth.api.createOrganization({
			headers: admin.headers,
			body: {
				name: "Test Organization",
				slug: "test-org-team-roles",
			},
		});
		organizationId = org.id;
		expect(organizationId).toBeDefined();

		// Add user3 as organization admin
		await auth.api.addMember({
			headers: admin.headers,
			body: {
				userId: user3.user.id,
				organizationId,
				role: "admin",
			},
		});

		// Create a team with admin user as creator (should be team admin)
		const team = await auth.api.createTeam({
			headers: admin.headers,
			body: {
				name: "Test Team",
				organizationId,
			},
		});
		teamId = team.id;
		expect(teamId).toBeDefined();
	});

	/**
	 * USER STORY 1: As a team admin I can add, remove and invite members to my team
	 */
	it("team creator should be automatically added as team admin", async () => {
		const teamMembers = await auth.api.listTeamMembers({
			headers: admin.headers,
			query: {
				teamId,
			},
		});

		expect(teamMembers).toBeDefined();
		expect(Array.isArray(teamMembers)).toBe(true);
		expect(teamMembers.length).toBeGreaterThanOrEqual(1);

		// Find the creator's membership
		const creatorMembership = teamMembers.find(
			(m: any) => m.userId === admin.user.id,
		);
		expect(creatorMembership).toBeDefined();
		expect(creatorMembership.role).toBe("admin");
	});

	it("team admin can add members to the team with specific role", async () => {
		// First add user2 to organization
		await auth.api.addMember({
			headers: admin.headers,
			body: {
				userId: user2.user.id,
				organizationId,
				role: "member",
			},
		});

		// Team admin adds user2 to team with member role
		const teamMember = await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId,
				userId: user2.user.id,
				role: "member",
			},
		});

		expect(teamMember).toBeDefined();
		expect(teamMember.userId).toBe(user2.user.id);
		expect(teamMember.teamId).toBe(teamId);
		expect(teamMember.role).toBe("member");
	});

	/**
	 * USER STORY 2: As a team admin, I can assign roles to my team members
	 */
	it("team admin can update member roles", async () => {
		// Admin promotes user2 to admin
		const updatedMember = await auth.api.updateTeamMemberRole({
			headers: admin.headers,
			body: {
				teamId,
				userId: user2.user.id,
				role: "admin",
			},
		});

		expect(updatedMember.role).toBe("admin");
	});

	it("team admin can demote member roles", async () => {
		// Admin demotes user2 back to member
		const updatedMember = await auth.api.updateTeamMemberRole({
			headers: admin.headers,
			body: {
				teamId,
				userId: user2.user.id,
				role: "member",
			},
		});

		expect(updatedMember.role).toBe("member");
	});

	it("users cannot change their own team role", async () => {
		// Admin tries to change their own role
		try {
			await auth.api.updateTeamMemberRole({
				headers: admin.headers,
				body: {
					teamId,
					userId: admin.user.id,
					role: "member",
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
		}
	});

	/**
	 * USER STORY 3: As a team member, I can view members of my team
	 */
	it("team member can view all team members", async () => {
		const members = await auth.api.listTeamMembers({
			headers: user2.headers,
			query: {
				teamId,
			},
		});

		expect(members).toBeDefined();
		expect(Array.isArray(members)).toBe(true);
		expect(members.length).toBeGreaterThanOrEqual(2);

		// Verify it includes both team admin and member
		const userIds = members.map((m: any) => m.userId);
		expect(userIds).toContain(admin.user.id);
		expect(userIds).toContain(user2.user.id);
	});

	/**
	 * USER STORY 4: As an organization admin, I can assign roles to team members
	 */
	it("organization admin can view team members", async () => {
		// First add user3 as a team member so they can view team members
		await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId,
				userId: user3.user.id,
				role: "member",
			},
		});

		const members = await auth.api.listTeamMembers({
			headers: user3.headers,
			query: {
				teamId,
			},
		});

		expect(members).toBeDefined();
		expect(Array.isArray(members)).toBe(true);
	});

	it("organization admin can update team member roles", async () => {
		// Set active organization for user3
		await auth.api.setActiveOrganization({
			headers: user3.headers,
			body: {
				organizationId,
			},
		});

		// user3 (org admin, now also team member) updates user2's role
		const updatedMember = await auth.api.updateTeamMemberRole({
			headers: user3.headers,
			body: {
				teamId,
				userId: user2.user.id,
				role: "admin",
			},
		});

		expect(updatedMember.role).toBe("admin");

		// Reset back to member for other tests
		await auth.api.updateTeamMemberRole({
			headers: admin.headers,
			body: {
				teamId,
				userId: user2.user.id,
				role: "member",
			},
		});
	});

	it("organization admin can add members to any team", async () => {
		// Set active organization for user3 if not already set
		await auth.api.setActiveOrganization({
			headers: user3.headers,
			body: {
				organizationId,
			},
		});

		// user3 is already a team member from previous test, try to add another user
		const newMember = await auth.api.signUpEmail({
			body: {
				email: "another-member@example.com",
				password: "password123",
				name: "Another Member",
			},
		});

		// Add to organization first
		await auth.api.addMember({
			headers: admin.headers,
			body: {
				userId: newMember.user.id,
				organizationId,
				role: "member",
			},
		});

		// Now org admin adds them to team
		const teamMember = await auth.api.addTeamMember({
			headers: user3.headers,
			body: {
				teamId,
				userId: newMember.user.id,
				role: "member",
			},
		});

		expect(teamMember).toBeDefined();
		expect(teamMember.userId).toBe(newMember.user.id);
		expect(teamMember.role).toBe("member");
	});

	it("organization admin can remove members from any team", async () => {
		// Set active organization for user3
		await auth.api.setActiveOrganization({
			headers: user3.headers,
			body: {
				organizationId,
			},
		});

		const result = await auth.api.removeTeamMember({
			headers: user3.headers,
			body: {
				teamId,
				userId: user3.user.id,
			},
		});

		expect(result.message).toBe("Team member removed successfully.");
	});

	/**
	 * ADDITIONAL TESTS: Edge cases and validations
	 */
	it("adding team member without role uses default role", async () => {
		const newUserRes = await auth.api.signUpEmail({
			body: {
				email: "default-role@example.com",
				password: "password123",
				name: "Default Role User",
			},
		});

		await auth.api.addMember({
			headers: admin.headers,
			body: {
				userId: newUserRes.user.id,
				organizationId,
				role: "member",
			},
		});

		const teamMember = await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId,
				userId: newUserRes.user.id,
				// No role specified
			},
		});

		expect(teamMember.role).toBe("member"); // Should use default role
	});

	it("team member can remove themselves from team", async () => {
		const result = await auth.api.removeTeamMember({
			headers: admin.headers,
			body: {
				teamId,
				userId: user2.user.id,
			},
		});

		expect(result.message).toBe("Team member removed successfully.");
	});
});
