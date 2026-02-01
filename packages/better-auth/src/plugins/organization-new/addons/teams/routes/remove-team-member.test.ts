import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { defineInstance, getOrganizationData } from "../../../test/utils";
import { teams } from "..";

describe("remove team member", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers: ownerHeaders, user: ownerUser } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;
	let secondUserId: string;

	it("should create an organization with default team and add a member", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: ownerHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		expect(org).toBeDefined();
		expect(org.id).toBeDefined();
		organizationId = org.id;

		// The default team is automatically created, find it
		const teamsResponse = await auth.api.listTeams({
			headers: ownerHeaders,
			query: {
				organizationId,
			},
		});

		expect(teamsResponse.teams).toBeDefined();
		expect(teamsResponse.teams.length).toBeGreaterThan(0);
		defaultTeamId = teamsResponse.teams[0]!.id;

		// Create a second user and add them to the org and team
		const { user: secondUser } = await auth.api.signUpEmail({
			body: {
				email: `second-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Second User",
			},
		});
		secondUserId = secondUser.id;

		// Add to organization
		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: secondUserId,
				role: "member",
				organizationId,
			},
		});

		// Add to team
		await auth.api.addTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: secondUserId,
			},
		});

		// Verify they are a team member
		const teamMembers = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: { teamId: defaultTeamId },
		});
		const memberExists = teamMembers.members.some(
			(m: any) => m.userId === secondUserId,
		);
		expect(memberExists).toBe(true);
	});

	it("should remove a member from a team", async () => {
		const result = await auth.api.removeTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: secondUserId,
			},
		});

		expect(result.message).toBe("Team member removed successfully.");

		// Verify they are no longer a team member
		const teamMembers = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: { teamId: defaultTeamId },
		});
		const memberExists = teamMembers.members.some(
			(m: any) => m.userId === secondUserId,
		);
		expect(memberExists).toBe(false);
	});

	it("should return error when trying to remove a non-team member", async () => {
		// Create a user who is an org member but not a team member
		const { user: nonTeamUser } = await auth.api.signUpEmail({
			body: {
				email: `non-team-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Non Team User",
			},
		});

		// Add to organization only
		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: nonTeamUser.id,
				role: "member",
				organizationId,
			},
		});

		try {
			await auth.api.removeTeamMember({
				headers: ownerHeaders,
				body: {
					teamId: defaultTeamId,
					userId: nonTeamUser.id,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("USER_IS_NOT_A_MEMBER_OF_THE_TEAM");
		}
	});

	it("should return error when trying to remove from non-existent team", async () => {
		try {
			await auth.api.removeTeamMember({
				headers: ownerHeaders,
				body: {
					teamId: "non-existent-team-id",
					userId: secondUserId,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("TEAM_NOT_FOUND");
		}
	});

	it("should return error when trying to remove non-org member", async () => {
		// Create a user who is not an org member
		const { user: nonOrgUser } = await auth.api.signUpEmail({
			body: {
				email: `non-org-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Non Org User",
			},
		});

		try {
			await auth.api.removeTeamMember({
				headers: ownerHeaders,
				body: {
					teamId: defaultTeamId,
					userId: nonOrgUser.id,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION");
		}
	});
});

describe("remove team member permissions", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;

	it("should create an organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: ownerHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});
		organizationId = org.id;

		const teamsResponse = await auth.api.listTeams({
			headers: ownerHeaders,
			query: { organizationId },
		});
		defaultTeamId = teamsResponse.teams[0]!.id;
	});

	it("should not allow users without permission to remove team members", async () => {
		// Create and sign in as a regular member
		const regularMember = await auth.api.signUpEmail({
			body: {
				email: `regular-member-${Date.now()}@example.com`,
				password: "password123",
				name: "Regular Member",
			},
			returnHeaders: true,
		});
		const memberHeaders = {
			cookie: regularMember.headers.getSetCookie()[0]!,
		};

		// Add this user to the organization as a member
		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: regularMember.response.user.id,
				role: "member",
				organizationId,
			},
		});

		// Set active organization for this member
		await auth.api.setActiveOrganization({
			headers: memberHeaders,
			body: { organizationId },
		});

		// Create another user and add them to the team
		const { user: anotherUser } = await auth.api.signUpEmail({
			body: {
				email: `another-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Another User",
			},
		});

		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: anotherUser.id,
				role: "member",
				organizationId,
			},
		});

		await auth.api.addTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: anotherUser.id,
			},
		});

		// Try to remove user as the regular member (should fail)
		try {
			await auth.api.removeTeamMember({
				headers: memberHeaders,
				body: {
					teamId: defaultTeamId,
					userId: anotherUser.id,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe(
				"YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER",
			);
		}
	});
});

describe("remove team member hooks", async (it) => {
	let beforeHookCalled = false;
	let afterHookCalled = false;
	let beforeHookData: any = null;
	let afterHookData: any = null;

	const plugin = organization({
		use: [
			teams({
				hooks: {
					beforeRemoveTeamMember: async (data) => {
						beforeHookCalled = true;
						beforeHookData = data;
					},
					afterRemoveTeamMember: async (data) => {
						afterHookCalled = true;
						afterHookData = data;
					},
				},
			}),
		],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;
	let userToRemoveId: string;

	it("should create an organization with a member to remove", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: ownerHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});
		organizationId = org.id;

		const teamsResponse = await auth.api.listTeams({
			headers: ownerHeaders,
			query: { organizationId },
		});
		defaultTeamId = teamsResponse.teams[0]!.id;

		// Create a user to remove
		const { user: userToRemove } = await auth.api.signUpEmail({
			body: {
				email: `hook-test-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Hook Test User",
			},
		});
		userToRemoveId = userToRemove.id;

		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: userToRemoveId,
				role: "member",
				organizationId,
			},
		});

		await auth.api.addTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: userToRemoveId,
			},
		});

		// Reset hook flags
		beforeHookCalled = false;
		afterHookCalled = false;
		beforeHookData = null;
		afterHookData = null;
	});

	it("should call before and after hooks when removing a team member", async () => {
		await auth.api.removeTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: userToRemoveId,
			},
		});

		expect(beforeHookCalled).toBe(true);
		expect(afterHookCalled).toBe(true);
		expect(beforeHookData?.teamMember?.userId).toBe(userToRemoveId);
		expect(beforeHookData?.team?.id).toBe(defaultTeamId);
		expect(beforeHookData?.user?.id).toBe(userToRemoveId);
		expect(beforeHookData?.organization?.id).toBe(organizationId);
		expect(afterHookData?.teamMember?.userId).toBe(userToRemoveId);
		expect(afterHookData?.team?.id).toBe(defaultTeamId);
	});
});
