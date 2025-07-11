import { describe, expect, expectTypeOf, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "./organization";
import { createAuthClient } from "../../client";
import { organizationClient } from "./client";
import { createAccessControl } from "../access";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { APIError } from "better-call";

describe("organization", async (it) => {
	const { auth, signInWithTestUser, signInWithUser, cookieSetter } =
		await getTestInstance({
			user: {
				modelName: "users",
			},
			plugins: [
				organization({
					membershipLimit: 6,
					async sendInvitationEmail(data, request) {},
					schema: {
						organization: {
							modelName: "team",
						},
						member: {
							modelName: "teamMembers",
							fields: {
								userId: "user_id",
							},
						},
					},
					invitationLimit: 3,
				}),
			],
			logger: {
				level: "error",
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

	let organizationId: string;
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
		organizationId = organization.data?.id as string;
		expect(organization.data?.name).toBeDefined();
		expect(organization.data?.metadata).toBeDefined();
		expect(organization.data?.members.length).toBe(1);
		expect(organization.data?.members[0].role).toBe("owner");
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect((session.data?.session as any).activeOrganizationId).toBe(
			organizationId,
		);
	});
	it("should check if organization slug is available", async () => {
		const { headers } = await signInWithTestUser();

		const unusedSlug = await client.organization.checkSlug({
			slug: "unused-slug",
			fetchOptions: {
				headers,
			},
		});
		expect(unusedSlug.data?.status).toBe(true);

		const existingSlug = await client.organization.checkSlug({
			slug: "test",
			fetchOptions: {
				headers,
			},
		});
		expect(existingSlug.error?.status).toBe(400);
		expect(existingSlug.error?.message).toBe("slug is taken");
	});

	it("should create organization directly in the server without cookie", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		const organization = await auth.api.createOrganization({
			body: {
				name: "test2",
				slug: "test2",
				userId: session.data?.session.userId,
			},
		});

		expect(organization?.name).toBe("test2");
		expect(organization?.members.length).toBe(1);
		expect(organization?.members[0].role).toBe("owner");
	});

	it("should allow listing organizations", async () => {
		const organizations = await client.organization.list({
			fetchOptions: {
				headers,
			},
		});
		expect(organizations.data?.length).toBe(2);
	});

	it("should allow updating organization", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.update({
			organizationId,
			data: {
				name: "test2",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(organization.data?.name).toBe("test2");
	});

	it("should allow updating organization metadata", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.update({
			organizationId,
			data: {
				metadata: {
					test: "test2",
				},
			},
			fetchOptions: {
				headers,
			},
		});
		expect(organization.data?.metadata?.test).toBe("test2");
	});

	it("should allow activating organization and set session", async () => {
		const organization = await client.organization.setActive({
			organizationId,
			fetchOptions: {
				headers,
			},
		});

		expect(organization.data?.id).toBe(organizationId);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect((session.data?.session as any).activeOrganizationId).toBe(
			organizationId,
		);
	});

	it("should allow getting full org on server", async () => {
		const org = await auth.api.getFullOrganization({
			headers,
		});
		expect(org?.members.length).toBe(1);
	});

	it("should allow getting full org on server using slug", async () => {
		const org = await auth.api.getFullOrganization({
			headers,
			query: {
				organizationSlug: "test",
			},
		});
		expect(org?.members.length).toBe(1);
	});

	it.each([
		{
			role: "owner",
			newUser: {
				email: "test2@test.com",
				password: "test123456",
				name: "test2",
			},
		},
		{
			role: "admin",
			newUser: {
				email: "test3@test.com",
				password: "test123456",
				name: "test3",
			},
		},
		{
			role: "member",
			newUser: {
				email: "test4@test.com",
				password: "test123456",
				name: "test4",
			},
		},
	])("invites user to organization with role", async ({ role, newUser }) => {
		const { headers } = await signInWithTestUser();
		const invite = await client.organization.inviteMember({
			organizationId: organizationId,
			email: newUser.email,
			role: role as "owner",
			fetchOptions: {
				headers,
			},
		});
		if (!invite.data) throw new Error("Invitation not created");
		expect(invite.data.email).toBe(newUser.email);
		expect(invite.data.role).toBe(role);
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
			organizationId,
		);
	});

	it("should create invitation with multiple roles", async () => {
		const invite = await client.organization.inviteMember({
			organizationId: organizationId,
			email: "test5@test.com",
			role: ["admin", "member"],
			fetchOptions: {
				headers,
			},
		});
		expect(invite.data?.role).toBe("admin,member");
	});

	it("should allow getting a member", async () => {
		const { headers } = await signInWithTestUser();
		await client.organization.setActive({
			organizationId,
			fetchOptions: {
				headers,
			},
		});
		const member = await client.organization.getActiveMember({
			fetchOptions: {
				headers,
			},
		});
		expect(member.data).toMatchObject({
			role: "owner",
		});
	});

	it("should allow updating member", async () => {
		const { headers, user } = await signInWithTestUser();
		const org = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
			},
		});
		if (!org.data) throw new Error("Organization not found");
		expect(org.data?.members[3].role).toBe("member");
		const member = await client.organization.updateMemberRole({
			organizationId: org.data.id,
			memberId: org.data.members[3].id,
			role: "admin",
			fetchOptions: {
				headers,
			},
		});
		expect(member.data?.role).toBe("admin");
	});

	it("should allow setting multiple roles", async () => {
		const { headers } = await signInWithTestUser();
		const org = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
			},
		});
		const c = await client.organization.updateMemberRole({
			organizationId: org.data?.id as string,
			role: ["member", "admin"],
			memberId: org.data?.members[1].id as string,
			fetchOptions: {
				headers,
			},
		});
		expect(c.data?.role).toBe("member,admin");
	});

	it("should allow setting multiple roles when you have multiple yourself", async () => {
		const { headers, user } = await signInWithTestUser();
		const org = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
			},
		});

		const activeMember = org?.data?.members.find((m) => m.userId === user.id);

		expect(activeMember?.role).toBe("owner");

		const c1 = await client.organization.updateMemberRole({
			organizationId: org.data?.id as string,
			role: ["owner", "admin"],
			memberId: activeMember?.id as string,
			fetchOptions: {
				headers,
			},
		});

		expect(c1.data?.role).toBe("owner,admin");

		const c2 = await client.organization.updateMemberRole({
			organizationId: org.data?.id as string,
			role: ["owner"],
			memberId: activeMember!.id as string,
			fetchOptions: {
				headers,
			},
		});

		expect(c2.data?.role).toBe("owner");
	});

	const adminUser = {
		email: "test3@test.com",
		password: "test123456",
		name: "test3",
	};

	it("should not allow inviting member with a creator role unless they are creator", async () => {
		const { headers } = await signInWithUser(
			adminUser.email,
			adminUser.password,
		);
		const invite = await client.organization.inviteMember({
			organizationId: organizationId,
			email: adminUser.email,
			role: "owner",
			fetchOptions: {
				headers,
			},
		});
		expect(invite.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE,
		);
	});

	it("should allow leaving organization", async () => {
		const newUser = {
			email: "leave@org.com",
			name: "leaving member",
			password: "password",
		};
		const headers = new Headers();
		const res = await client.signUp.email(newUser, {
			onSuccess: cookieSetter(headers),
		});
		const member = await auth.api.addMember({
			body: {
				organizationId,
				userId: res.data?.user.id!,
				role: "admin",
			},
		});
		const leaveRes = await client.organization.leave(
			{
				organizationId,
			},
			{
				headers,
			},
		);
		expect(leaveRes.data).toMatchObject({
			userId: res.data?.user.id!,
		});
	});

	it("shouldn't allow updating owner role if you're not owner", async () => {
		const { headers } = await signInWithTestUser();
		const { members } = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		const { headers: adminHeaders } = await signInWithUser(
			adminUser.email,
			adminUser.password,
		);

		const res = await client.organization.updateMemberRole({
			organizationId: organizationId,
			role: "admin",
			memberId: members.find((m) => m.role === "owner")?.id!,
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res.error?.status).toBe(403);
	});

	it("should allow removing member from organization", async () => {
		const { headers } = await signInWithTestUser();
		const orgBefore = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(orgBefore.data?.members.length).toBe(4);
		await client.organization.removeMember({
			organizationId: organizationId,
			memberIdOrEmail: adminUser.email,
			fetchOptions: {
				headers,
			},
		});
		const org = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(org.data?.members.length).toBe(3);
	});

	it("shouldn't allow removing last owner from organization", async () => {
		const { headers } = await signInWithTestUser();
		const org = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
			},
		});

		if (!org.data) throw new Error("Organization not found");
		const removedOwner = await client.organization.removeMember({
			organizationId: org.data.id,
			memberIdOrEmail: org.data?.members.find((m) => m.role === "owner")!.id,
			fetchOptions: {
				headers,
			},
		});
		expect(removedOwner.error?.status).toBe(400);
	});

	it("should validate permissions", async () => {
		await client.organization.setActive({
			organizationId,
			fetchOptions: {
				headers,
			},
		});
		const hasPermission = await client.organization.hasPermission({
			permissions: {
				member: ["update"],
			},
			fetchOptions: {
				headers,
			},
		});
		expect(hasPermission.data?.success).toBe(true);

		const hasMultiplePermissions = await client.organization.hasPermission({
			permissions: {
				member: ["update"],
				invitation: ["create"],
			},
			fetchOptions: {
				headers,
			},
		});
		expect(hasMultiplePermissions.data?.success).toBe(true);
	});

	it("should allow deleting organization", async () => {
		const { headers: adminHeaders } = await signInWithUser(
			adminUser.email,
			adminUser.password,
		);

		const r = await client.organization.delete({
			organizationId,
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		const org = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(org.error?.status).toBe(403);
	});

	it("should have server side methods", async () => {
		expectTypeOf(auth.api.createOrganization).toBeFunction();
		expectTypeOf(auth.api.getInvitation).toBeFunction();
	});

	it("should add member on the server directly", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-member@email.com",
				password: "password",
				name: "new member",
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				Authorization: `Bearer ${newUser?.token}`,
			}),
		});
		const org = await auth.api.createOrganization({
			body: {
				name: "test2",
				slug: "test3",
			},
			headers,
		});
		const member = await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: session?.user.id!,
				role: "admin",
			},
		});
		expect(member?.role).toBe("admin");
	});

	it("should add member on the server with multiple roles", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-member-mr@email.com",
				password: "password",
				name: "new member mr",
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				Authorization: `Bearer ${newUser?.token}`,
			}),
		});
		const org = await auth.api.createOrganization({
			body: {
				name: "test2",
				slug: "test4",
			},
			headers,
		});
		const member = await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: session?.user.id!,
				role: ["admin", "member"],
			},
		});
		expect(member?.role).toBe("admin,member");
	});

	it("should respect membershipLimit when adding members to organization", async () => {
		const org = await auth.api.createOrganization({
			body: {
				name: "test-5-membership-limit",
				slug: "test-5-membership-limit",
			},
			headers,
		});

		const users = [
			"user1@emial.com",
			"user2@email.com",
			"user3@email.com",
			"user4@email.com",
		];

		for (const user of users) {
			const newUser = await auth.api.signUpEmail({
				body: {
					email: user,
					password: "password",
					name: user,
				},
			});
			const session = await auth.api.getSession({
				headers: new Headers({
					Authorization: `Bearer ${newUser?.token}`,
				}),
			});
			await auth.api.addMember({
				body: {
					organizationId: org?.id,
					userId: session?.user.id!,
					role: "admin",
				},
			});
		}

		const userOverLimit = {
			email: "shouldthrowerror@email.com",
			password: "password",
			name: "name",
		};
		const userOverLimit2 = {
			email: "shouldthrowerror2@email.com",
			password: "password",
			name: "name",
		};

		// test API method
		const newUser = await auth.api.signUpEmail({
			body: {
				email: userOverLimit.email,
				password: userOverLimit.password,
				name: userOverLimit.name,
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				Authorization: `Bearer ${newUser?.token}`,
			}),
		});
		await auth.api
			.addMember({
				body: {
					organizationId: org?.id,
					userId: session?.user.id!,
					role: "admin",
				},
			})
			.catch((e: APIError) => {
				expect(e).not.toBeNull();
				expect(e).toBeInstanceOf(APIError);
				expect(e.message).toBe(
					ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
				);
			});
		const invite = await client.organization.inviteMember({
			organizationId: org?.id,
			email: userOverLimit2.email,
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		if (!invite.data) throw new Error("Invitation not created");
		await client.signUp.email({
			email: userOverLimit.email,
			password: userOverLimit.password,
			name: userOverLimit.name,
		});
		const { res, headers: headers2 } = await signInWithUser(
			userOverLimit2.email,
			userOverLimit2.password,
		);
		await client.signUp.email(
			{
				email: userOverLimit2.email,
				password: userOverLimit2.password,
				name: userOverLimit2.name,
			},
			{
				onSuccess: cookieSetter(headers2),
			},
		);

		const invitation = await client.organization.acceptInvitation({
			invitationId: invite.data.id,
			fetchOptions: {
				headers: headers2,
			},
		});
		expect(invitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
		);

		const getFullOrganization = await client.organization.getFullOrganization({
			query: {
				organizationId: org?.id,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(getFullOrganization.data?.members.length).toBe(6);
	});
});

describe("access control", async (it) => {
	const ac = createAccessControl({
		project: ["create", "read", "update", "delete"],
		sales: ["create", "read", "update", "delete"],
	});
	const owner = ac.newRole({
		project: ["create", "delete", "update", "read"],
		sales: ["create", "read", "update", "delete"],
	});
	const admin = ac.newRole({
		project: ["create", "read"],
		sales: ["create", "read"],
	});
	const member = ac.newRole({
		project: ["read"],
		sales: ["read"],
	});
	const { auth, customFetchImpl, sessionSetter, signInWithTestUser } =
		await getTestInstance({
			plugins: [
				organization({
					ac,
					roles: {
						admin,
						member,
						owner,
					},
				}),
			],
		});

	const {
		organization: { checkRolePermission, hasPermission, create },
	} = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			organizationClient({
				ac,
				roles: {
					admin,
					member,
					owner,
				},
			}),
		],
		fetchOptions: {
			customFetchImpl,
		},
	});

	const { headers } = await signInWithTestUser();

	const org = await create(
		{
			name: "test",
			slug: "test",
			metadata: {
				test: "test",
			},
		},
		{
			onSuccess: sessionSetter(headers),
			headers,
		},
	);

	it("should return success", async () => {
		const canCreateProject = checkRolePermission({
			role: "admin",
			permissions: {
				project: ["create"],
			},
		});
		expect(canCreateProject).toBe(true);

		// To be removed when `permission` will be removed entirely
		const canCreateProjectLegacy = checkRolePermission({
			role: "admin",
			permission: {
				project: ["create"],
			},
		});
		expect(canCreateProjectLegacy).toBe(true);

		const canCreateProjectServer = await hasPermission({
			permissions: {
				project: ["create"],
			},
			fetchOptions: {
				headers,
			},
		});
		expect(canCreateProjectServer.data?.success).toBe(true);
	});

	it("should return not success", async () => {
		const canCreateProject = checkRolePermission({
			role: "admin",
			permissions: {
				project: ["delete"],
			},
		});
		expect(canCreateProject).toBe(false);
	});

	it("should return not success", async () => {
		const res = checkRolePermission({
			role: "admin",
			permissions: {
				project: ["read"],
				sales: ["delete"],
			},
		});
		expect(res).toBe(false);
	});
});

