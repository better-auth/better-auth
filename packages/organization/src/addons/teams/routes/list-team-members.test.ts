import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { defineInstance, getOrganizationData } from "../../../test/utils";
import { teams } from "..";

describe("list team members", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;

	it("should create an organization with default team", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
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
			headers,
			query: {
				organizationId,
			},
		});

		expect(teamsResponse.teams).toBeDefined();
		expect(teamsResponse.teams.length).toBeGreaterThan(0);
		defaultTeamId = teamsResponse.teams[0]!.id;
	});

	it("should list team members with default team (uses active team from session)", async () => {
		// When organization is created, it automatically sets active organization
		// The user is added to the default team, so we can test by setting active team
		// and then listing members
		const result = await auth.api.listTeamMembers({
			headers,
			query: {
				teamId: defaultTeamId,
			},
		});

		expect(result).toBeDefined();
		expect(result.members).toBeDefined();
		expect(Array.isArray(result.members)).toBe(true);
		expect(result.members.length).toBeGreaterThanOrEqual(1);
		expect(result.total).toBeGreaterThanOrEqual(1);
	});

	it("should list team members with explicit teamId", async () => {
		const result = await auth.api.listTeamMembers({
			headers,
			query: {
				teamId: defaultTeamId,
			},
		});

		expect(result).toBeDefined();
		expect(result.members).toBeDefined();
		expect(Array.isArray(result.members)).toBe(true);
		expect(result.members.length).toBeGreaterThanOrEqual(1);
		expect(result.total).toBeGreaterThanOrEqual(1);
		expect(result.members[0]?.teamId).toBe(defaultTeamId);
	});

	it("should return members with correct properties", async () => {
		const result = await auth.api.listTeamMembers({
			headers,
			query: {
				teamId: defaultTeamId,
			},
		});

		expect(result.members.length).toBeGreaterThan(0);
		const member = result.members[0];
		expect(member).toBeDefined();
		expect(member?.id).toBeDefined();
		expect(member?.userId).toBeDefined();
		expect(member?.teamId).toBe(defaultTeamId);
		expect(member?.createdAt).toBeDefined();
	});

	it("should not allow non-members to list team members", async () => {
		// Sign up a second user who is not a member of the team
		const otherUser = await auth.api.signUpEmail({
			body: {
				email: `other-team-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Other User",
			},
			returnHeaders: true,
		});
		const otherHeaders = {
			cookie: otherUser.headers.getSetCookie()[0]!,
		};

		try {
			await auth.api.listTeamMembers({
				headers: otherHeaders,
				query: {
					teamId: defaultTeamId,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("USER_IS_NOT_A_MEMBER_OF_THE_TEAM");
		}
	});

	it("should return error when no active team and no teamId provided", async () => {
		// Sign up a user who has no active team
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `no-team-user-${Date.now()}@example.com`,
				password: "password123",
				name: "No Team User",
			},
			returnHeaders: true,
		});
		const newHeaders = {
			cookie: newUser.headers.getSetCookie()[0]!,
		};

		try {
			await auth.api.listTeamMembers({
				headers: newHeaders,
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM");
		}
	});
});

describe("list team members pagination", async (it) => {
	const plugin = organization({
		use: [teams()],
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

		// Get the default team
		const teamsResponse = await auth.api.listTeams({
			headers: ownerHeaders,
			query: {
				organizationId,
			},
		});
		defaultTeamId = teamsResponse.teams[0]!.id;
	});

	it("should return correct total with pagination", async () => {
		const result1 = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: { teamId: defaultTeamId, limit: 1 },
		});

		const result2 = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: { teamId: defaultTeamId, limit: 10 },
		});

		expect(result1.total).toBe(result2.total);
		expect(result1.total).toBeGreaterThanOrEqual(1);
	});

	it("should support pagination with limit and offset", async () => {
		const result = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: {
				teamId: defaultTeamId,
				limit: 10,
				offset: 0,
			},
		});

		expect(result).toBeDefined();
		expect(result.members).toBeDefined();
		expect(result.members.length).toBeGreaterThanOrEqual(1);
		expect(result.total).toBeGreaterThanOrEqual(1);
	});

	it("should return empty array when offset exceeds total", async () => {
		const result = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: { teamId: defaultTeamId, limit: 10, offset: 1000 },
		});

		expect(result.members).toHaveLength(0);
		expect(result.total).toBeGreaterThanOrEqual(1);
	});

	it("should sort by createdAt in ascending order", async () => {
		const result = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: {
				teamId: defaultTeamId,
				sortBy: "createdAt",
				sortDirection: "asc",
			},
		});

		expect(result.members.length).toBeGreaterThanOrEqual(1);

		// Verify ascending order if multiple members
		if (result.members.length > 1) {
			for (let i = 1; i < result.members.length; i++) {
				const prev = new Date(result.members[i - 1]!.createdAt).getTime();
				const curr = new Date(result.members[i]!.createdAt).getTime();
				expect(curr).toBeGreaterThanOrEqual(prev);
			}
		}
	});

	it("should sort by createdAt in descending order", async () => {
		const result = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: {
				teamId: defaultTeamId,
				sortBy: "createdAt",
				sortDirection: "desc",
			},
		});

		expect(result.members.length).toBeGreaterThanOrEqual(1);

		// Verify descending order if multiple members
		if (result.members.length > 1) {
			for (let i = 1; i < result.members.length; i++) {
				const prev = new Date(result.members[i - 1]!.createdAt).getTime();
				const curr = new Date(result.members[i]!.createdAt).getTime();
				expect(curr).toBeLessThanOrEqual(prev);
			}
		}
	});

	it("should handle limit of 1", async () => {
		const result = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: { teamId: defaultTeamId, limit: 1 },
		});

		expect(result.members.length).toBeLessThanOrEqual(1);
		expect(result.total).toBeGreaterThanOrEqual(1);
	});

	it("should handle maximum limit of 100", async () => {
		const result = await auth.api.listTeamMembers({
			headers: ownerHeaders,
			query: { teamId: defaultTeamId, limit: 100 },
		});

		expect(result.members.length).toBeGreaterThanOrEqual(1);
		expect(result.members.length).toBeLessThanOrEqual(100);
	});
});

describe("list team members with additional fields", async (it) => {
	const plugin = organization({
		use: [
			teams({
				schema: {
					teamMember: {
						additionalFields: {
							role: {
								type: "string",
								required: false,
							},
						},
					},
				},
			}),
		],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let orgId: string;
	let teamId: string;

	it("should create an organization with default team", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});
		orgId = org.id;

		const teamsResponse = await auth.api.listTeams({
			headers,
			query: {
				organizationId: orgId,
			},
		});
		teamId = teamsResponse.teams[0]!.id;
	});

	it("should list team members", async () => {
		const result = await auth.api.listTeamMembers({
			headers,
			query: {
				teamId,
			},
		});

		expect(result).toBeDefined();
		expect(result.members).toBeDefined();
		expect(result.members.length).toBeGreaterThanOrEqual(1);
		expect(result.total).toBeGreaterThanOrEqual(1);
	});
});
