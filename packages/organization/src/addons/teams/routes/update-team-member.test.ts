import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect } from "vitest";
import { organizationClient } from "../../../client";
import { organization } from "../../../organization";
import { getOrganizationData } from "../../../test/utils";
import { teams } from "..";
import { teamsClient } from "../client";

export const defineInstance = async <Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) => {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient({ use: [teamsClient()] })],
			},
		},
	);

	return instance;
};

describe("update team member", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;
	let memberUserId: string;

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

		const teamsResponse = await auth.api.listTeams({
			headers: ownerHeaders,
			query: { organizationId },
		});

		expect(teamsResponse.teams).toBeDefined();
		expect(teamsResponse.teams.length).toBeGreaterThan(0);
		defaultTeamId = teamsResponse.teams[0]!.id;

		// Create a second user and add them to the team
		const { user: secondUser } = await auth.api.signUpEmail({
			body: {
				email: `second-user-${Date.now()}@example.com`,
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

		memberUserId = secondUser.id;
	});

	it("should return error when trying to update non-existent team member", async () => {
		const nonExistentUserId = "non-existent-user-id";

		try {
			await auth.api.updateTeamMember({
				headers: ownerHeaders,
				body: {
					teamId: defaultTeamId,
					userId: nonExistentUserId,
					data: {},
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("USER_IS_NOT_A_MEMBER_OF_THE_TEAM");
		}
	});

	it("should return error when user is not authorized", async () => {
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

		// Try to update team member as the regular member (should fail due to lack of permission)
		try {
			await auth.api.updateTeamMember({
				headers: memberHeaders,
				body: {
					teamId: defaultTeamId,
					userId: memberUserId,
					data: {},
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe(
				"YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM_MEMBER",
			);
		}
	});
});

describe("update team member with additional fields", async (it) => {
	const plugin = organization({
		use: [
			teams({
				schema: {
					teamMember: {
						additionalFields: {
							department: {
								type: "string",
								required: false,
							},
							isLead: {
								type: "boolean",
								required: false,
							},
						},
					},
				},
			}),
		],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;
	let memberUserId: string;

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

	it("should add team member with additional fields", async () => {
		const { user: newUser } = await auth.api.signUpEmail({
			body: {
				email: `additional-fields-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Additional Fields User",
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

		const result = await auth.api.addTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: newUser.id,
				department: "Engineering",
				isLead: false,
			},
		});

		expect(result).toBeDefined();
		expect(result.userId).toBe(newUser.id);
		expect((result as any).department).toBe("Engineering");
		expect((result as any).isLead).toBe(false);

		memberUserId = newUser.id;
	});

	it("should update team member additional fields", async () => {
		const result = await auth.api.updateTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: memberUserId,
				data: {
					department: "Marketing",
					isLead: true,
				},
			},
		});

		expect(result).toBeDefined();
		expect((result as any).department).toBe("Marketing");
		expect((result as any).isLead).toBe(true);
	});

	it("should list team members with additional fields", async () => {
		const result = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: {
				teamId: defaultTeamId,
			},
		});

		expect(result.members).toBeDefined();
		const member = result.members.find((m: any) => m.userId === memberUserId);
		expect(member).toBeDefined();
		expect((member as any).department).toBe("Marketing");
		expect((member as any).isLead).toBe(true);
	});
});

describe("update team member hooks", async (it) => {
	let beforeHookCalled = false;
	let afterHookCalled = false;
	let beforeHookData: any = null;
	let afterHookData: any = null;

	const plugin = organization({
		use: [
			teams({
				schema: {
					teamMember: {
						additionalFields: {
							department: {
								type: "string",
								required: false,
							},
						},
					},
				},
				hooks: {
					beforeUpdateTeamMember: async (data) => {
						beforeHookCalled = true;
						beforeHookData = data;
					},
					afterUpdateTeamMember: async (data) => {
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
	let memberUserId: string;

	it("should setup organization and team member", async () => {
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
				department: "Engineering",
			},
		});

		memberUserId = newUser.id;

		// Reset hook flags
		beforeHookCalled = false;
		afterHookCalled = false;
		beforeHookData = null;
		afterHookData = null;
	});

	it("should call before and after hooks when updating a team member", async () => {
		await auth.api.updateTeamMember({
			headers: ownerHeaders,
			body: {
				teamId: defaultTeamId,
				userId: memberUserId,
				data: {
					department: "Sales",
				},
			},
		});

		expect(beforeHookCalled).toBe(true);
		expect(afterHookCalled).toBe(true);
		expect(beforeHookData?.teamMember?.userId).toBe(memberUserId);
		expect(beforeHookData?.updates?.department).toBe("Sales");
		expect(beforeHookData?.team?.id).toBe(defaultTeamId);
		expect(beforeHookData?.organization?.id).toBe(organizationId);
		expect(afterHookData?.teamMember?.userId).toBe(memberUserId);
		expect((afterHookData?.teamMember as any)?.department).toBe("Sales");
	});
});