describe("invitation limit", async () => {
	const { customFetchImpl, signInWithTestUser } = await getTestInstance({
		plugins: [
			organization({
				invitationLimit: 1,
				async sendInvitationEmail(data, request) {},
			}),
		],
	});
	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl,
		},
	});
	const { headers } = await signInWithTestUser();
	const org = await client.organization.create(
		{
			name: "test",
			slug: "test",
		},
		{
			headers,
		},
	);

	it("should invite member to organization", async () => {
		const invite = await client.organization.inviteMember({
			organizationId: org.data?.id as string,
			email: "test6@test.com",
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		expect(invite.data?.status).toBe("pending");
	});

	it("should throw error when invitation limit is reached", async () => {
		const invite = await client.organization.inviteMember({
			organizationId: org.data?.id as string,
			email: "test7@test.com",
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		expect(invite.error?.status).toBe(403);
		expect(invite.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
		);
	});

	it("should throw error with custom invitation limit", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					invitationLimit: async (data, ctx) => {
						return 0;
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		await auth.api
			.createInvitation({
				body: {
					email: "test8@test.com",
					role: "member",
					organizationId: org?.id as string,
				},
				headers,
			})
			.catch((e: APIError) => {
				expect(e.message).toBe(
					ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
				);
			});
	});
});

describe("cancel pending invitations on re-invite", async () => {
	const { customFetchImpl, signInWithTestUser } = await getTestInstance({
		plugins: [
			organization({
				cancelPendingInvitationsOnReInvite: true,
			}),
		],
	});
	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl,
		},
	});
	const { headers } = await signInWithTestUser();
	const org = await client.organization.create(
		{
			name: "test",
			slug: "test",
		},
		{
			headers,
		},
	);

	it("should cancel pending invitations on re-invite", async () => {
		const invite = await client.organization.inviteMember(
			{
				organizationId: org.data?.id as string,
				email: "test9@test.com",
				role: "member",
			},
			{
				headers,
			},
		);
		expect(invite.data?.status).toBe("pending");
		const invite2 = await client.organization.inviteMember(
			{
				organizationId: org.data?.id as string,
				email: "test9@test.com",
				role: "member",
				resend: true,
			},
			{
				headers,
			},
		);
		expect(invite2.data?.status).toBe("pending");
		const listInvitations = await client.organization.listInvitations({
			fetchOptions: {
				headers,
			},
		});
		expect(
			listInvitations.data?.filter((invite) => invite.status === "pending")
				.length,
		).toBe(1);
	});
});

describe("types", async (it) => {
	const { auth } = await getTestInstance({
		plugins: [organization({})],
	});

	it("should infer active organization", async () => {
		type ActiveOrganization = typeof auth.$Infer.ActiveOrganization;

		type FullOrganization = Awaited<
			ReturnType<typeof auth.api.getFullOrganization>
		>;
		expectTypeOf<FullOrganization>().toEqualTypeOf<ActiveOrganization>();
	});
});
