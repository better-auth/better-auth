import { describe, expect } from "vitest";
import { createAuthClient } from "../../client";
import { setCookieToHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { organizationClient } from "./client";
import { organization } from "./organization";

describe("team", async (it) => {
	const { auth, signInWithTestUser, cookieSetter } = await getTestInstance({
		user: {
			modelName: "users",
		},
		plugins: [
			organization({
				async sendInvitationEmail() {},
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

	const signUpHeaders = new Headers();
	const signUpRes = await client.signUp.email(invitedUser, {
		onSuccess: cookieSetter(signUpHeaders),
	});

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

		const invitation = await client.organization.acceptInvitation(
			{
				invitationId: res.data?.id as string,
			},
			{
				headers: signUpHeaders,
			},
		);

		expect(invitation.data?.member).toMatchObject({
			role: "member",
			userId: signUpRes.data?.user.id,
		});
	});

	it("should add team to the member's list of teams", async () => {
		const listUserTeamsRes = await client.organization.listUserTeams(
			{},
			{
				headers: signUpHeaders,
			},
		);

		expect(listUserTeamsRes.error).toBeNull();
		expect(listUserTeamsRes.data).not.toBeNull();
		expect(listUserTeamsRes.data).toHaveLength(1);
	});

	it("should be able to list team members in the current active team", async () => {
		const activeTeamHeaders = new Headers();
		await client.organization.setActiveTeam(
			{
				teamId,
			},
			{
				headers: signUpHeaders,
				onSuccess: cookieSetter(activeTeamHeaders),
			},
		);

		const res = await client.organization.listTeamMembers(
			{},
			{
				headers: activeTeamHeaders,
			},
		);

		expect(res.error).toBeNull();
		expect(res.data).not.toBeNull();
		expect(res.data).toHaveLength(1);
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

	it("should not be allowed to invite a member to a team that's reached maximum members", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			user: {
				modelName: "users",
			},
			plugins: [
				organization({
					teams: {
						enabled: true,
						maximumMembersPerTeam: 1,
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
		expect(createOrganizationResponse.data?.id).toBeDefined();

		const createTeamResponse = await client.organization.createTeam(
			{
				name: "Development Team",
				organizationId: createOrganizationResponse.data?.id,
			},
			{
				headers,
			},
		);
		expect(createTeamResponse.data?.id).toBeDefined();

		const res = await client.organization.inviteMember(
			{
				teamId: createTeamResponse.data?.id,
				email: invitedUser.email,
				role: "member",
			},
			{
				headers,
			},
		);
		expect(res.data).toBeDefined();
		const newHeaders = new Headers();
		const signUpRes = await client.signUp.email(invitedUser, {
			onSuccess: cookieSetter(newHeaders),
		});

		expect(signUpRes.data?.user).toBeDefined();

		const acceptInvitationResponse = await client.organization.acceptInvitation(
			{
				invitationId: res.data?.id as string,
			},
			{
				headers: newHeaders,
			},
		);
		expect(acceptInvitationResponse.data).toBeDefined();

		const res2 = await client.organization.inviteMember(
			{
				teamId: createTeamResponse.data?.id,
				email: "test2@test.com",
				role: "member",
			},
			{
				headers,
			},
		);
		expect(res2.data).toBeNull();
		expect(res2.error?.code).toEqual("TEAM_MEMBER_LIMIT_REACHED");
	});
});

describe("multi team support", async (it) => {
	const { auth, signInWithTestUser, cookieSetter } = await getTestInstance(
		{
			plugins: [
				organization({
					async sendInvitationEmail() {},
					teams: {
						enabled: true,
						defaultTeam: {
							enabled: true,
						},
					},
				}),
			],
			logger: {
				level: "error",
			},
		},
		{
			testWith: "sqlite",
		},
	);

	const admin = await signInWithTestUser();

	const invitedUser = await auth.api.signUpEmail({
		body: {
			name: "Invited User",
			email: "invited@email.com",
			password: "password",
		},
		returnHeaders: true,
	});

	let organizationId: string | null = null;

	let team1Id: string | null = null;
	let team2Id: string | null = null;
	let team3Id: string | null = null;

	let invitationId: string | null = null;

	it("should create an organization to test multi team support", async () => {
		const organization = await auth.api.createOrganization({
			headers: admin.headers,
			body: {
				name: "Test Organization",
				slug: "test-org",
				metadata: {
					test: "organization-metadata",
				},
			},
		});

		expect(organization?.id).toBeDefined();
		expect(organization?.name).toBe("Test Organization");

		organizationId = organization?.id as string;
	});

	it("should create 3 teams", async () => {
		expect(organizationId).toBeDefined();
		if (!organizationId) throw Error("can not run test");

		const team1 = await auth.api.createTeam({
			headers: admin.headers,
			body: {
				name: "Team One",
				organizationId,
			},
		});

		expect(team1.id).toBeDefined();
		expect(team1.organizationId).toBe(organizationId);

		team1Id = team1.id;

		const team2 = await auth.api.createTeam({
			headers: admin.headers,
			body: {
				name: "Team Two",
				organizationId,
			},
		});

		expect(team2.id).toBeDefined();
		expect(team2.organizationId).toBe(organizationId);

		team2Id = team2.id;

		const team3 = await auth.api.createTeam({
			headers: admin.headers,
			body: {
				name: "Team Three",
				organizationId,
			},
		});

		expect(team3.id).toBeDefined();
		expect(team3.organizationId).toBe(organizationId);

		team3Id = team3.id;
	});

	it("should invite user to all 3 teams", async () => {
		expect(organizationId).toBeDefined();
		expect(team1Id).toBeDefined();
		expect(team2Id).toBeDefined();
		expect(team3Id).toBeDefined();

		if (!organizationId || !team1Id || !team2Id || !team3Id)
			throw Error("can not run test");

		const invitation = await auth.api.createInvitation({
			headers: admin.headers,
			body: {
				email: invitedUser.response.user.email,
				role: "member",
				organizationId,
				teamId: [team1Id, team2Id, team3Id],
			},
		});

		expect(invitation.id).toBeDefined();
		expect((invitation as any).teamId).toBe(
			[team1Id, team2Id, team3Id].join(","),
		);

		invitationId = invitation.id!;
	});

	it("should accept invite and join all 3 teams", async () => {
		expect(invitationId).toBeDefined();

		if (!invitationId) throw Error("can not run test");

		const accept = await auth.api.acceptInvitation({
			headers: { cookie: invitedUser.headers.getSetCookie()[0]! },
			body: {
				invitationId,
			},
		});

		expect(accept?.member).toBeDefined();
		expect(accept?.invitation).toBeDefined();
	});

	it("should have jonied all 3 teams", async () => {
		expect(invitationId).toBeDefined();

		if (!invitationId) throw Error("can not run test");

		const teams = await auth.api.listUserTeams({
			headers: { cookie: invitedUser.headers.getSetCookie()[0]! },
		});

		expect(teams).toHaveLength(3);
	});

	let activeTeamCookie: string | null = null;

	it("should allow you to set one of the teams as active", async () => {
		expect(team1Id).toBeDefined();
		expect(organizationId).toBeDefined();

		if (!team1Id || !organizationId) throw Error("can not run test");

		const team = await auth.api.setActiveTeam({
			headers: { cookie: invitedUser.headers.getSetCookie()[0]! },
			body: {
				teamId: team1Id,
			},
			returnHeaders: true,
		});

		expect(team.response?.id).toBe(team1Id);
		expect(team.response?.organizationId).toBe(organizationId);

		activeTeamCookie = team.headers.getSetCookie()[0]!;
	});

	it("should allow you to list team members of the current active team", async () => {
		expect(activeTeamCookie).toBeDefined();

		if (!activeTeamCookie) throw Error("can not run test");

		const members = await auth.api.listTeamMembers({
			headers: { cookie: activeTeamCookie },
		});

		expect(members).toHaveLength(1);
		expect(members.at(0)!.teamId).toBe(team1Id);
	});

	it("should allow user to list team members of any team the user is in", async () => {
		expect(team2Id).toBeDefined();
		expect(team3Id).toBeDefined();

		if (!team2Id || !team3Id) throw Error("can not run test");

		const team2Members = await auth.api.listTeamMembers({
			headers: { cookie: invitedUser.headers.getSetCookie()[0]! },
			query: {
				teamId: team2Id,
			},
		});

		expect(team2Members).toHaveLength(1);
		expect(team2Members.at(0)!.teamId).toBe(team2Id);

		const team3Members = await auth.api.listTeamMembers({
			headers: { cookie: invitedUser.headers.getSetCookie()[0]! },
			query: {
				teamId: team3Id,
			},
		});

		expect(team3Members).toHaveLength(1);
		expect(team3Members.at(0)!.teamId).toBe(team3Id);
	});

	let team4Id: string | null = null;
	it("should directly add a member to a team", async () => {
		expect(organizationId).toBeDefined();
		if (!organizationId) throw Error("can not run test");

		const team = await auth.api.createTeam({
			headers: admin.headers,
			body: {
				name: "Team Four",
				organizationId,
			},
		});

		const teamMember = await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				userId: invitedUser.response.user.id,
				teamId: team.id,
			},
		});

		expect(teamMember.teamId).toBe(team.id);
		expect(teamMember.userId).toBe(invitedUser.response.user.id);

		const teams = await auth.api.listUserTeams({
			headers: { cookie: invitedUser.headers.getSetCookie()[0]! },
		});

		expect(teams).toHaveLength(4);

		team4Id = team.id;
	});

	it("should remove a member from a team", async () => {
		expect(team4Id).toBeDefined();
		if (!team4Id) throw Error("can not run test");

		await auth.api.removeTeamMember({
			headers: admin.headers,
			body: {
				userId: invitedUser.response.user.id,
				teamId: team4Id,
			},
		});

		const teams = await auth.api.listUserTeams({
			headers: { cookie: invitedUser.headers.getSetCookie()[0]! },
		});

		expect(teams).toHaveLength(3);
	});

	it("should create invitation without teamId", async () => {
		expect(organizationId).toBeDefined();
		if (!organizationId) throw Error("can not run test");

		const invitation = await auth.api.createInvitation({
			headers: admin.headers,
			body: {
				email: "noteam@email.com",
				role: "member",
				organizationId,
			},
		});

		expect(invitation.id).toBeDefined();
		expect((invitation as any).teamId).toBeNull();
		expect((invitation as any).teamId).not.toBe("");
	});

	it("should remove a member from the organization and all their teams when calling removeMember", async () => {
		// Create a new user to invite
		const userHeaders = new Headers();
		const response = await auth.api.signUpEmail({
			body: {
				email: "removeteamorguser@email.com",
				name: "Remove Team Org User",
				password: "password",
			},
			asResponse: true,
		});

		setCookieToHeader(userHeaders)({ response });
		const newUser = await response.json();

		// Add the user as a member to the organization
		const member = await auth.api.addMember({
			headers: admin.headers,
			body: {
				organizationId: organizationId!,
				userId: newUser.user.id,
				role: "member",
			},
		});

		// Add the user to team1
		await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId: team1Id!,
				userId: newUser.user.id,
			},
		});

		// add admin to the team1
		await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId: team1Id!,
				userId: admin.user.id,
			},
		});

		// Confirm user is a member of the org
		const membersBefore = await auth.api.listMembers({
			headers: admin.headers,
			query: { organizationId: organizationId! },
		});
		const foundMember = membersBefore.members.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(foundMember).toBeDefined();
		if (!foundMember) throw Error("can not run test");

		// Confirm user is a member of the team
		const teamMembersBefore = await auth.api.listTeamMembers({
			headers: userHeaders,
			query: { teamId: team1Id! },
		});
		const foundTeamMember = teamMembersBefore.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(foundTeamMember).toBeDefined();

		// Remove the member from the organization
		const removed = await auth.api.removeMember({
			headers: admin.headers,
			body: {
				memberIdOrEmail: foundMember.id,
				organizationId: organizationId!,
			},
		});
		expect(removed?.member?.id).toBe(foundMember.id);

		// Confirm user is no longer a member of the org
		const membersAfter = await auth.api.listMembers({
			headers: admin.headers,
			query: { organizationId: organizationId! },
		});
		const stillMember = membersAfter.members.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(stillMember).toBeUndefined();

		// Confirm user is no longer a member of the team
		const teamMembersAfter = await auth.api.listTeamMembers({
			headers: admin.headers,
			query: { teamId: team1Id! },
		});
		const stillTeamMember = teamMembersAfter.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(stillTeamMember).toBeUndefined();
	});

	it("should remove a member from the organization and all their teams when calling leaveOrganization", async () => {
		const testUserEmail = `leaveorguser${Date.now()}@email.com`;

		const userHeaders = new Headers();
		const response = await auth.api.signUpEmail({
			body: {
				email: testUserEmail,
				name: "Leave Org User",
				password: "password",
			},
			asResponse: true,
		});

		setCookieToHeader(userHeaders)({ response });
		const newUser = await response.json();

		// Add the user as a member to the organization
		const member = await auth.api.addMember({
			headers: admin.headers,
			body: {
				organizationId: organizationId!,
				userId: newUser.user.id,
				role: "member",
			},
		});

		// Verify the user is now a member of the organization
		const membersBefore = await auth.api.listMembers({
			headers: admin.headers,
			query: { organizationId: organizationId! },
		});
		const foundMember = membersBefore.members.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(foundMember).toBeDefined();
		if (!foundMember) throw Error("User was not added as organization member");

		// Add the user to team1
		await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId: team1Id!,
				userId: newUser.user.id,
			},
		});

		// Add admin to team1 as well so they can list team members
		await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId: team1Id!,
				userId: admin.user.id,
			},
		});

		await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId: team2Id!,
				userId: newUser.user.id,
			},
		});

		await auth.api.addTeamMember({
			headers: admin.headers,
			body: {
				teamId: team2Id!,
				userId: admin.user.id,
			},
		});

		const team1MembersBefore = await auth.api.listTeamMembers({
			headers: admin.headers,
			query: { teamId: team1Id! },
		});
		const foundTeam1Member = team1MembersBefore.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(foundTeam1Member).toBeDefined();

		const team2MembersBefore = await auth.api.listTeamMembers({
			headers: admin.headers,
			query: { teamId: team2Id! },
		});
		const foundTeam2Member = team2MembersBefore.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(foundTeam2Member).toBeDefined();

		// User leaves the organization
		const left = await auth.api.leaveOrganization({
			headers: userHeaders,
			body: {
				organizationId: organizationId!,
			},
		});
		expect(left?.id).toBe(foundMember.id);

		const membersAfter = await auth.api.listMembers({
			headers: admin.headers,
			query: { organizationId: organizationId! },
		});
		const stillMember = membersAfter.members.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(stillMember).toBeUndefined();

		// Confirm user is no longer a member of team1
		const team1MembersAfter = await auth.api.listTeamMembers({
			headers: admin.headers,
			query: { teamId: team1Id! },
		});
		const stillTeam1Member = team1MembersAfter.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(stillTeam1Member).toBeUndefined();

		// Confirm user is no longer a member of team2
		const team2MembersAfter = await auth.api.listTeamMembers({
			headers: admin.headers,
			query: { teamId: team2Id! },
		});
		const stillTeam2Member = team2MembersAfter.find(
			(m: any) => m.userId === newUser.user.id,
		);
		expect(stillTeam2Member).toBeUndefined();
	});
});
