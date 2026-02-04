import type { RawError } from "@better-auth/core/utils/error-codes";
import { describe, expect, expectTypeOf } from "vitest";
import { teams } from "../addons";
import { organization } from "../organization";
import { defineInstance } from "./utils";

describe("organization plugin", async (it) => {
	it("should throw an error when using slug as the default organization id field when slugs are disabled", async () => {
		try {
			organization({ defaultOrganizationIdField: "slug", disableSlugs: true });
			expect.fail("Should have thrown an error");
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe(
				"[Organization Plugin] Cannot use `slug` as the `defaultOrganizationIdField` when slugs are disabled",
			);
		}
	});

	it("addons should be able to pass $Infer properties over", async () => {
		const org = organization({
			use: [teams()],
		});

		expectTypeOf<typeof org.$Infer.Team>().toEqualTypeOf<{
			id: string;
			name: string;
			organizationId: string;
			createdAt: Date;
			updatedAt?: Date | undefined;
		}>();
	});

	it("addons should be able to pass error codes over", async () => {
		const org = organization({
			use: [teams()],
		});

		expectTypeOf<typeof org.$ERROR_CODES.TEAM_NOT_FOUND>().toEqualTypeOf<
			RawError<"TEAM_NOT_FOUND">
		>();
	});

	it("addons should be able to pass a custom schema over", async () => {
		const teamsPlugin = teams();
		const org = organization({
			use: [teamsPlugin],
		});

		const schema = teamsPlugin.schema;

		expectTypeOf<typeof org.schema.team>().toEqualTypeOf<
			(typeof schema)["team"]
		>();

		expect(org.schema.team).toBeDefined();
		expect(org.schema.team).toStrictEqual(schema.team);
	});
});

