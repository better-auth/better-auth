import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { organization } from "../organization";

describe("listTeams", async () => {
	const { auth, signInWithTestUser, cookieSetter, customFetchImpl } = await getTestInstance({
		plugins: [
			organization({
				teams: {
					enabled: true,
				},
			}),
		],
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

	const org = await client.organization.create({
		name: "test",
		slug: "test",
		metadata: {
			test: "test",
		},
		fetchOptions: {
			headers,
		},
	});

	for (let i = 0; i < 10; i++) {
		await client.organization.createTeam(
			{
				name: `test-team-${i}`,
				organizationId: org.data?.id as string,
			},
			{
				headers,
			},
		);
	}

	it("should return all teams", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		const teams = await client.organization.listTeams({
			fetchOptions: {
				headers,
			},
		});
		expect(teams.data?.length).toBe(11); // 10 created + 1 default team
	});

	it("should limit the number of teams", async () => {
		const teams = await client.organization.listTeams({
			fetchOptions: {
				headers,
			},
			query: {
				limit: 5,
			},
		});
		expect(teams.data?.length).toBe(5);
	});

	it("should offset the teams", async () => {
		const teams = await client.organization.listTeams({
			fetchOptions: {
				headers,
			},
			query: {
				offset: 5,
			},
		});
		expect(teams.data?.length).toBe(6); // 11 total - 5 offset = 6 remaining
	});

	it("should limit and offset the teams together", async () => {
		const teams = await client.organization.listTeams({
			fetchOptions: {
				headers,
			},
			query: {
				limit: 3,
				offset: 7,
			},
		});
		expect(teams.data?.length).toBe(3);
	});
});

describe("listTeamMembers", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		plugins: [
			organization({
				teams: {
					enabled: true,
				},
			}),
		],
	});
	const ctx = await auth.$context;
	const { headers, user } = await signInWithTestUser();
	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			organizationClient({
				teams: {
					enabled: true,
				},
			}),
		],
		fetchOptions: {
			customFetchImpl,
		},
	});

	const org = await client.organization.create({
		name: "test",
		slug: "test",
		metadata: {
			test: "test",
		},
		fetchOptions: {
			headers,
		},
	});

	const team = await client.organization.createTeam(
		{
			name: "test-team",
			organizationId: org.data?.id as string,
		},
		{
			headers,
		},
	);

	await client.organization.addTeamMember(
		{
			teamId: team.data?.id as string,
			userId: user.id,
		},
		{
			headers,
		},
	);

	for (let i = 0; i < 10; i++) {
		const newUser = await ctx.adapter.create({
			model: "user",
			data: {
				email: `test-team-member-${i}@test.com`,
				name: `test-team-member-${i}`,
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org.data?.id as string,
				userId: newUser.id,
				role: "member",
			},
		});
		await client.organization.addTeamMember(
			{
				teamId: team.data?.id as string,
				userId: newUser.id,
			},
			{
				headers,
			},
		);
	}

	it("should return all team members", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		await client.organization.setActiveTeam({
			teamId: team.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		const members = await client.organization.listTeamMembers({
			fetchOptions: {
				headers,
			},
		});
		expect(members.data?.length).toBe(11);
	});

	it("should limit the number of team members", async () => {
		const members = await client.organization.listTeamMembers({
			fetchOptions: {
				headers,
			},
			query: {
				teamId: team.data?.id as string,
				limit: 5,
			},
		});
		expect(members.data?.length).toBe(5);
	});

	it("should offset the team members", async () => {
		const members = await client.organization.listTeamMembers({
			fetchOptions: {
				headers,
			},
			query: {
				teamId: team.data?.id as string,
				offset: 5,
			},
		});
		expect(members.data?.length).toBe(6);
	});

	it("should limit and offset the team members together", async () => {
		const members = await client.organization.listTeamMembers({
			fetchOptions: {
				headers,
			},
			query: {
				teamId: team.data?.id as string,
				limit: 3,
				offset: 8,
			},
		});
		expect(members.data?.length).toBe(3);
	});
});
