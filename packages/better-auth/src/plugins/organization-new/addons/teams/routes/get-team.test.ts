import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { defineInstance, getOrganizationData } from "../../../test/utils";
import { teams } from "..";

describe("get team", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;
	let defaultTeamName: string;

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
		defaultTeamName = teamsResponse.teams[0]!.name;
	});

	it("should get team by teamId (uses active organization from session)", async () => {
		const result = await auth.api.getTeam({
			headers,
			query: {
				teamId: defaultTeamId,
			},
		});

		expect(result).toBeDefined();
		expect(result.id).toBe(defaultTeamId);
		expect(result.name).toBe(defaultTeamName);
		expect(result.organizationId).toBe(organizationId);
		expect(result.createdAt).toBeDefined();
	});

	it("should get team with explicit organizationId", async () => {
		const result = await auth.api.getTeam({
			headers,
			query: {
				teamId: defaultTeamId,
				organizationId,
			},
		});

		expect(result).toBeDefined();
		expect(result.id).toBe(defaultTeamId);
		expect(result.name).toBe(defaultTeamName);
		expect(result.organizationId).toBe(organizationId);
	});

	it("should return team with all expected properties", async () => {
		const result = await auth.api.getTeam({
			headers,
			query: {
				teamId: defaultTeamId,
			},
		});

		expect(result).toBeDefined();
		expect(result.id).toBeDefined();
		expect(result.name).toBeDefined();
		expect(result.organizationId).toBeDefined();
		expect(result.createdAt).toBeDefined();
	});

	it("should return error when team does not exist", async () => {
		try {
			await auth.api.getTeam({
				headers,
				query: {
					teamId: "non-existent-team-id",
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("TEAM_NOT_FOUND");
		}
	});

	it("should not allow non-members to get team", async () => {
		// Sign up a second user who is not a member of the organization
		const otherUser = await auth.api.signUpEmail({
			body: {
				email: `other-get-team-user-${Date.now()}@example.com`,
				password: "password123",
				name: "Other User",
			},
			returnHeaders: true,
		});
		const otherHeaders = {
			cookie: otherUser.headers.getSetCookie()[0]!,
		};

		try {
			await auth.api.getTeam({
				headers: otherHeaders,
				query: {
					teamId: defaultTeamId,
					organizationId,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe(
				"YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
			);
		}
	});

	it("should return error when user has no active organization and no organizationId provided", async () => {
		// Sign up a user who has no active organization
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `no-org-user-${Date.now()}@example.com`,
				password: "password123",
				name: "No Org User",
			},
			returnHeaders: true,
		});
		const newHeaders = {
			cookie: newUser.headers.getSetCookie()[0]!,
		};

		try {
			await auth.api.getTeam({
				headers: newHeaders,
				query: {
					teamId: defaultTeamId,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("NO_ACTIVE_ORGANIZATION");
		}
	});
});

describe("get team with slugs", async (it) => {
	const plugin = organization({
		use: [
			teams({
				enableSlugs: true,
				defaultTeamIdField: "slug",
			}),
		],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let organizationId: string;
	let teamSlug: string;
	let teamId: string;

	it("should create an organization and team with slug", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		expect(org).toBeDefined();
		organizationId = org.id;

		// Create a team with a custom slug
		const team = await auth.api.createTeam({
			headers,
			body: {
				name: "Slugged Team",
				organizationId,
				slug: "slugged-team",
			},
		});

		expect(team).toBeDefined();
		expect(team.slug).toBe("slugged-team");
		teamSlug = team.slug!;
		teamId = team.id;
	});

	it("should get team by slug", async () => {
		const result = await auth.api.getTeam({
			headers,
			query: {
				teamId: teamSlug,
			},
		});

		expect(result).toBeDefined();
		expect(result.slug).toBe(teamSlug);
		expect(result.id).toBe(teamId);
		expect(result.organizationId).toBeDefined();
	});

	it("should get team by slug with explicit organizationId", async () => {
		const result = await auth.api.getTeam({
			headers,
			query: {
				teamId: teamSlug,
				organizationId,
			},
		});

		expect(result).toBeDefined();
		expect(result.slug).toBe(teamSlug);
		expect(result.id).toBe(teamId);
	});
});

describe("get team with additional fields", async (it) => {
	const plugin = organization({
		use: [
			teams({
				schema: {
					team: {
						additionalFields: {
							description: {
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

	it("should create an organization and custom team", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});
		orgId = org.id;

		// Create a custom team with additional fields
		const team = await auth.api.createTeam({
			headers,
			body: {
				name: "Custom Team",
				organizationId: orgId,
				description: "A custom team with description",
			},
		});

		expect(team).toBeDefined();
		teamId = team.id;
	});

	it("should get team with additional fields", async () => {
		const result = await auth.api.getTeam({
			headers,
			query: {
				teamId,
			},
		});

		expect(result).toBeDefined();
		expect(result.id).toBe(teamId);
		expect(result.name).toBe("Custom Team");
		expect(result.description).toBe("A custom team with description");
	});
});

describe("get team from different organization", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let org1Id: string;
	let org2Id: string;
	let team1Id: string;
	let team2Id: string;

	it("should create two organizations with teams", async () => {
		const orgData1 = getOrganizationData();
		const org1 = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData1.name,
				slug: orgData1.slug,
			},
		});
		org1Id = org1.id;

		const teamsResponse1 = await auth.api.listTeams({
			headers,
			query: { organizationId: org1Id },
		});
		team1Id = teamsResponse1.teams[0]!.id;

		const orgData2 = getOrganizationData();
		const org2 = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData2.name,
				slug: orgData2.slug,
			},
		});
		org2Id = org2.id;

		const teamsResponse2 = await auth.api.listTeams({
			headers,
			query: { organizationId: org2Id },
		});
		team2Id = teamsResponse2.teams[0]!.id;
	});

	it("should get team from org1 with explicit organizationId", async () => {
		const result = await auth.api.getTeam({
			headers,
			query: {
				teamId: team1Id,
				organizationId: org1Id,
			},
		});

		expect(result).toBeDefined();
		expect(result.id).toBe(team1Id);
		expect(result.organizationId).toBe(org1Id);
	});

	it("should get team from org2 with explicit organizationId", async () => {
		const result = await auth.api.getTeam({
			headers,
			query: {
				teamId: team2Id,
				organizationId: org2Id,
			},
		});

		expect(result).toBeDefined();
		expect(result.id).toBe(team2Id);
		expect(result.organizationId).toBe(org2Id);
	});

	it("should not find team1 in org2", async () => {
		try {
			await auth.api.getTeam({
				headers,
				query: {
					teamId: team1Id,
					organizationId: org2Id,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("TEAM_NOT_FOUND");
		}
	});
});
