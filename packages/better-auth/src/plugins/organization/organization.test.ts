import { describe, expect, expectTypeOf } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "./organization";
import { createAuthClient } from "../../client";
import { organizationClient } from "./client";

describe("organization", async (it) => {
	const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
		plugins: [organization()],
	});
	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	let orgId: string;
	it("create organization", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.create({
			name: "test",
			slug: "test",
			metadata: {
				test: "test",
			},
			options: {
				headers,
			},
		});
		orgId = organization.data?.id as string;
		expect(organization.data?.name).toBeDefined();
		expect(organization.data?.metadata).toBeDefined();
		expect(organization.data?.members.length).toBe(1);
		expect(organization.data?.members[0].role).toBe("owner");
	});

	it("should allow listing organizations", async () => {
		const { headers } = await signInWithTestUser();
		const organizations = await client.organization.list({
			options: {
				headers,
			},
		});
		expect(organizations.data?.length).toBe(1);
	});

	it("should allow updating organization", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.update({
			orgId,
			data: {
				name: "test2",
			},
			options: {
				headers,
			},
		});
		expect(organization.data?.name).toBe("test2");
	});

	it("should allow activating organization and set session", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.activate({
			orgId,
			options: {
				headers,
			},
		});

		expect(organization.data?.id).toBe(orgId);
		const session = await client.session({
			options: {
				headers,
			},
		});
		expect((session.data?.session as any).activeOrganizationId).toBe(orgId);
	});

	it("invites user to organization", async () => {
		const newUser = {
			email: "test2@test.com",
			password: "test123456",
			name: "test2",
		};
		const { headers } = await signInWithTestUser();
		const invite = await client.organization.inviteMember({
			organizationId: orgId,
			email: newUser.email,
			role: "member",
			options: {
				headers,
			},
		});
		if (!invite.data) throw new Error("Invitation not created");
		expect(invite.data.email).toBe("test2@test.com");
		expect(invite.data.role).toBe("member");
		await client.signUp.email({
			email: newUser.email,
			password: newUser.password,
			name: newUser.name,
		});
		const { headers: headers2 } = await signInWithUser(
			newUser.email,
			newUser.password,
		);

		const wrongInvitation = await client.organization.acceptInvitation({
			invitationId: "123",
			options: {
				headers: headers2,
			},
		});
		expect(wrongInvitation.error?.status).toBe(400);

		const wrongPerson = await client.organization.acceptInvitation({
			invitationId: invite.data.id,
			options: {
				headers,
			},
		});
		expect(wrongPerson.error?.status).toBe(400);

		const invitation = await client.organization.acceptInvitation({
			invitationId: invite.data.id,
			options: {
				headers: headers2,
			},
		});
		expect(invitation.data?.invitation.status).toBe("accepted");
		const invitedUserSession = await client.session({
			options: {
				headers: headers2,
			},
		});
		expect((invitedUserSession.data?.session as any).activeOrganizationId).toBe(
			orgId,
		);
	});

	it("should allow updating member", async () => {
		const { headers } = await signInWithTestUser();
		const org = await client.organization.getFull({
			query: {
				orgId,
			},
			options: {
				headers,
			},
		});
		if (!org.data) throw new Error("Organization not found");
		expect(org.data?.members[1].role).toBe("member");
		const member = await client.organization.updateMemberRole({
			organizationId: org.data.id,
			memberId: org.data.members[1].id,
			role: "admin",
			options: {
				headers,
			},
		});
		expect(member.data?.role).toBe("admin");
	});

	it("should allow removing member from organization", async () => {
		const { headers } = await signInWithTestUser();
		const orgBefore = await client.organization.getFull({
			query: {
				orgId,
			},
			options: {
				headers,
			},
		});

		expect(orgBefore.data?.members.length).toBe(2);
		const removedMember = await client.organization.removeMember({
			organizationId: orgId,
			memberIdOrEmail: "test2@test.com",
			options: {
				headers,
			},
		});
		expect(removedMember.data?.member.email).toBe("test2@test.com");

		const org = await client.organization.getFull({
			query: {
				orgId,
			},
			options: {
				headers,
			},
		});
		expect(org.data?.members.length).toBe(1);
	});

	it("shouldn't allow removing owner from organization", async () => {
		const { headers } = await signInWithTestUser();
		const org = await client.organization.getFull({
			query: {
				orgId,
			},
			options: {
				headers,
			},
		});
		if (!org.data) throw new Error("Organization not found");
		expect(org.data.members[0].role).toBe("owner");
		const removedMember = await client.organization.removeMember({
			organizationId: org.data.id,
			memberIdOrEmail: org.data.members[0].id,
			options: {
				headers,
			},
		});
		expect(removedMember.error?.status).toBe(400);
	});

	it("should validate permissions", async () => {
		const { headers } = await signInWithTestUser();
		await client.organization.activate({
			orgId,
			options: {
				headers,
			},
		});
		const hasPermission = await client.organization.hasPermission({
			permission: {
				member: ["update"],
			},
			options: {
				headers,
			},
		});
		expect(hasPermission.data?.success).toBe(true);
	});

	it("should allow deleting organization", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.delete({
			orgId,
			options: {
				headers,
			},
		});
		expect(organization.data).toBe(orgId);
	});

	it("should have server side methods", async () => {
		expectTypeOf(auth.api.createOrganization).toBeFunction();
		expectTypeOf(auth.api.getInvitation).toBeFunction();
	});
});
