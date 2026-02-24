import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { defineInstance, getOrganizationData } from "../../../test/utils";
import { teams } from "..";

describe("set active team", async (it) => {
	const plugin = organization({
		use: [teams()],
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	let organizationId: string;
	let defaultTeamId: string;

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
	});

	it("should set a team as active", async () => {
		expect(defaultTeamId).toBeDefined();

		const result = await auth.api.setActiveTeam({
			headers,
			body: {
				teamId: defaultTeamId,
			},
		});

		expect(result).toBeDefined();
		expect(result?.id).toBe(defaultTeamId);
		expect(result?.organizationId).toBe(organizationId);
	});

	it("should return null when setting active team to null", async () => {
		const result = await auth.api.setActiveTeam({
			headers,
			body: {
				teamId: null,
			},
		});

		expect(result).toBeNull();
	});

	it("should fail when team does not exist", async () => {
		try {
			await auth.api.setActiveTeam({
				headers,
				body: {
					teamId: "non-existent-team-id",
				},
			});
			expect.fail("Should have thrown an error");
		} catch (error: any) {
			expect(error.body?.code).toBe("TEAM_NOT_FOUND");
		}
	});

	describe("team membership requirement", async (it) => {
		const plugin = organization({
			use: [teams()],
		});
		const { auth, signInWithTestUser, client } = await defineInstance([plugin]);
		const { headers: ownerHeaders } = await signInWithTestUser();

		// Create a second user
		const memberEmail = `member-${Math.random().toString(36).substring(7)}@test.com`;
		const memberPassword = "password123";

		let orgId: string;
		let teamIdForMembership: string;
		let memberHeaders: Headers;
		let memberUserId: string;

		it("should create an organization and a second user", async () => {
			// Sign up the second user
			const memberHeadersInit = new Headers();
			await client.signUp.email({
				email: memberEmail,
				password: memberPassword,
				name: "Member User",
				fetchOptions: {
					onSuccess(context) {
						const header = context.response.headers.get("set-cookie");
						if (header) {
							memberHeadersInit.set("cookie", header.split(";")[0]!);
						}
					},
				},
			});

			// Sign in as member to get headers
			const signInHeaders = new Headers();
			const signInRes = await client.signIn.email({
				email: memberEmail,
				password: memberPassword,
				fetchOptions: {
					onSuccess(context) {
						const header = context.response.headers.get("set-cookie");
						if (header) {
							signInHeaders.set("cookie", header.split(";")[0]!);
						}
					},
				},
			});
			memberHeaders = signInHeaders;
			memberUserId = signInRes.data?.user?.id!;

			// Owner creates organization
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers: ownerHeaders,
				body: {
					name: orgData.name,
					slug: orgData.slug,
				},
			});
			orgId = org.id;

			// Add member to the organization (but the member won't be in the team)
			await auth.api.addMember({
				headers: ownerHeaders,
				body: {
					organizationId: orgId,
					userId: memberUserId,
					role: "member",
				},
			});

			// Owner creates a new team (member won't be in this team)
			const team = await auth.api.createTeam({
				headers: ownerHeaders,
				body: {
					name: "Private Team",
					organizationId: orgId,
				},
			});
			teamIdForMembership = team.id;
		});

		it("should fail when user is not a member of the team", async () => {
			// Set active organization for the member first
			await auth.api.setActiveOrganization({
				headers: memberHeaders,
				body: {
					organizationId: orgId,
				},
			});

			try {
				await auth.api.setActiveTeam({
					headers: memberHeaders,
					body: {
						teamId: teamIdForMembership,
					},
				});
				expect.fail("Should have thrown an error");
			} catch (error: any) {
				expect(error.body?.code).toBe("USER_IS_NOT_A_MEMBER_OF_THE_TEAM");
			}
		});
	});

	describe("active organization requirement", async (it) => {
		const plugin = organization({
			use: [teams()],
		});
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers: freshHeaders } = await signInWithTestUser();

		it("should fail when no active organization is set", async () => {
			try {
				await auth.api.setActiveTeam({
					headers: freshHeaders,
					body: {
						teamId: "some-team-id",
					},
				});
				expect.fail("Should have thrown an error");
			} catch (error: any) {
				expect(error.body?.code).toBe("NO_ACTIVE_ORGANIZATION");
			}
		});
	});
});
