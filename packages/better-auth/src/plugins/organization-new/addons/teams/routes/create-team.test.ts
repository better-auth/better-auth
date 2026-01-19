import { describe, expect, expectTypeOf } from "vitest";
import { organization } from "../../../organization";
import { getOrganizationData } from "../../../test/utils";
import type { OrganizationOptions } from "../../../types";
import { teams } from "..";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { defineInstance, getTeamData } from "../tests/utils";
import type { TeamsOptions } from "../types";

describe("teams", async (it) => {
	const { signInWithTestUser, auth } = await defineInstance([
		organization({ use: [teams()] }),
	]);

	it("should create a team", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const organization = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const teamData = await getTeamData({ organizationId: organization.id });
		const team = await auth.api.createTeam({
			body: teamData,
			headers,
		});

		expect(team?.id).toBeDefined();
		expect(team?.name).toBeDefined();
		expect((team as any)?.slug).toBeUndefined();
		expect(team?.organizationId).toBeDefined();
		expectTypeOf(team).toEqualTypeOf<{
			id: string;
			name: string;
			organizationId: string;
			createdAt: Date;
			updatedAt?: Date | undefined;
		}>();
	});

	describe("slug support", async (it) => {
		const { signInWithTestUser, auth } = await defineInstance([
			organization({
				use: [teams({ enableSlugs: true })],
			}),
		]);
		const { headers } = await signInWithTestUser();

		it("should create a team", async () => {
			const orgData = getOrganizationData();
			const organization = await auth.api.createOrganization({
				body: orgData,
				headers,
			});

			const teamData = await getTeamData({ organizationId: organization.id });
			const team = await auth.api.createTeam({
				body: { ...teamData, slug: "test-team" },
				headers,
			});

			expect(team?.id).toBeDefined();
			expect(team?.name).toBeDefined();
			expect(team?.slug).toBe("test-team");
			expect(team?.organizationId).toBeDefined();
			expectTypeOf(team).toEqualTypeOf<{
				id: string;
				name: string;
				organizationId: string;
				createdAt: Date;
				updatedAt?: Date | undefined;
				slug: string;
			}>();
		});
	});

	describe("default team", async (it) => {
		const teamOptions = {
			defaultTeam: { enabled: true },
		} satisfies TeamsOptions;

		const organizationOptions = {
			use: [teams(teamOptions)],
		} satisfies OrganizationOptions;

		const { signInWithTestUser, auth } = await defineInstance([
			organization(organizationOptions),
		]);

		const authContext = await auth.$context;
		const teamAdapter = getTeamAdapter(authContext, teamOptions);
		const { headers } = await signInWithTestUser();

		it("should create a default team", async () => {
			const body = getOrganizationData();
			const organization = await auth.api.createOrganization({
				body,
				headers,
			});

			const teams = await teamAdapter.getTeams(organization.id);

			expect(teams.length).toBe(1);
			expect(teams[0]!.organizationId).toBe(organization.id);
		});
	});
});
