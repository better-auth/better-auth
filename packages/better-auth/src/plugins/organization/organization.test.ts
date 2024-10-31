import { describe, expect, expectTypeOf } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "./organization";
import { createAuthClient } from "../../client";
import { organizationClient } from "./client";

describe("organization", async (it) => {
	const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
		plugins: [
			organization({
				async sendInvitationEmail(data, request) {},
			}),
		],
		logger: {
			verboseLogging: true,
		},
	});

	const { headers } = await signInWithTestUser();
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
		const organization = await client.organization.create({
			name: "test",
			slug: "test",
			metadata: {
				test: "test",
			},
			fetchOptions: {
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
		const organizations = await client.organization.list({
			fetchOptions: {
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
			fetchOptions: {
				headers,
			},
		});
		expect(organization.data?.name).toBe("test2");
	});

	it("should allow activating organization and set session", async () => {
		const organization = await client.organization.activate({
			orgId,
			fetchOptions: {
				headers,
			},
		});

		expect(organization.data?.id).toBe(orgId);
		const session = await client.getSession({
			fetchOptions: {
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
			fetchOptions: {
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
			fetchOptions: {
				headers: headers2,
			},
		});
		expect(wrongInvitation.error?.status).toBe(400);

		const wrongPerson = await client.organization.acceptInvitation({
			invitationId: invite.data.id,
			fetchOptions: {
				headers,
			},
		});
		expect(wrongPerson.error?.status).toBe(403);

		const invitation = await client.organization.acceptInvitation({
			invitationId: invite.data.id,
			fetchOptions: {
				headers: headers2,
			},
		});
		expect(invitation.data?.invitation.status).toBe("accepted");
		const invitedUserSession = await client.getSession({
			fetchOptions: {
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
			fetchOptions: {
				headers,
			},
		});
		if (!org.data) throw new Error("Organization not found");
		expect(org.data?.members[1].role).toBe("member");
		const member = await client.organization.updateMemberRole({
			organizationId: org.data.id,
			memberId: org.data.members[1].id,
			role: "admin",
			fetchOptions: {
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
			fetchOptions: {
				headers,
			},
		});

		expect(orgBefore.data?.members.length).toBe(2);
		const removedMember = await client.organization.removeMember({
			organizationId: orgId,
			memberIdOrEmail: "test2@test.com",
			fetchOptions: {
				headers,
			},
		});
		expect(removedMember.data?.member.email).toBe("test2@test.com");

		const org = await client.organization.getFull({
			query: {
				orgId,
			},
			fetchOptions: {
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
			fetchOptions: {
				headers,
			},
		});
		if (!org.data) throw new Error("Organization not found");
		expect(org.data.members[0].role).toBe("owner");
		const removedMember = await client.organization.removeMember({
			organizationId: org.data.id,
			memberIdOrEmail: org.data.members[0].id,
			fetchOptions: {
				headers,
			},
		});
		expect(removedMember.error?.status).toBe(400);
	});

	it("should validate permissions", async () => {
		await client.organization.activate({
			orgId,
			fetchOptions: {
				headers,
			},
		});
		const hasPermission = await client.organization.hasPermission({
			permission: {
				member: ["update"],
			},
			fetchOptions: {
				headers,
			},
		});
		expect(hasPermission.data?.success).toBe(true);
	});

	it("should allow deleting organization", async () => {
		const res = await client.organization.delete({
			orgId,
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toBe(orgId);
	});

	it("should have server side methods", async () => {
		expectTypeOf(auth.api.createOrganization).toBeFunction();
		expectTypeOf(auth.api.getInvitation).toBeFunction();
	});
});
