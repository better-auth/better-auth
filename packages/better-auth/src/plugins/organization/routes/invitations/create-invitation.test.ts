import { describe, expect, vi } from "vitest";
import { BASE_ERROR_CODES } from "../../../../error/codes";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";
import { createAccessControl } from "../../../access/access";
import { defaultRoles, defaultStatements } from "../../access";
import { getOrgTestInstance as getInstance } from "../../test-utils";

describe("create-invitation", async (it) => {
	it("should invite a user to an organization and return the invitation", async () => {
		const { client, headers, organization } = await getInstance();
		const { data: invite } = await client.organization.inviteMember({
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		const expected = {
			organizationId: organization?.id,
			email: "test2@test.com",
			role: "member",
			status: "pending",
			expiresAt: expect.any(Date),
			inviterId: expect.any(String),
			id: expect.any(String),
		};
		expect(invite).toMatchObject(expected);
	});

	it("should have proper validation for email", async () => {
		const { client, headers } = await getInstance();
		const invite = await client.organization.inviteMember({
			email: "non-email",
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		expect(invite.error?.status).toBe(400);
		expect(invite.error?.message).toBe(BASE_ERROR_CODES.INVALID_EMAIL);
	});

	it("should not allow inviting a user if the user is not a member of the organization", async () => {
		const { client, auth, organization } = await getInstance();
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-user@test.com",
				name: "new user",
				password: "password",
			},
		});
		const invite = await client.organization.inviteMember({
			email: "test@test.com",
			role: "member",
			organizationId: organization?.id,
			fetchOptions: {
				headers: {
					authorization: `Bearer ${newUser.token}`,
				},
			},
		});
		expect(invite.error?.status).toBe(400);
		expect(invite.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.NOT_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});

	it("should allow inviting a user with organization id", async () => {
		const { client, auth, organization, headers, testUser } =
			await getInstance();
		const newUserOrg = await auth.api.createOrganization({
			body: {
				name: "new org",
				slug: "new-org",
				userId: testUser.user.id,
			},
		});
		if (!newUserOrg) throw new Error("New user organization not created");
		const invite = await client.organization.inviteMember({
			email: "invite-user@test.com",
			role: "member",
			organizationId: newUserOrg.id,
			fetchOptions: {
				headers,
			},
		});
		const expected = {
			organizationId: newUserOrg.id,
			email: "invite-user@test.com",
			role: "member",
			status: "pending",
			expiresAt: expect.any(Date),
			inviterId: expect.any(String),
			id: expect.any(String),
		};
		expect(invite.data).toMatchObject(expected);
	});

	it("should not allow inviting a user to an organization that the user is already a member of", async () => {
		const { client, headers } = await getInstance();
		const invite = await client.organization.inviteMember({
			email: "test@test.com",
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		expect(invite.error?.status).toBe(400);
		expect(invite.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});

	it("should error if user is already invited and resend is not set", async () => {
		const { client, headers } = await getInstance();
		// first invite
		const first = await client.organization.inviteMember({
			email: "dupe@test.com",
			role: "member",
			fetchOptions: { headers },
		});
		if (!first.data) throw first.error;
		// second invite without resend should error
		const second = await client.organization.inviteMember({
			email: "dupe@test.com",
			role: "member",
			fetchOptions: { headers },
		});
		expect(second.error?.status).toBe(400);
		expect(second.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION,
		);
	});

	it("should resend an existing invitation and extend expiration", async () => {
		const { client, headers } = await getInstance();
		const first = await client.organization.inviteMember({
			email: "resend@test.com",
			role: "member",
			fetchOptions: { headers },
		});
		if (!first.data) throw first.error;
		const prevExpiresAt = first.data.expiresAt;
		// resend
		const resent = await client.organization.inviteMember({
			email: "resend@test.com",
			role: "member",
			resend: true,
			fetchOptions: { headers },
		});
		if (!resent.data) throw resent.error;
		expect(new Date(resent.data.expiresAt).getTime()).toBeGreaterThan(
			new Date(prevExpiresAt as any).getTime(),
		);
		// id should remain the same when reusing invitation
		expect(resent.data.id).toBe(first.data.id);
	});

	it("should respect invitationLimit and block when pending >= limit", async () => {
		const { client, headers, organization } = await getInstance({
			organizationOptions: {
				invitationLimit: 1,
			},
		});
		// one invite succeeds
		const ok = await client.organization.inviteMember({
			email: "limit1@test.com",
			role: "member",
			organizationId: organization?.id,
			fetchOptions: { headers },
		});
		if (!ok.data) throw ok.error;
		// second invite should be forbidden
		const blocked = await client.organization.inviteMember({
			email: "limit2@test.com",
			role: "member",
			organizationId: organization?.id,
			fetchOptions: { headers },
		});
		expect(blocked.error?.status).toBe(403);
		expect(blocked.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
		);
	});

	it("should forbid inviting with owner role if inviter is not creator", async () => {
		const { client, auth, organization } = await getInstance();
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-user@test.com",
				name: "new user",
				password: "password",
			},
		});
		await auth.api.addMember({
			body: {
				userId: newUser.user.id,
				role: "admin",
				organizationId: organization!.id,
			},
		});
		const res = await client.organization.inviteMember({
			email: "wannabe-owner@test.com",
			role: "owner",
			organizationId: organization!.id,
			fetchOptions: {
				headers: new Headers({ authorization: `Bearer ${newUser.token}` }),
			},
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE,
		);
	});

	it("should error when neither organizationId nor active organization is present", async () => {
		const { client, headers } = await getInstance({ disableDefaultOrg: true });
		const res = await client.organization.inviteMember({
			email: "no-org@test.com",
			role: "member",
			fetchOptions: { headers },
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
		);
	});

	it("should lowercase email and support role array input", async () => {
		const { client, headers } = await getInstance();
		const { data } = await client.organization.inviteMember({
			email: "CaseEmail@Example.com",
			role: ["member"],
			fetchOptions: { headers },
		});
		expect(data?.email).toBe("caseemail@example.com");
		expect(data?.role).toBe("member");
	});

	it("should not allow a member role to invite", async () => {
		const { client, auth, organization } = await getInstance();
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `member-inviter-${crypto.randomUUID()}@test.com`,
				name: "Member User",
				password: "password",
			},
		});
		await auth.api.addMember({
			body: {
				userId: newUser.user.id,
				role: "member",
				organizationId: organization!.id,
			},
		});
		// try inviting with member's token
		const res = await client.organization.inviteMember({
			email: `target-${crypto.randomUUID()}@test.com`,
			role: "member",
			organizationId: organization!.id,
			fetchOptions: {
				headers: new Headers({ authorization: `Bearer ${newUser.token}` }),
			},
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION,
		);
	});

	it("should allow a custom role with invitation.create to invite", async () => {
		const ac = createAccessControl(defaultStatements);
		const inviter = ac.newRole({ invitation: ["create"] });
		const { client, auth, organization } = await getInstance({
			organizationOptions: { ac, roles: { inviter, ...defaultRoles } },
		});
		const inviterUser = await auth.api.signUpEmail({
			body: {
				email: `inviter-${crypto.randomUUID()}@test.com`,
				name: "Inviter User",
				password: "password",
			},
		});
		const inviterMember = await auth.api.addMember({
			body: {
				userId: inviterUser.user.id,
				role: "inviter" as "admin",
				organizationId: organization!.id,
			},
		});
		if (!inviterMember) throw new Error("inviter member not created");
		const res = await client.organization.inviteMember({
			email: `new-email@test.com`,
			role: "inviter" as "admin",
			organizationId: organization!.id,
			fetchOptions: {
				headers: new Headers({ authorization: `Bearer ${inviterUser.token}` }),
			},
		});
		expect(res.error).toBeNull();
		expect(res.data).toMatchObject({
			email: "new-email@test.com",
			organizationId: organization!.id,
			status: "pending",
			role: "inviter",
			inviterId: inviterUser.user.id,
			expiresAt: expect.any(Date),
			id: expect.any(String),
		});
	});

	it("should not allow a custom role with invitation.create to invite", async () => {
		const ac = createAccessControl(defaultStatements);
		const inviter = ac.newRole({ invitation: ["cancel"] });
		const { client, auth, organization } = await getInstance({
			organizationOptions: { ac, roles: { inviter, ...defaultRoles } },
		});
		const inviterUser = await auth.api.signUpEmail({
			body: {
				email: `inviter-${crypto.randomUUID()}@test.com`,
				name: "Inviter User",
				password: "password",
			},
		});
		const inviterMember = await auth.api.addMember({
			body: {
				userId: inviterUser.user.id,
				role: "inviter" as "admin",
				organizationId: organization!.id,
			},
		});
		if (!inviterMember) throw new Error("inviter member not created");
		const res = await client.organization.inviteMember({
			email: `new-email@test.com`,
			role: "member",
			organizationId: organization!.id,
			fetchOptions: {
				headers: new Headers({ authorization: `Bearer ${inviterUser.token}` }),
			},
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION,
		);
	});

	it("should call before/after hooks and allow before hook to modify data", async () => {
		const beforeCalled = vi.fn();
		const afterCalled = vi.fn();
		const { client, headers, organization } = await getInstance({
			organizationOptions: {
				organizationHooks: {
					beforeCreateInvitation: async ({ invitation }) => {
						beforeCalled();
						return { data: { ...invitation, role: "admin" } };
					},
					afterCreateInvitation: async () => {
						afterCalled();
					},
				},
			},
		});
		const res = await client.organization.inviteMember({
			email: "hook@test.com",
			role: "member",
			organizationId: organization?.id,
			fetchOptions: { headers },
		});
		if (!res.data) throw res.error;
		expect(beforeCalled).toHaveBeenCalled();
		expect(afterCalled).toHaveBeenCalled();
		expect(res.data.role).toBe("admin");
	});
});