describe("createOrgOnSignUp", async (it) => {
	it("should create a default organization when user signs up with createOrgOnSignUp: true", async () => {
		const plugin = organization({
			createOrgOnSignUp: true,
		});
		const { auth, adapter } = await defineInstance([plugin]);

		// Sign up a new user
		const email = `test-${Date.now()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: {
				email,
				password: "password123",
				name: "Test User",
			},
		});

		expect(user).toBeDefined();
		expect(user.id).toBeDefined();

		// Verify an organization was created
		const organizations = await adapter.findMany<{ id: string; name: string }>({
			model: "organization",
			where: [],
		});
		const userOrg = organizations.find((org) =>
			org.name.includes(user.name || ""),
		);
		expect(userOrg).toBeDefined();

		// Verify the user is a member of the organization
		const members = await adapter.findMany<{
			userId: string;
			organizationId: string;
			role: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: user.id }],
		});
		expect(members.length).toBe(1);
		expect(members[0]!.organizationId).toBe(userOrg!.id);
		expect(members[0]!.role).toBe("owner");
	});

	it("should create organization with custom data when createOrgOnSignUp is a function", async () => {
		const customOrgName = "Custom Org Name";
		const plugin = organization({
			createOrgOnSignUp: async ({ user }) => ({
				name: customOrgName,
				slug: `custom-org-${user.id.substring(0, 8)}`,
			}),
		});
		const { auth, adapter } = await defineInstance([plugin]);

		const email = `test-custom-${Date.now()}@example.com`;
		await auth.api.signUpEmail({
			body: {
				email,
				password: "password123",
				name: "Custom Org User",
			},
		});

		// Verify organization was created with custom name
		const organizations = await adapter.findMany<{
			id: string;
			name: string;
			slug: string;
		}>({
			model: "organization",
			where: [],
		});
		const userOrg = organizations.find((org) => org.name === customOrgName);
		expect(userOrg).toBeDefined();
		expect(userOrg!.slug.startsWith("custom-org-")).toBe(true);
	});

	it("should not create organization when createOrgOnSignUp returns false", async () => {
		const plugin = organization({
			createOrgOnSignUp: async () => false,
		});
		const { auth, adapter } = await defineInstance([plugin]);

		const email = `test-no-org-${Date.now()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: {
				email,
				password: "password123",
				name: "No Org User",
			},
		});

		// Verify no organization was created for this user
		const members = await adapter.findMany<{
			userId: string;
			organizationId: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: user.id }],
		});
		expect(members.length).toBe(0);
	});

	it("should not create organization when createOrgOnSignUp is not set", async () => {
		const plugin = organization();
		const { auth, adapter } = await defineInstance([plugin]);

		const email = `test-default-${Date.now()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: {
				email,
				password: "password123",
				name: "Default Behavior User",
			},
		});

		// Verify no organization was created for this user
		const members = await adapter.findMany<{
			userId: string;
			organizationId: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: user.id }],
		});
		expect(members.length).toBe(0);
	});
});

describe("createOrgOnSignUp with teams addon", async (it) => {
	it("should create a default team when teams addon is used with defaultTeam enabled", async () => {
		const plugin = organization({
			createOrgOnSignUp: true,
			use: [
				teams({
					defaultTeam: {
						enabled: true,
					},
				}),
			],
		});
		const { auth, adapter } = await defineInstance([plugin]);

		const email = `test-team-${Date.now()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: {
				email,
				password: "password123",
				name: "Team Test User",
			},
		});

		// Verify organization was created
		const members = await adapter.findMany<{
			userId: string;
			organizationId: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: user.id }],
		});
		expect(members.length).toBe(1);
		const organizationId = members[0]!.organizationId;

		// Verify a default team was created
		const allTeams = await adapter.findMany<{
			id: string;
			name: string;
			organizationId: string;
		}>({
			model: "team",
			where: [{ field: "organizationId", value: organizationId }],
		});
		expect(allTeams.length).toBe(1);
		expect(allTeams[0]!.organizationId).toBe(organizationId);

		// Verify the user is a member of the team
		const teamMembers = await adapter.findMany<{
			userId: string;
			teamId: string;
		}>({
			model: "teamMember",
			where: [{ field: "userId", value: user.id }],
		});
		expect(teamMembers.length).toBe(1);
		expect(teamMembers[0]!.teamId).toBe(allTeams[0]!.id);
	});

	it("should create a default team with teams addon when defaultTeam is not specified (defaults to enabled)", async () => {
		const plugin = organization({
			createOrgOnSignUp: true,
			use: [teams()],
		});
		const { auth, adapter } = await defineInstance([plugin]);

		const email = `test-team-default-${Date.now()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: {
				email,
				password: "password123",
				name: "Team Default User",
			},
		});

		// Verify organization was created
		const members = await adapter.findMany<{
			userId: string;
			organizationId: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: user.id }],
		});
		expect(members.length).toBe(1);
		const organizationId = members[0]!.organizationId;

		// Verify a default team was created (default behavior with teams addon)
		const allTeams = await adapter.findMany<{
			id: string;
			organizationId: string;
		}>({
			model: "team",
			where: [{ field: "organizationId", value: organizationId }],
		});
		expect(allTeams.length).toBe(1);

		// Verify the user is a member of the team
		const teamMembers = await adapter.findMany<{
			userId: string;
			teamId: string;
		}>({
			model: "teamMember",
			where: [{ field: "userId", value: user.id }],
		});
		expect(teamMembers.length).toBe(1);
	});

	it("should not create a default team when teams addon has defaultTeam disabled", async () => {
		const plugin = organization({
			createOrgOnSignUp: true,
			use: [
				teams({
					defaultTeam: {
						enabled: false,
					},
				}),
			],
		});
		const { auth, adapter } = await defineInstance([plugin]);

		const email = `test-no-team-${Date.now()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: {
				email,
				password: "password123",
				name: "No Team User",
			},
		});

		// Verify organization was created
		const members = await adapter.findMany<{
			userId: string;
			organizationId: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: user.id }],
		});
		expect(members.length).toBe(1);
		const organizationId = members[0]!.organizationId;

		// Verify no team was created
		const allTeams = await adapter.findMany<{
			id: string;
			organizationId: string;
		}>({
			model: "team",
			where: [{ field: "organizationId", value: organizationId }],
		});
		expect(allTeams.length).toBe(0);

		// Verify no team membership
		const teamMembers = await adapter.findMany<{
			userId: string;
			teamId: string;
		}>({
			model: "teamMember",
			where: [{ field: "userId", value: user.id }],
		});
		expect(teamMembers.length).toBe(0);
	});

	it("should create a default team with custom data using customCreateDefaultTeam", async () => {
		const customTeamName = "Custom Default Team";
		const plugin = organization({
			createOrgOnSignUp: true,
			use: [
				teams({
					defaultTeam: {
						enabled: true,
						customCreateDefaultTeam: async (org) => ({
							name: customTeamName,
							organizationId: org.id,
						}),
					},
				}),
			],
		});
		const { auth, adapter } = await defineInstance([plugin]);

		const email = `test-custom-team-${Date.now()}@example.com`;
		const { user } = await auth.api.signUpEmail({
			body: {
				email,
				password: "password123",
				name: "Custom Team User",
			},
		});

		// Verify organization was created
		const members = await adapter.findMany<{
			userId: string;
			organizationId: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: user.id }],
		});
		expect(members.length).toBe(1);
		const organizationId = members[0]!.organizationId;

		// Verify the default team was created with custom name
		const allTeams = await adapter.findMany<{
			id: string;
			name: string;
			organizationId: string;
		}>({
			model: "team",
			where: [{ field: "organizationId", value: organizationId }],
		});
		expect(allTeams.length).toBe(1);
		expect(allTeams[0]!.name).toBe(`${user.name}'s Team`);
	});
});
