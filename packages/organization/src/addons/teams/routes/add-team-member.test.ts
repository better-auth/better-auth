import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { defineInstance, getOrganizationData } from "../../../test/utils";
import { teams } from "..";

describe("add team member", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers: ownerHeaders, user: ownerUser } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;

	it("should create an organization with default team", async () => {
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
	});

	it("should add a member to a team", async () => {
		// Create a second user
		const { user: secondUser } = await auth.api.signUpEmail({
			body: {
				email: `second-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Second User",
			},
		});

		// First add the user to the organization as a member
		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: secondUser.id,
				role: "member",
				organizationId,
			},
		});

		// Now add them to the team
		const result = await auth.api.addTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: secondUser.id,
			},
		});

		expect(result).toBeDefined();
		expect(result.userId).toBe(secondUser.id);
		expect(result.teamId).toBe(defaultTeamId);
		expect(result.id).toBeDefined();
	});

	it("should not allow non-organization members to be added to team", async () => {
		// Create a user who is not an organization member
		const { user: nonOrgUser } = await auth.api.signUpEmail({
			body: {
				email: `non-org-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Non Org User",
			},
		});

		try {
			await auth.api.addTeamMember({
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

	it("should not allow adding a user who is already a team member", async () => {
		// Try to add the owner again (who is already a team member)
		try {
			await auth.api.addTeamMember({
				headers: ownerHeaders,
				body: {
					teamId: defaultTeamId,
					userId: ownerUser.id,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("USER_IS_ALREADY_A_MEMBER_OF_THIS_TEAM");
		}
	});

	it("should not allow users without permission to add team members", async () => {
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

		// Create another user to try to add
		const { user: anotherUser } = await auth.api.signUpEmail({
			body: {
				email: `another-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Another User",
			},
		});

		// Add this another user to the organization first
		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: anotherUser.id,
				role: "member",
				organizationId,
			},
		});

		// Try to add user as the regular member (should fail due to lack of permission)
		try {
			await auth.api.addTeamMember({
				headers: memberHeaders,
				body: {
					teamId: defaultTeamId,
					userId: anotherUser.id,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe(
				"YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER",
			);
		}
	});

	it("should return error for non-existent team", async () => {
		// Create a user who is an organization member
		const { user: orgMember } = await auth.api.signUpEmail({
			body: {
				email: `org-member-${Date.now()}@example.com`,
				password: "password123",
				name: "Org Member",
			},
		});

		// Add to organization
		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: orgMember.id,
				role: "member",
				organizationId,
			},
		});

		try {
			await auth.api.addTeamMember({
				headers: ownerHeaders,
				body: {
					teamId: "non-existent-team-id",
					userId: orgMember.id,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("TEAM_NOT_FOUND");
		}
	});
});

describe("add team member with maximum members limit", async (it) => {
	const plugin = organization({
		use: [
			teams({
				maximumMembersPerTeam: 2,
			}),
		],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;

	it("should create an organization with default team", async () => {
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

	it("should not allow adding more members than maximum", async () => {
		// The owner is already a member (1/2), add one more (2/2)
		const { user: secondUser } = await auth.api.signUpEmail({
			body: {
				email: `second-user-limit-${Date.now()}@example.com`,
				password: "password123",
				name: "Second User",
			},
		});

		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: secondUser.id,
				role: "member",
				organizationId,
			},
		});

		await auth.api.addTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: secondUser.id,
			},
		});

		// Now try to add a third user (should fail)
		const { user: thirdUser } = await auth.api.signUpEmail({
			body: {
				email: `third-user-limit-${Date.now()}@example.com`,
				password: "password123",
				name: "Third User",
			},
		});

		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: thirdUser.id,
				role: "member",
				organizationId,
			},
		});

		try {
			await auth.api.addTeamMember({
				headers: ownerHeaders,
				body: {
					teamId: defaultTeamId,
					userId: thirdUser.id,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("TEAM_MEMBER_LIMIT_REACHED");
		}
	});
});

describe("add team member hooks", async (it) => {
	let beforeHookCalled = false;
	let afterHookCalled = false;
	let beforeHookData: any = null;
	let afterHookData: any = null;

	const plugin = organization({
		use: [
			teams({
				hooks: {
					beforeAddTeamMember: async (data) => {
						beforeHookCalled = true;
						beforeHookData = data;
					},
					afterAddTeamMember: async (data) => {
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

	it("should create an organization with default team", async () => {
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

		// Reset hook flags (they may have been called during default team creation)
		beforeHookCalled = false;
		afterHookCalled = false;
		beforeHookData = null;
		afterHookData = null;
	});

	it("should call before and after hooks when adding a team member", async () => {
		const { user: newUser } = await auth.api.signUpEmail({
			body: {
				email: `hook-test-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Hook Test User",
			},
		});

		await auth.api.addMember({
			headers: ownerHeaders,
			body: {
				userId: newUser.id,
				role: "member",
				organizationId,
			},
		});

		await auth.api.addTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: newUser.id,
			},
		});

		expect(beforeHookCalled).toBe(true);
		expect(afterHookCalled).toBe(true);
		expect(beforeHookData?.teamMember?.userId).toBe(newUser.id);
		expect(beforeHookData?.team?.id).toBe(defaultTeamId);
		expect(beforeHookData?.user?.id).toBe(newUser.id);
		expect(beforeHookData?.organization?.id).toBe(organizationId);
		expect(afterHookData?.teamMember?.userId).toBe(newUser.id);
		expect(afterHookData?.team?.id).toBe(defaultTeamId);
	});
});
