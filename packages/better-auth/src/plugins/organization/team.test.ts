import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "./organization";
import { createAuthClient } from "../../client";
import { organizationClient } from "./client";

describe("team", async (it) => {
	const { auth, signInWithTestUser, signInWithUser, cookieSetter } =
		await getTestInstance({
			user: {
				modelName: "users",
			},
			plugins: [
				organization({
					async sendInvitationEmail(data, request) {},
					teams: {
						enabled: true,
					},
				}),
			],
			logger: {
				level: "error",
			},
		});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [
			organizationClient({
				teams: {
					enabled: true,
				},
			}),
		],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	let organizationId: string;
	let teamId: string;
	let secondTeamId: string;

	const invitedUser = {
		email: "invited@email.com",
		password: "password",
		name: "Invited User",
	};

	it("should create an organization and a team", async () => {
		const createOrganizationResponse = await client.organization.create({
			name: "Test Organization",
			slug: "test-org",
			metadata: {
				test: "organization-metadata",
			},
			fetchOptions: {
				headers,
			},
		});

		organizationId = createOrganizationResponse.data?.id as string;
		expect(createOrganizationResponse.data?.name).toBe("Test Organization");
		expect(createOrganizationResponse.data?.slug).toBe("test-org");
		expect(createOrganizationResponse.data?.members.length).toBe(1);
		expect(createOrganizationResponse.data?.metadata?.test).toBe(
			"organization-metadata",
		);

		const createTeamResponse = await client.organization.createTeam(
			{
				name: "Development Team",
				organizationId,
			},
			{
				headers,
			},
		);

		teamId = createTeamResponse.data?.id as string;
		expect(createTeamResponse.data?.name).toBe("Development Team");
		expect(createTeamResponse.data?.organizationId).toBe(organizationId);

		const createSecondTeamResponse = await client.organization.createTeam(
			{
				name: "Marketing Team",
				organizationId,
			},
			{
				headers,
			},
		);

		secondTeamId = createSecondTeamResponse.data?.id as string;
		expect(createSecondTeamResponse.data?.name).toBe("Marketing Team");
		expect(createSecondTeamResponse.data?.organizationId).toBe(organizationId);
	});

	it("should invite member to team", async () => {
		expect(teamId).toBeDefined();

		const res = await client.organization.inviteMember(
			{
				teamId,
				email: invitedUser.email,
				role: "member",
			},
			{
				headers,
			},
		);

		expect(res.data).toMatchObject({
			email: invitedUser.email,
			role: "member",
			teamId,
		});

		const newHeaders = new Headers();
		const signUpRes = await client.signUp.email(invitedUser, {
			onSuccess: cookieSetter(newHeaders),
		});

		expect(signUpRes.data?.user).toBeDefined();

		const invitation = await client.organization.acceptInvitation(
			{
				invitationId: res.data?.id as string,
			},
			{
				headers: newHeaders,
			},
		);

		expect(invitation.data?.member).toMatchObject({
			role: "member",
			teamId,
			userId: signUpRes.data?.user.id,
		});
	});

	it("should get full organization", async () => {
		const organization = await client.organization.getFullOrganization({
			fetchOptions: {
				headers,
			},
		});

		const teams = organization.data?.teams;
		expect(teams).toBeDefined();
		expect(teams?.length).toBe(3);

		const teamNames = teams?.map((team) => team.name);
		expect(teamNames).toContain("Development Team");
		expect(teamNames).toContain("Marketing Team");
	});

	it("should get all teams", async () => {
		const teamsResponse = await client.organization.listTeams({
			fetchOptions: { headers },
		});

		expect(teamsResponse.data).toBeInstanceOf(Array);
		expect(teamsResponse.data).toHaveLength(3);
	});

	it("should update a team", async () => {
		const updateTeamResponse = await client.organization.updateTeam({
			teamId,
			data: {
				name: "Updated Development Team",
			},
			fetchOptions: { headers },
		});

		expect(updateTeamResponse.data?.name).toBe("Updated Development Team");
		expect(updateTeamResponse.data?.id).toBe(teamId);
	});

	it("should remove a team", async () => {
		const teamsBeforeRemoval = await client.organization.listTeams({
			fetchOptions: { headers },
		});
		expect(teamsBeforeRemoval.data).toHaveLength(3);

		const removeTeamResponse = await client.organization.removeTeam({
			teamId,
			organizationId,
			fetchOptions: { headers },
		});

		expect(removeTeamResponse.data?.message).toBe("Team removed successfully.");

		const teamsAfterRemoval = await client.organization.listTeams({
			fetchOptions: { headers },
		});

		expect(teamsAfterRemoval.data).toHaveLength(2);
	});

	it("should not be able to remove the last team when allowRemovingAllTeams is not enabled", async () => {
		try {
			await client.organization.removeTeam({
				teamId: secondTeamId,
				organizationId,
				fetchOptions: { headers },
			});
			expect(true).toBe(false);
		} catch (error) {
			expect(error).toBeDefined();
		}
	});
});
