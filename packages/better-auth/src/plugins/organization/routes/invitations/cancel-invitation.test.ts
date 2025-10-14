import { describe, expect } from "vitest";
import { getOrgTestInstance } from "../../test-utils";
import type { Invitation } from "../../schema";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";

describe("cancel invitation", async (it) => {
	it("should cancel an invitation", async () => {
		const { client, headers, organization, $ctx } = await getOrgTestInstance();
		const invite = await client.organization.inviteMember({
			organizationId: organization!.id,
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		const canceledInvitation = await client.organization.cancelInvitation({
			invitationId: invite.id as string,
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		const invitation = await $ctx.adapter.findOne<Invitation>({
			model: "invitation",
			where: [{ field: "id", value: invite.id }],
		});
		expect(invitation?.status).toBe("canceled");
		expect(canceledInvitation.status).toBe("canceled");
	});

	it("should not allow non member to cancel an invitation", async () => {
		const { client, headers, organization } = await getOrgTestInstance();
		const invite = await client.organization.inviteMember({
			organizationId: organization!.id,
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		const nonMember = await client.signUp.email({
			email: "test3@test.com",
			password: "password",
			name: "test3",
		});
		const canceledInvitation = await client.organization.cancelInvitation({
			invitationId: invite.id as string,
			fetchOptions: {
				headers: new Headers({
					authorization: `Bearer ${nonMember.data?.token}`,
				}),
			},
		});
		expect(canceledInvitation.error?.status).toBe(403);
		expect(canceledInvitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.NOT_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});

	it("should not allow cancelling invitation if a member doesn't have invitation.cancel permission", async () => {
		const { client, headers, organization, auth } = await getOrgTestInstance();
		const invite = await client.organization.inviteMember({
			organizationId: organization!.id,
			email: "test2@test.com",
			role: "member",
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		const nonMember = await client.signUp.email({
			email: "test3@test.com",
			password: "password",
			name: "test3",
		});
		await auth.api.addMember({
			body: {
				organizationId: organization!.id,
				userId: nonMember.data?.user.id as string,
				role: "member",
			},
		});
		const canceledInvitation = await client.organization.cancelInvitation({
			invitationId: invite.id as string,
			fetchOptions: {
				headers: new Headers({
					authorization: `Bearer ${nonMember.data?.token}`,
				}),
			},
		});
		expect(canceledInvitation.error?.status).toBe(403);
		expect(canceledInvitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION,
		);
	});
});
