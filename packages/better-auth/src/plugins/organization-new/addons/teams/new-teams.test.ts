import { describe, expect, expectTypeOf } from "vitest";
import type { BetterAuthPlugin } from "../../../..";
import { getTestInstance } from "../../../../test-utils/test-instance";
import { organization } from "../../organization";
import { teams } from ".";
import { getTeamAdapter } from "./get-team-adapter";
import type { OrganizationOptions } from "../../types";
import type { TeamsOptions } from "./types";

const defineInstance = async <Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) => {
	const instance = await getTestInstance({
		plugins: plugins,
	});

	return instance;
};

const getOrganizationData = (options?: { name?: string; slug?: string }) => {
	const random = Math.random().toString(36).substring(2, 15);
	return {
		name: options?.name || `${random}-test-organization`,
		slug: options?.slug || `${random}-test-organization`,
	};
};

const getTeamData = async (options: {
	organizationId: string;
	name?: string;
	slug?: string;
}) => {
	const random = Math.random().toString(36).substring(2, 15);

	return {
		name: options?.name || `${random}-test-team`,
		slug: options?.slug || undefined,
		organizationId: options.organizationId,
	};
};

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
