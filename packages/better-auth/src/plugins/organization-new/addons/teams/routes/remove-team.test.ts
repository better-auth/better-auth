import type { User } from "@better-auth/core/db";
import { describe, expect } from "vitest";
import { organization } from "../../../organization";
import { getOrganizationData } from "../../../test/utils";
import { teams } from "..";
import { defineInstance, getTeamData } from "../tests/utils";

describe("removeTeam", async (it) => {
	const { signInWithTestUser, auth, client, cookieSetter } =
		await defineInstance([organization({ use: [teams()] })]);

	it("should remove a team", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const organization = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		// Create first team
		const teamData = await getTeamData({ organizationId: organization.id });
		const team = await auth.api.createTeam({
			body: teamData,
			headers,
		});

		// Create second team (so we can delete one)
		const secondTeamData = await getTeamData({
			organizationId: organization.id,
		});
		await auth.api.createTeam({
			body: secondTeamData,
			headers,
		});

		const removeTeamResponse = await auth.api.removeTeam({
			body: {
				teamId: team.id,
				organizationId: organization.id,
			},
			headers,
		});

		expect(removeTeamResponse?.message).toBe("Team removed successfully.");
	});

	it("should not be able to remove the last team when allowRemovingAllTeams is not enabled", async () => {
		const { signInWithTestUser, auth } = await defineInstance([
			organization({ use: [teams()] }),
		]);
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		// Create only one team
		const teamData = await getTeamData({ organizationId: org.id });
		const team = await auth.api.createTeam({
			body: teamData,
			headers,
		});

		try {
			await auth.api.removeTeam({
				body: {
					teamId: team.id,
					organizationId: org.id,
				},
				headers,
			});
			expect.fail("Should have thrown an error");
		} catch (error) {
			expect(error).toBeDefined();
		}
	});

	it("should be able to remove the last team when allowRemovingAllTeams is enabled", async () => {
		const { signInWithTestUser, auth } = await defineInstance([
			organization({ use: [teams({ allowRemovingAllTeams: true })] }),
		]);
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		// Create only one team
		const teamData = await getTeamData({ organizationId: org.id });
		const team = await auth.api.createTeam({
			body: teamData,
			headers,
		});

		const removeTeamResponse = await auth.api.removeTeam({
			body: {
				teamId: team.id,
				organizationId: org.id,
			},
			headers,
		});

		expect(removeTeamResponse?.message).toBe("Team removed successfully.");
	});

	it("should return error when team is not found", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		try {
			await auth.api.removeTeam({
				body: {
					teamId: "non-existent-team-id",
					organizationId: org.id,
				},
				headers,
			});
			expect.fail("Should have thrown an error");
		} catch (error) {
			expect(error).toBeDefined();
		}
	});

	describe("authorization", async (it) => {
		it("should throw UNAUTHORIZED when called without session", async () => {
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				body: orgData,
				headers,
			});

			const teamData = await getTeamData({ organizationId: org.id });
			const team = await auth.api.createTeam({
				body: teamData,
				headers,
			});

			const { error } = await client.organization.removeTeam({
				teamId: team.id,
				organizationId: org.id,
				// No headers - no session
			});
			expect(error?.statusText).toBe("UNAUTHORIZED");
		});

		it("should throw FORBIDDEN when user is not a member of the organization", async () => {
			const { headers: ownerHeaders } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				body: orgData,
				headers: ownerHeaders,
			});

			const teamData = await getTeamData({ organizationId: org.id });
			const team = await auth.api.createTeam({
				body: teamData,
				headers: ownerHeaders,
			});

			// Create second team so we can delete one
			const secondTeamData = await getTeamData({ organizationId: org.id });
			await auth.api.createTeam({
				body: secondTeamData,
				headers: ownerHeaders,
			});

			// Sign in as a different user who is not a member
			const nonMemberHeaders = new Headers();

			await client.signUp.email(
				{
					email: "non-member@test.com",
					password: "password",
					name: "Non Member",
				},
				{
					onSuccess: cookieSetter(nonMemberHeaders),
				},
			);

			const { error } = await client.organization.removeTeam({
				teamId: team.id,
				organizationId: org.id,
				fetchOptions: {
					headers: nonMemberHeaders,
				},
			});
			expect(error?.statusText).toBe("FORBIDDEN");
			expect(error?.code).toBe("YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM");
		});

		it("should throw FORBIDDEN when member does not have team delete permission", async () => {
			const { headers: ownerHeaders } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				body: orgData,
				headers: ownerHeaders,
			});

			const teamData = await getTeamData({ organizationId: org.id });
			const team = await auth.api.createTeam({
				body: teamData,
				headers: ownerHeaders,
			});

			// Create second team so we can delete one
			const secondTeamData = await getTeamData({ organizationId: org.id });
			await auth.api.createTeam({
				body: secondTeamData,
				headers: ownerHeaders,
			});

			const memberHeaders = new Headers();
			const { data: memberUser } = (await client.signUp.email(
				{
					email: "member@test.com",
					password: "password",
					name: "Member",
				},
				{
					onSuccess: cookieSetter(memberHeaders),
				},
			)) as unknown as { data: { user: User; token: string } };

			await auth.api.addMember({
				body: {
					userId: memberUser.user.id,
					organizationId: org.id,
					role: "member",
				},
				headers: ownerHeaders,
			});

			const { error } = await client.organization.removeTeam({
				teamId: team.id,
				organizationId: org.id,
				fetchOptions: {
					headers: memberHeaders,
				},
			});
			expect(error?.statusText).toBe("FORBIDDEN");
			expect(error?.code).toBe(
				"YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORG",
			);
		});
	});
});
