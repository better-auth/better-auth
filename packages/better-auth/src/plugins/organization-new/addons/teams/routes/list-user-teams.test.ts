import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { defineInstance, getOrganizationData } from "../../../test/utils";
import { teams } from "..";

describe("listUserTeams", async (it) => {
	// Use defaultTeam enabled so users are automatically added to teams when orgs are created
	const { signInWithTestUser, auth } = await defineInstance([
		organization({
			use: [teams({ defaultTeam: { enabled: true } })],
		}),
	]);

	it("should list teams that the user belongs to", async () => {
		const { headers } = await signInWithTestUser();

		// When an organization is created with defaultTeam enabled,
		// a default team is created and the user is added as a member
		const orgData = getOrganizationData();
		const createdOrg = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const result = await auth.api.listUserTeams({ headers });

		expect(result).toBeDefined();
		expect(result.teams).toBeDefined();
		expect(Array.isArray(result.teams)).toBe(true);
		expect(result.teams.length).toBeGreaterThanOrEqual(1);
		expect(result.total).toBeGreaterThanOrEqual(1);

		// Find the default team created for the organization
		const foundTeam = result.teams.find(
			(t) => t?.organizationId === createdOrg.id,
		);
		expect(foundTeam).toBeDefined();
		expect(foundTeam?.organizationId).toBe(createdOrg.id);
	});

	it("should return empty result when user has no teams", async () => {
		// Create a new user who hasn't created any organizations yet
		const { signInWithTestUser: signInNewUser, auth: newAuth } =
			await defineInstance([
				organization({
					use: [teams({ defaultTeam: { enabled: true } })],
				}),
			]);
		const { headers } = await signInNewUser();

		const result = await newAuth.api.listUserTeams({ headers });

		expect(result).toBeDefined();
		expect(result.teams).toBeDefined();
		expect(Array.isArray(result.teams)).toBe(true);
		expect(result.teams.length).toBe(0);
		expect(result.total).toBe(0);
	});

	it("should list teams across multiple organizations", async () => {
		const { headers } = await signInWithTestUser();

		// Create first organization - default team will be created with user as member
		const orgData1 = getOrganizationData();
		const org1 = await auth.api.createOrganization({
			body: orgData1,
			headers,
		});

		// Create second organization - default team will be created with user as member
		const orgData2 = getOrganizationData();
		const org2 = await auth.api.createOrganization({
			body: orgData2,
			headers,
		});

		const result = await auth.api.listUserTeams({ headers });

		expect(result).toBeDefined();
		expect(result.teams.length).toBeGreaterThanOrEqual(2);
		expect(result.total).toBeGreaterThanOrEqual(2);

		const foundTeam1 = result.teams.find((t) => t?.organizationId === org1.id);
		const foundTeam2 = result.teams.find((t) => t?.organizationId === org2.id);

		expect(foundTeam1).toBeDefined();
		expect(foundTeam1?.organizationId).toBe(org1.id);

		expect(foundTeam2).toBeDefined();
		expect(foundTeam2?.organizationId).toBe(org2.id);
	});

	it("should require authentication", async () => {
		try {
			await auth.api.listUserTeams({ headers: {} });
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.status).toBe("UNAUTHORIZED");
		}
	});
});

describe("listUserTeams pagination", async (it) => {
	const { signInWithTestUser, auth } = await defineInstance([
		organization({
			use: [teams({ defaultTeam: { enabled: true } })],
		}),
	]);
	const { headers } = await signInWithTestUser();

	it("should create multiple organizations for pagination testing", async () => {
		// Create 5 organizations, each with a default team
		for (let i = 0; i < 5; i++) {
			const orgData = getOrganizationData();
			await auth.api.createOrganization({
				body: { ...orgData, name: `Org ${i + 1}` },
				headers,
			});
		}
	});

	it("should support pagination with limit and offset", async () => {
		const result = await auth.api.listUserTeams({
			headers,
			query: { limit: 2, offset: 0 },
		});

		expect(result.teams.length).toBe(2);
		expect(result.total).toBeGreaterThanOrEqual(5);

		const secondPage = await auth.api.listUserTeams({
			headers,
			query: { limit: 2, offset: 2 },
		});

		expect(secondPage.teams.length).toBe(2);
		expect(secondPage.teams[0]?.id).not.toBe(result.teams[0]?.id);
	});

	it("should return correct total regardless of limit", async () => {
		const result1 = await auth.api.listUserTeams({
			headers,
			query: { limit: 1 },
		});

		const result2 = await auth.api.listUserTeams({
			headers,
			query: { limit: 10 },
		});

		expect(result1.total).toBe(result2.total);
		expect(result1.total).toBeGreaterThanOrEqual(5);
	});

	it("should return empty array when offset exceeds total", async () => {
		const result = await auth.api.listUserTeams({
			headers,
			query: { limit: 10, offset: 1000 },
		});

		expect(result.teams).toHaveLength(0);
		expect(result.total).toBeGreaterThanOrEqual(5);
	});
});
