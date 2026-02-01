import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { defineInstance, getOrganizationData } from "../../../test/utils";
import { teams } from "..";

describe("list organization teams", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let organizationId: string;

	it("should create an organization and multiple teams", async () => {
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

		const team1 = await auth.api.createTeam({
			headers,
			body: {
				name: "Development Team",
				organizationId,
			},
		});

		expect(team1).toBeDefined();
		expect(team1.id).toBeDefined();
		expect(team1.name).toBe("Development Team");

		const team2 = await auth.api.createTeam({
			headers,
			body: {
				name: "Marketing Team",
				organizationId,
			},
		});

		expect(team2).toBeDefined();
		expect(team2.id).toBeDefined();
		expect(team2.name).toBe("Marketing Team");
	});

	it("should list all teams in the organization", async () => {
		const result = await auth.api.listTeams({
			headers,
		});

		expect(result).toBeDefined();
		expect(result.teams).toBeDefined();
		expect(Array.isArray(result.teams)).toBe(true);
		expect(result.teams.length).toBeGreaterThanOrEqual(2);
		expect(result.total).toBeGreaterThanOrEqual(2);

		const teamNames = result.teams.map((team: any) => team.name);
		expect(teamNames).toContain("Development Team");
		expect(teamNames).toContain("Marketing Team");
	});

	it("should list teams with explicit organizationId", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: {
				organizationId,
			},
		});

		expect(result).toBeDefined();
		expect(result.teams).toBeDefined();
		expect(Array.isArray(result.teams)).toBe(true);
		expect(result.teams.length).toBeGreaterThanOrEqual(2);
		expect(result.total).toBeGreaterThanOrEqual(2);
	});

	it("should support pagination with limit and offset", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: {
				limit: 1,
				offset: 0,
			},
		});

		expect(result).toBeDefined();
		expect(result.teams).toBeDefined();
		expect(result.teams.length).toBe(1);
		expect(result.total).toBeGreaterThanOrEqual(2);

		const secondResult = await auth.api.listTeams({
			headers,
			query: {
				limit: 1,
				offset: 1,
			},
		});

		expect(secondResult.teams.length).toBe(1);
		expect(secondResult.teams[0]?.id).not.toBe(result.teams[0]?.id);
	});

	it("should support sorting by name", async () => {
		const resultAsc = await auth.api.listTeams({
			headers,
			query: {
				sortBy: "name",
				sortDirection: "asc",
			},
		});

		expect(resultAsc.teams.length).toBeGreaterThanOrEqual(2);

		const resultDesc = await auth.api.listTeams({
			headers,
			query: {
				sortBy: "name",
				sortDirection: "desc",
			},
		});

		expect(resultDesc.teams.length).toBeGreaterThanOrEqual(2);
		// First item in desc should be last in asc (or vice versa)
		expect(resultAsc.teams[0]?.name).not.toBe(resultDesc.teams[0]?.name);
	});

	it("should not allow non-members to list teams", async () => {
		// Sign up a second user who is not a member of the organization
		const otherUser = await auth.api.signUpEmail({
			body: {
				email: "other-user@example.com",
				password: "password123",
				name: "Other User",
			},
			returnHeaders: true,
		});
		const otherHeaders = {
			cookie: otherUser.headers.getSetCookie()[0]!,
		};

		try {
			await auth.api.listTeams({
				headers: otherHeaders,
				query: {
					organizationId,
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe(
				"YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION",
			);
		}
	});
});

describe("list teams pagination", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let organizationId: string;
	const teamNames = ["Alpha", "Beta", "Charlie", "Delta", "Echo"];

	it("should create an organization with multiple teams for pagination testing", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});
		organizationId = org.id;

		// Create 5 teams
		for (const name of teamNames) {
			await auth.api.createTeam({
				headers,
				body: {
					name: `${name} Team`,
					organizationId,
				},
			});
		}
	});

	it("should return correct total regardless of limit", async () => {
		const result1 = await auth.api.listTeams({
			headers,
			query: { limit: 2 },
		});

		const result2 = await auth.api.listTeams({
			headers,
			query: { limit: 10 },
		});

		expect(result1.total).toBe(result2.total);
		expect(result1.total).toBeGreaterThanOrEqual(5);
	});

	it("should paginate through all teams correctly", async () => {
		const allTeamIds: string[] = [];

		// Page 1
		const page1 = await auth.api.listTeams({
			headers,
			query: { limit: 2, offset: 0 },
		});
		expect(page1.teams.length).toBe(2);
		allTeamIds.push(...page1.teams.map((t: any) => t.id));

		// Page 2
		const page2 = await auth.api.listTeams({
			headers,
			query: { limit: 2, offset: 2 },
		});
		expect(page2.teams.length).toBe(2);
		allTeamIds.push(...page2.teams.map((t: any) => t.id));

		// Page 3
		const page3 = await auth.api.listTeams({
			headers,
			query: { limit: 2, offset: 4 },
		});
		expect(page3.teams.length).toBeGreaterThanOrEqual(1);
		allTeamIds.push(...page3.teams.map((t: any) => t.id));

		// All IDs should be unique (no duplicates across pages)
		const uniqueIds = new Set(allTeamIds);
		expect(uniqueIds.size).toBe(allTeamIds.length);
	});

	it("should return empty array when offset exceeds total", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: { limit: 10, offset: 1000 },
		});

		expect(result.teams).toHaveLength(0);
		expect(result.total).toBeGreaterThanOrEqual(5);
	});

	it("should sort by createdAt in ascending order", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: { sortBy: "createdAt", sortDirection: "asc" },
		});

		expect(result.teams.length).toBeGreaterThanOrEqual(2);

		// Verify ascending order
		for (let i = 1; i < result.teams.length; i++) {
			const prev = new Date(result.teams[i - 1]!.createdAt).getTime();
			const curr = new Date(result.teams[i]!.createdAt).getTime();
			expect(curr).toBeGreaterThanOrEqual(prev);
		}
	});

	it("should sort by createdAt in descending order", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: { sortBy: "createdAt", sortDirection: "desc" },
		});

		expect(result.teams.length).toBeGreaterThanOrEqual(2);

		// Verify descending order
		for (let i = 1; i < result.teams.length; i++) {
			const prev = new Date(result.teams[i - 1]!.createdAt).getTime();
			const curr = new Date(result.teams[i]!.createdAt).getTime();
			expect(curr).toBeLessThanOrEqual(prev);
		}
	});

	it("should sort by name in ascending order", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: { sortBy: "name", sortDirection: "asc" },
		});

		expect(result.teams.length).toBeGreaterThanOrEqual(2);

		// Verify alphabetical ascending order
		for (let i = 1; i < result.teams.length; i++) {
			const prev = result.teams[i - 1]!.name;
			const curr = result.teams[i]!.name;
			expect(curr.localeCompare(prev)).toBeGreaterThanOrEqual(0);
		}
	});

	it("should sort by name in descending order", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: { sortBy: "name", sortDirection: "desc" },
		});

		expect(result.teams.length).toBeGreaterThanOrEqual(2);

		// Verify alphabetical descending order
		for (let i = 1; i < result.teams.length; i++) {
			const prev = result.teams[i - 1]!.name;
			const curr = result.teams[i]!.name;
			expect(curr.localeCompare(prev)).toBeLessThanOrEqual(0);
		}
	});

	it("should combine pagination with sorting", async () => {
		// Get first 2 teams sorted by name ascending
		const page1 = await auth.api.listTeams({
			headers,
			query: { limit: 2, offset: 0, sortBy: "name", sortDirection: "asc" },
		});

		// Get next 2 teams sorted by name ascending
		const page2 = await auth.api.listTeams({
			headers,
			query: { limit: 2, offset: 2, sortBy: "name", sortDirection: "asc" },
		});

		expect(page1.teams.length).toBe(2);
		expect(page2.teams.length).toBe(2);

		// Last team in page1 should come before first team in page2 alphabetically
		const lastPage1 = page1.teams[1]!.name;
		const firstPage2 = page2.teams[0]!.name;
		expect(lastPage1.localeCompare(firstPage2)).toBeLessThanOrEqual(0);
	});

	it("should handle limit of 1", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: { limit: 1 },
		});

		expect(result.teams.length).toBe(1);
		expect(result.total).toBeGreaterThanOrEqual(5);
	});

	it("should handle maximum limit of 100", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: { limit: 100 },
		});

		expect(result.teams.length).toBeGreaterThanOrEqual(5);
		expect(result.teams.length).toBeLessThanOrEqual(100);
	});
});

describe("list teams with additional fields", async (it) => {
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

	it("should create an organization and teams with additional fields", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});
		orgId = org.id;

		await auth.api.createTeam({
			headers,
			body: {
				name: "Team with Description",
				organizationId: orgId,
				description: "A team for testing",
			},
		});

		await auth.api.createTeam({
			headers,
			body: {
				name: "Team without Description",
				organizationId: orgId,
			},
		});
	});

	it("should list teams with additional fields included", async () => {
		const result = await auth.api.listTeams({
			headers,
			query: {
				organizationId: orgId,
			},
		});

		expect(result).toBeDefined();
		expect(result.teams).toBeDefined();
		expect(result.teams.length).toBeGreaterThanOrEqual(2);
		expect(result.total).toBeGreaterThanOrEqual(2);

		const teamWithDesc = result.teams.find(
			(t: any) => t.name === "Team with Description",
		);
		expect(teamWithDesc).toBeDefined();
		expect(teamWithDesc?.description).toBe("A team for testing");
	});
});
