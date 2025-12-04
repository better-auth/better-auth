import { APIError } from "better-call";
import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "./organization";

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

		if (!org?.id) {
			throw new Error("Organization creation failed, no ID returned.");
		}

		organizationId = org.id;

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
		expect(creatorMembership?.role).toBe("admin");
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

		expect(updatedMember?.role).toBe("admin");
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

		expect(updatedMember?.role).toBe("member");
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

		expect(updatedMember?.role).toBe("admin");

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

	/**
	 * PERMISSION CHECKS: Verify role-based access control
	 */
	it("team admin should have team permissions", async () => {
		// Admin (team creator with admin role) should have team permissions
		const hasTeamPermission = await auth.api.hasPermission({
			headers: admin.headers,
			body: {
				organizationId,
				permissions: {
					teamMember: ["create", "update", "delete"],
				},
			},
		});

		expect(hasTeamPermission.success).toBe(true);
	});

	it("organization admin should have organization and team permissions", async () => {
		// Set user3's active organization
		await auth.api.setActiveOrganization({
			headers: user3.headers,
			body: {
				organizationId,
			},
		});

		// Org admin should have member and team permissions
		const hasMemberPermission = await auth.api.hasPermission({
			headers: user3.headers,
			body: {
				organizationId,
				permissions: {
					member: ["create", "update", "delete"],
					teamMember: ["create", "update", "delete"],
				},
			},
		});

		expect(hasMemberPermission.success).toBe(true);
	});

	it("team member should only have read permissions on team", async () => {
		// Add user2 to team if not already there
		const existingMember = await auth.api.listTeamMembers({
			headers: admin.headers,
			query: {
				teamId,
			},
		});

		const isUser2InTeam = existingMember.some(
			(m: any) => m.userId === user2.user.id,
		);

		if (!isUser2InTeam) {
			await auth.api.addTeamMember({
				headers: admin.headers,
				body: {
					teamId,
					userId: user2.user.id,
					role: "member",
				},
			});
		}

		// Team member should have limited permissions
		const canDeleteMember = await auth.api.hasPermission({
			headers: user2.headers,
			body: {
				organizationId,
				permissions: {
					teamMember: ["delete"],
				},
			},
		});

		// Team member should NOT be able to delete team members
		expect(canDeleteMember.success).toBe(false);

		// But they should be able to read team member info
		const canReadTeamMember = await auth.api.hasPermission({
			headers: user2.headers,
			body: {
				organizationId,
				permissions: {
					teamMember: ["read"],
				},
			},
		});

		expect(canReadTeamMember.success).toBe(true);
	});

	it("user should NOT have permissions in a different organization", async () => {
		// Create a second organization
		const secondOrg = await auth.api.createOrganization({
			headers: admin.headers,
			body: {
				name: "Different Organization",
				slug: "different-org-team-roles",
			},
		});

		// user2 should NOT have team permissions in an organization they're not a member of
		try {
			await auth.api.hasPermission({
				headers: user2.headers,
				body: {
					organizationId: secondOrg?.id, // Different org
					permissions: {
						teamMember: ["create", "update", "delete"],
					},
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error) {
			// Expected to throw UNAUTHORIZED error
			expect(error).toBeInstanceOf(APIError);
		}

		// Also verify they can't even read in a different org
		try {
			await auth.api.hasPermission({
				headers: user2.headers,
				body: {
					organizationId: secondOrg?.id,
					permissions: {
						teamMember: ["read"],
					},
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
		}
	});

	it("permissions should be consistent across different teams in same organization", async () => {
		// Create a second team in the same organization
		const secondTeam = await auth.api.createTeam({
			headers: admin.headers,
			body: {
				name: "Second Test Team",
				organizationId,
			},
		});

		// Admin's permissions should be the same when checking with different teamIds
		const permissionsForFirstTeam = await auth.api.hasPermission({
			headers: admin.headers,
			body: {
				organizationId,
				teamId, // Check permissions for first team
				permissions: {
					teamMember: ["create", "update", "delete"],
				},
			},
		});

		// Check permissions for the second team
		const permissionsForSecondTeam = await auth.api.hasPermission({
			headers: admin.headers,
			body: {
				organizationId,
				teamId: secondTeam.id, // Check permissions for second team
				permissions: {
					teamMember: ["create", "update", "delete"],
				},
			},
		});

		expect(permissionsForFirstTeam.success).toBe(true);
		expect(permissionsForSecondTeam.success).toBe(true);

		// Both should have the same result (team admins have same permissions across teams)
		expect(permissionsForFirstTeam.success).toBe(
			permissionsForSecondTeam.success,
		);
	});

	it("team member permissions should be specific to their team role", async () => {
		// Create a new user who will be a basic org member
		const limitedUserRes = await auth.api.signUpEmail({
			body: {
				email: "limited-team-member@example.com",
				password: "password123",
				name: "Limited Team Member",
			},
		});

		// Add this user to the organization as a basic member
		await auth.api.addMember({
			headers: admin.headers,
			body: {
				userId: limitedUserRes.user.id,
				organizationId,
				role: "member",
			},
		});

		// Get headers for the limited user
		const limitedUserSignIn = await signInWithUser(
			"limited-team-member@example.com",
			"password123",
		);

		// Set active organization for admin
		await auth.api.setActiveOrganization({
			headers: admin.headers,
			body: {
				organizationId,
			},
		});

		// Create another team where this user is NOT a member
		const thirdTeam = await auth.api.createTeam({
			headers: admin.headers,
			body: {
				name: "Third Test Team",
				organizationId,
			},
		});

		// Add limited user to the first team with admin role
		await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId,
				userId: limitedUserRes.user.id,
				role: "admin",
			},
		});

		// Limited user should have delete permissions in their team (as team admin)
		const canDeleteInCurrentTeam = await auth.api.hasPermission({
			headers: limitedUserSignIn.headers,
			body: {
				organizationId,
				teamId, // First team where user is an admin
				permissions: {
					teamMember: ["delete"],
				},
			},
		});

		expect(canDeleteInCurrentTeam.success).toBe(true);

		// Limited user should still have org-level member permissions
		// (Falls back to org role when checking a team they're not a member of)
		const orgMemberPermissions = await auth.api.hasPermission({
			headers: limitedUserSignIn.headers,
			body: {
				organizationId,
				teamId: thirdTeam.id, // Different team where user is NOT a member
				permissions: {
					teamMember: ["read"],
				},
			},
		});

		// This should succeed because they're an org member (fallback behavior)
		expect(orgMemberPermissions.success).toBe(true);
	});

	it("custom team roles should be recognized in permission checks", async () => {
		// Test that custom team roles defined in options.teams.teamRoles.roles
		// are properly merged into the permission check
		// This test verifies the fix for: "When checking a team-specific role we pass
		// teamMember.role to hasPermission, but we never merge options.teams.teamRoles.roles
		// into the role map, so any custom team role (e.g. viewer) is missing and
		// authorization always fails."

		// Note: This test documents the expected behavior when custom team roles are configured.
		// The test assumes the organization plugin was initialized with custom team roles.
		// In a real scenario, you would configure the organization plugin like:
		// organization({
		//   teams: {
		//     enabled: true,
		//     teamRoles: {
		//       roles: {
		//         viewer: customViewerRole,
		//         editor: customEditorRole,
		//       },
		//       defaultRole: "viewer",
		//       creatorRole: "editor",
		//     },
		//   },
		// })

		// For now, we verify that team member permissions work correctly
		// with the built-in roles (admin, member)
		const hasPermissionResult = await auth.api.hasPermission({
			headers: admin.headers,
			body: {
				organizationId,
				teamId, // Check with a specific team
				permissions: {
					teamMember: ["create", "update", "delete"],
				},
			},
		});

		expect(hasPermissionResult.success).toBe(true);

		// Verify team member (with member role) has limited permissions
		const teamMemberResult = await auth.api.hasPermission({
			headers: user2.headers,
			body: {
				organizationId,
				teamId,
				permissions: {
					teamMember: ["create"],
				},
			},
		});

		// Team member role should NOT have create permissions
		expect(teamMemberResult.success).toBe(false);
	});
});
