import { describe, expect, it, vi } from "vitest";
import { getOrgTestInstance } from "../../test-utils";
import type { Member, TeamMember } from "../../schema";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";

describe("accept invitation", () => {
	it("should accept an invitation and add a member to the organization", async () => {
		const { client, headers, auth, $ctx } = await getOrgTestInstance();
		const invite = await client.organization.inviteMember({
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(invite.status).toBe("pending");
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "test2@test.com",
				password: "test123456",
				name: "test2",
			},
		});
		const acceptedInvitation = await client.organization.acceptInvitation({
			invitationId: invite.id,
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${signUpRes.token}`,
				},
				throw: true,
			},
		});
		expect(acceptedInvitation.invitation.status).toBe("accepted");

		const member = await $ctx.adapter.findOne<Member>({
			model: "member",
			where: [
				{
					field: "organizationId",
					value: acceptedInvitation.invitation.organizationId,
				},
				{
					field: "userId",
					value: signUpRes.user.id,
				},
			],
		});
		expect(member?.role).toBe("member");
		expect(member?.organizationId).toBe(
			acceptedInvitation.invitation.organizationId,
		);
	});

	it("shouldn't accept an invitation if the user isn't the recipient", async () => {
		const { client, headers, auth, $ctx } = await getOrgTestInstance();
		const invite = await client.organization.inviteMember({
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(invite.status).toBe("pending");
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "test3@test.com",
				password: "test123456",
				name: "test3",
			},
		});
		const acceptedInvitation = await client.organization.acceptInvitation({
			invitationId: invite.id,
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${signUpRes.token}`,
				},
				throw: false,
			},
		});
		expect(acceptedInvitation.error?.status).toBe(403);
		expect(acceptedInvitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
		);
	});

	it("shouldn't accept an invitation if the invitation is expired", async () => {
		const { client, headers, auth } = await getOrgTestInstance();
		const invite = await client.organization.inviteMember({
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(invite.status).toBe("pending");
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "test2@test.com",
				password: "test123456",
				name: "test2",
			},
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 24 * 2);
		const acceptedInvitation = await client.organization.acceptInvitation({
			invitationId: invite.id,
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${signUpRes.token}`,
				},
			},
		});
		expect(acceptedInvitation.error?.status).toBe(400);
		expect(acceptedInvitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.INVITATION_EXPIRED,
		);
		vi.useRealTimers();
	});

	it("shouldn't accept an invitation if the there is no session", async () => {
		const { client, headers, auth } = await getOrgTestInstance();
		const invite = await client.organization.inviteMember({
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(invite.status).toBe("pending");
		const acceptedInvitation = await client.organization.acceptInvitation({
			invitationId: invite.id,
		});
		expect(acceptedInvitation.error?.status).toBe(401);
	});

	it("shouldn't accept an invitation if the invitation is not found", async () => {
		const { client, headers } = await getOrgTestInstance();
		const acceptedInvitation = await client.organization.acceptInvitation({
			invitationId: "123",
			fetchOptions: {
				headers,
			},
		});
		expect(acceptedInvitation.error?.status).toBe(400);
		expect(acceptedInvitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
		);
	});

	it("should require a verified email to accept an invitation", async () => {
		const { client, headers, auth, $ctx } = await getOrgTestInstance({
			organizationOptions: {
				requireEmailVerificationOnInvitation: true,
			},
		});
		const invite = await client.organization.inviteMember({
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(invite.status).toBe("pending");
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "test2@test.com",
				password: "test123456",
				name: "test2",
			},
		});
		const acceptedInvitation = await client.organization.acceptInvitation({
			invitationId: invite.id,
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${signUpRes.token}`,
				},
			},
		});
		expect(acceptedInvitation.error?.status).toBe(403);
		expect(acceptedInvitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION,
		);
		await $ctx.internalAdapter.updateUser(signUpRes.user.id, {
			emailVerified: true,
		});
		const acceptedInvitation2 = await client.organization.acceptInvitation({
			invitationId: invite.id,
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${signUpRes.token}`,
				},
				throw: true,
			},
		});
		expect(acceptedInvitation2.invitation.status).toBe("accepted");
	});

	it("shouldn't accept an invitation if the organization membership limit is reached", async () => {
		const { client, headers, auth, $ctx } = await getOrgTestInstance({
			organizationOptions: {
				membershipLimit: 1,
			},
		});
		const invite = await client.organization.inviteMember({
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(invite.status).toBe("pending");
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "test2@test.com",
				password: "test123456",
				name: "test2",
			},
		});
		const acceptedInvitation = await client.organization.acceptInvitation({
			invitationId: invite.id,
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${signUpRes.token}`,
				},
			},
		});
		expect(acceptedInvitation.error?.status).toBe(403);
		expect(acceptedInvitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
		);
	});

	it("should run before/afterAcceptInvitation hooks", async () => {
		const beforeCalled = vi.fn();
		const afterCalled = vi.fn();
		const { client, headers, auth, $ctx } = await getOrgTestInstance({
			organizationOptions: {
				organizationHooks: {
					beforeAcceptInvitation: async ({
						invitation,
						user,
						organization,
					}) => {
						beforeCalled();
					},
					afterAcceptInvitation: async ({
						invitation,
						member,
						user,
						organization,
					}) => {
						afterCalled();
					},
				},
			},
		});
		const invite = await client.organization.inviteMember({
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(invite.status).toBe("pending");
		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "test2@test.com",
				password: "test123456",
				name: "test2",
			},
		});
		await client.organization.acceptInvitation({
			invitationId: invite.id,
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${signUpRes.token}`,
				},
			},
		});
		expect(beforeCalled).toHaveBeenCalled();
		expect(afterCalled).toHaveBeenCalled();
	});
});

describe("invitation with team", () => {
	it("should accept an invitation with a single team", async () => {
		const { client, headers, auth, organization, $ctx } =
			await getOrgTestInstance({
				organizationOptions: {
					teams: { enabled: true },
				},
			});

		const team = await auth.api.createTeam({
			headers,
			body: { name: "Dev Team", organizationId: organization!.id },
		});
		const teamId = team.id;

		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				email: "teaminvite1@test.com",
				role: "member",
				organizationId: organization!.id,
				teamId,
			},
		});

		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "teaminvite1@test.com",
				password: "password",
				name: "Invitee1",
			},
		});

		const accepted = await client.organization.acceptInvitation(
			{ invitationId: invitation.id },
			{
				headers: new Headers({ Authorization: `Bearer ${signUpRes.token}` }),
				throw: true,
			},
		);
		expect(accepted.invitation.status).toBe("accepted");

		const member = await $ctx.adapter.findOne<TeamMember>({
			model: "teamMember",
			where: [
				{ field: "teamId", value: teamId },
				{ field: "userId", value: signUpRes.user.id },
			],
		});
		expect(member?.teamId).toBe(teamId);
		expect(member?.userId).toBe(signUpRes.user.id);
	});

	it("should accept an invitation with multiple teams and create memberships without setting active team", async () => {
		const { client, headers, organization, auth, $ctx } =
			await getOrgTestInstance({
				organizationOptions: {
					teams: { enabled: true },
				},
			});

		const teamA = await auth.api.createTeam({
			headers,
			body: { name: "Team A", organizationId: organization!.id },
		});
		const teamB = await auth.api.createTeam({
			headers,
			body: { name: "Team B", organizationId: organization!.id },
		});

		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				email: "teaminvite2@test.com",
				role: "member",
				organizationId: organization!.id,
				teamId: [teamA.id, teamB.id],
			},
		});

		const signUpRes = await auth.api.signUpEmail({
			body: {
				email: "teaminvite2@test.com",
				password: "password",
				name: "Invitee2",
			},
		});

		const accepted = await client.organization.acceptInvitation(
			{ invitationId: invitation.id },
			{
				headers: new Headers({ Authorization: `Bearer ${signUpRes.token}` }),
				throw: true,
			},
		);
		expect(accepted.invitation.status).toBe("accepted");

		// verify membership created for both teams
		const m1 = await $ctx.adapter.findOne<TeamMember>({
			model: "teamMember",
			where: [
				{ field: "teamId", value: teamA.id },
				{ field: "userId", value: signUpRes.user.id },
			],
		});
		const m2 = await $ctx.adapter.findOne<TeamMember>({
			model: "teamMember",
			where: [
				{ field: "teamId", value: teamB.id },
				{ field: "userId", value: signUpRes.user.id },
			],
		});
		expect(m1?.teamId).toBe(teamA.id);
		expect(m2?.teamId).toBe(teamB.id);
	});

	it("should forbid accepting when maximumMembersPerTeam is reached", async () => {
		const { client, headers, organization, testUser, auth } =
			await getOrgTestInstance({
				organizationOptions: {
					teams: { enabled: true, maximumMembersPerTeam: 2 },
				},
			});

		const team = await auth.api.createTeam({
			headers,
			body: { name: "Limited Team", organizationId: organization!.id },
		});
		const teamId = team.id;

		// occupy the only available seat
		await auth.api.addTeamMember({
			headers,
			body: { teamId, userId: testUser.user.id },
		});

		// invite another user to the same team
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				email: "teaminvite3@test.com",
				role: "member",
				organizationId: organization!.id,
				teamId,
			},
		});

		const signUp = await auth.api.signUpEmail({
			body: {
				email: "teaminvite3@test.com",
				password: "password",
				name: "Invitee3",
			},
		});

		const accepted = await client.organization.acceptInvitation(
			{ invitationId: invitation.id },
			{
				headers: new Headers({ Authorization: `Bearer ${signUp.token}` }),
			},
		);
		expect(accepted.error?.status).toBe(403);
		expect(accepted.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
		);
	});
});
