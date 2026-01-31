import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { defineInstance, getOrganizationData } from "../../../test/utils";
import { teams } from "..";

describe("update team", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let organizationId: string;
	let teamId: string;

	it("should create an organization and a team", async () => {
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

		const team = await auth.api.createTeam({
			headers,
			body: {
				name: "Development Team",
				organizationId,
			},
		});

		expect(team).toBeDefined();
		expect(team.id).toBeDefined();
		expect(team.name).toBe("Development Team");
		expect(team.organizationId).toBe(organizationId);
		teamId = team.id;
	});

	it("should update a team", async () => {
		expect(teamId).toBeDefined();

		const updatedTeam = await auth.api.updateTeam({
			headers,
			body: {
				teamId,
				data: {
					name: "Updated Development Team",
				},
			},
		});

		expect(updatedTeam).toBeDefined();
		expect(updatedTeam?.name).toBe("Updated Development Team");
		expect(updatedTeam?.id).toBe(teamId);
	});

	it("should not update a team that does not exist", async () => {
		try {
			await auth.api.updateTeam({
				headers,
				body: {
					teamId: "non-existent-team-id",
					data: {
						name: "Should Fail",
					},
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("TEAM_NOT_FOUND");
		}
	});

	describe("update with additional fields", async (it) => {
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
		let teamIdWithFields: string;

		it("should create an organization and a team with additional fields", async () => {
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
					slug: orgData.slug,
				},
			});
			orgId = org.id;

			const team = await auth.api.createTeam({
				headers,
				body: {
					name: "Team with Description",
					organizationId: orgId,
					description: "Initial description",
				},
			});

			expect(team).toBeDefined();
			expect(team.id).toBeDefined();
			expect(team.description).toBe("Initial description");
			teamIdWithFields = team.id;
		});

		it("should update the team with additional fields", async () => {
			const updatedTeam = await auth.api.updateTeam({
				headers,
				body: {
					teamId: teamIdWithFields,
					data: {
						name: "Updated Team Name",
						description: "Updated description",
					},
				},
			});

			expect(updatedTeam).toBeDefined();
			expect(updatedTeam?.name).toBe("Updated Team Name");
			expect(updatedTeam?.description).toBe("Updated description");
		});
	});
});
