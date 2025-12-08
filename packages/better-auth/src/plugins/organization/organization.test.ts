import type { Prettify } from "better-call";
import { APIError } from "better-call";
import { describe, expect, expectTypeOf, it } from "vitest";
import { memoryAdapter } from "../../adapters/memory-adapter";
import type {
	BetterFetchError,
	PreinitializedWritableAtom,
} from "../../client";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { nextCookies } from "../../integrations/next-js";
import { getTestInstance } from "../../test-utils/test-instance";
import type { User } from "../../types";
import type { PrettifyDeep } from "../../types/helper";
import { createAccessControl } from "../access";
import { admin } from "../admin";
import { adminAc, defaultStatements, memberAc, ownerAc } from "./access";
import { inferOrgAdditionalFields, organizationClient } from "./client";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { organization } from "./organization";
import type {
	InferInvitation,
	InferMember,
	InferTeam,
	InvitationStatus,
} from "./schema";
import type { OrganizationOptions } from "./types";

describe("organization type", () => {
	it("empty org type should works", () => {
		expectTypeOf({} satisfies OrganizationOptions);
		expectTypeOf({ schema: {} } satisfies OrganizationOptions);
	});
});

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
			databaseHooks: {
				session: {
					update: {
						before: async (data, ctx) => {},
					},
				},
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

	it("should have correct schema order when dynamicAccessControl is enabled", () => {
		const orgPlugin = organization({
			dynamicAccessControl: {
				enabled: true,
			},
		});

		const schema = orgPlugin.schema;

		// Check that organization table is defined before organizationRole table
		const organizationIndex = Object.keys(schema).indexOf("organization");
		const organizationRoleIndex =
			Object.keys(schema).indexOf("organizationRole");

		expect(organizationIndex).toBeLessThan(organizationRoleIndex);
		expect(organizationIndex).not.toBe(-1);
		expect(organizationRoleIndex).not.toBe(-1);
	});

	let organizationId: string;
	let organization2Id: string;
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
		expect(organization.data?.members[0]?.role).toBe("owner");
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

	it("should prevent creating organization with empty slug", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.create({
			name: "test-empty-slug",
			slug: "",
			fetchOptions: {
				headers,
			},
		});
		expect(organization.error?.status).toBe(400);
	});

	it("should prevent creating organization with empty name", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.create({
			name: "",
			slug: "test-empty-name",
			fetchOptions: {
				headers,
			},
		});
		expect(organization.error?.status).toBe(400);
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

		organization2Id = organization?.id as string;
		expect(organization?.name).toBe("test2");
		expect(organization?.members.length).toBe(1);
		expect(organization?.members[0]?.role).toBe("owner");
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

	it("should prevent updating organization to duplicate slug", async () => {
		const { headers } = await signInWithTestUser();

		// Try to update organization2 (slug: "test2") to use organization1's slug ("test")
		const organization = await client.organization.update({
			organizationId: organization2Id,
			data: {
				slug: "test",
			},
			fetchOptions: {
				headers,
			},
		});

		// This should fail with duplicate slug error
		expect(organization.error?.status).toBe(400);
		expect(organization.error?.message).toContain(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_SLUG_ALREADY_TAKEN,
		);
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

	it("should prevent updating organization to empty slug", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.update({
			organizationId,
			data: {
				slug: "",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(organization.error?.status).toBe(400);
	});

	it("should prevent updating organization to empty name", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.update({
			organizationId,
			data: {
				name: "",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(organization.error?.status).toBe(400);
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
	it("should allow activating organization by slug", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await client.organization.setActive({
			organizationSlug: "test2",
			fetchOptions: {
				headers,
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect((session.data?.session as any).activeOrganizationId).toBe(
			organization2Id,
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
			invitationId: invite.data!.id!,
			fetchOptions: {
				headers,
			},
		});
		expect(wrongPerson.error?.status).toBe(403);

		const invitation = await client.organization.acceptInvitation({
			invitationId: invite.data!.id!,
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

	it("should not allow inviting a user twice regardless of email casing", async () => {
		const rng = crypto.randomUUID();
		const user = {
			email: `${rng}@email.com`,
			password: rng,
			name: rng,
		};
		const { headers } = await signInWithTestUser();

		const invite = await client.organization.inviteMember({
			organizationId,
			email: user.email,
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		if (!invite.data) throw new Error("Invitation not created");
		expect(invite.data.createdAt).toBeInstanceOf(Date);
		expect(invite.data.email).toBe(user.email);

		const inviteAgain = await client.organization.inviteMember({
			organizationId,
			email: user.email,
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		expect(inviteAgain.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION,
		);

		const inviteAgainUpper = await client.organization.inviteMember({
			organizationId,
			email: user.email.toUpperCase(),
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		expect(inviteAgainUpper.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION,
		);

		await client.signUp.email({
			email: user.email,
			password: user.password,
			name: user.name,
		});
		const { headers: userHeaders } = await signInWithUser(
			user.email,
			user.password,
		);
		const acceptRes = await client.organization.acceptInvitation({
			invitationId: invite.data!.id!,
			fetchOptions: {
				headers: userHeaders,
			},
		});
		expect(acceptRes.data?.invitation.status).toBe("accepted");

		const inviteMemberAgain = await client.organization.inviteMember({
			organizationId,
			email: user.email,
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		expect(inviteMemberAgain.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
		);

		const inviteMemberAgainUpper = await client.organization.inviteMember({
			organizationId,
			email: user.email.toUpperCase(),
			role: "member",
			fetchOptions: {
				headers,
			},
		});
		expect(inviteMemberAgainUpper.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
		);
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
		const memberUser = org.data.members.find((x: any) => x.role === "member");
		if (!memberUser) throw new Error("Member not found");
		const member = await client.organization.updateMemberRole({
			organizationId: org.data!.id,
			memberId: memberUser!.id,
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
			organizationId: org.data!.id,
			role: ["member", "admin"],
			memberId: org.data!.members.find((m) => m.role === "member")!.id,
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

		const activeMember = org?.data?.members.find(
			(m) => m.userId === user.id && m.role === "owner",
		);
		if (!activeMember) throw new Error("Active member not found");
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

		await client.organization.updateMemberRole({
			organizationId: org.data?.id as string,
			role: ["admin"],
			memberId: activeMember!.id as string,
			fetchOptions: {
				headers,
			},
		});
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

		expect(orgBefore.data?.members.length).toBe(5);
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
		expect(org.data?.members.length).toBe(4);
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
		const owner = org.data?.members.find((m) => m.role === "owner")!;
		const removedOwner = await client.organization.removeMember({
			organizationId: org.data.id,
			memberIdOrEmail: owner.id,
			fetchOptions: {
				headers,
			},
		});

		expect(removedOwner.error?.status).toBe(400);

		const res = await client.organization.updateMemberRole({
			organizationId: organizationId,
			role: ["owner", "admin"],
			memberId: org.data?.members.find((m) => m.role === "owner")?.id!,
			fetchOptions: {
				headers,
			},
		});

		const removedMultipleRoleOwner = await client.organization.removeMember({
			organizationId: org.data.id,
			memberIdOrEmail: org.data?.members.find((m) => m.role === "owner")!.id,
			fetchOptions: {
				headers,
			},
		});
		expect(removedMultipleRoleOwner.error?.status).toBe(400);
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

	it("should return BAD_REQUEST when non-member tries to delete organization", async () => {
		// Create an organization first
		const testOrg = await client.organization.create({
			name: "test-delete-org",
			slug: "test-delete-org",
			fetchOptions: {
				headers,
			},
		});

		// Create a new user who is not a member of any organization
		const nonMemberUser = {
			email: "nonmember@test.com",
			password: "password123",
			name: "Non Member User",
		};

		await client.signUp.email(nonMemberUser);
		const { headers: nonMemberHeaders } = await signInWithUser(
			nonMemberUser.email,
			nonMemberUser.password,
		);

		// Try to delete an organization they're not a member of
		const deleteResult = await client.organization.delete({
			organizationId: testOrg.data?.id as string,
			fetchOptions: {
				headers: nonMemberHeaders,
			},
		});

		expect(deleteResult.error?.status).toBe(400);
		expect(deleteResult.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
		);
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
		const { headers: headers2 } = await signInWithUser(
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
			invitationId: invite.data!.id!,
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

	it("should allow listing invitations for an org", async () => {
		const invitations = await client.organization.listInvitations({
			query: {
				organizationId: organizationId,
			},
			fetchOptions: {
				headers: headers,
			},
		});
		expect(invitations.data?.length).toBe(5);
	});

	it("should allow listing invitations for a user using authClient", async () => {
		const rng = crypto.randomUUID();
		const user = {
			email: `${rng}@email.com`,
			password: rng,
			name: rng,
		};
		const rng2 = crypto.randomUUID();
		const orgAdminUser = {
			email: `${rng2}@email.com`,
			password: rng2,
			name: rng2,
		};
		await auth.api.signUpEmail({
			body: user,
		});
		await auth.api.signUpEmail({
			body: orgAdminUser,
		});
		const { headers: headers2, res: session } = await signInWithUser(
			user.email,
			user.password,
		);
		const { headers: adminHeaders, res: adminSession } = await signInWithUser(
			orgAdminUser.email,
			orgAdminUser.password,
		);
		const orgRng = crypto.randomUUID();
		const org = await auth.api.createOrganization({
			body: {
				name: orgRng,
				slug: orgRng,
			},
			headers: adminHeaders,
		});
		const invitation = await client.organization.inviteMember({
			organizationId: org?.id,
			email: user.email,
			role: "member",
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		const userInvitations = await client.organization.listUserInvitations({
			fetchOptions: {
				headers: headers2,
			},
		});
		expect(userInvitations.data?.[0]!.id).toBe(invitation.data?.id);
		expect(userInvitations.data?.[0]!.organizationName).toBe(orgRng);
		expect(userInvitations.data?.length).toBe(1);
	});

	it("should allow listing invitations for a user using server", async () => {
		const orgInvitations = await client.organization.listInvitations({
			fetchOptions: {
				headers,
			},
		});

		if (!orgInvitations.data?.[0]!.email) throw new Error("No email found");

		const invitations = await auth.api.listUserInvitations({
			query: {
				email: orgInvitations.data?.[0]!.email,
			},
		});

		expect(invitations?.length).toBe(
			orgInvitations.data!.filter(
				(x) => x.email === orgInvitations.data?.[0]!.email,
			).length,
		);

		const invitationsUpper = await auth.api.listUserInvitations({
			query: {
				email: orgInvitations.data?.[0]!.email.toUpperCase(),
			},
		});

		expect(invitationsUpper?.length).toBe(
			orgInvitations.data!.filter(
				(x) => x.email === orgInvitations.data?.[0]!.email,
			).length,
		);
	});
});

describe("access control", async (it) => {
	const ac = createAccessControl({
		project: ["create", "read", "update", "delete"],
		sales: ["create", "read", "update", "delete"],
		...defaultStatements,
	});
	const owner = ac.newRole({
		project: ["create", "delete", "update", "read"],
		sales: ["create", "read", "update", "delete"],
		...ownerAc.statements,
	});
	const admin = ac.newRole({
		project: ["create", "read"],
		sales: ["create", "read"],
		...adminAc.statements,
	});
	const member = ac.newRole({
		project: ["read"],
		sales: ["read"],
		...memberAc.statements,
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
					dynamicAccessControl: {
						enabled: true,
					},
				}),
			],
		});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			organizationClient({
				ac,
				roles: {
					admin,
					member,
					owner,
				},
				dynamicAccessControl: {
					enabled: true,
				},
			}),
		],
		fetchOptions: {
			customFetchImpl,
		},
	});
	const {
		organization: { checkRolePermission, hasPermission, create },
	} = authClient;

	const { headers, user, session } = await signInWithTestUser();

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
	if (!org.data) throw new Error("Organization not created");

	it("should return success", async () => {
		const canCreateProject = await checkRolePermission({
			role: "admin",
			permissions: {
				project: ["create"],
			},
		});
		expect(canCreateProject).toBe(true);

		// To be removed when `permission` will be removed entirely
		const canCreateProjectLegacy = await checkRolePermission({
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
		const canCreateProject = await checkRolePermission({
			role: "admin",
			permissions: {
				project: ["delete"],
			},
		});
		expect(canCreateProject).toBe(false);
	});

	it("should return not success", async () => {
		const res = await checkRolePermission({
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

describe("resend invitation should reuse existing", async () => {
	const { customFetchImpl, signInWithTestUser } = await getTestInstance({
		plugins: [
			organization({
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

	it("should reuse existing invitation when resend is true", async () => {
		const invite = await client.organization.inviteMember(
			{
				organizationId: org.data?.id as string,
				email: "test10@test.com",
				role: "member",
			},
			{
				headers,
			},
		);
		expect(invite.data?.status).toBe("pending");
		const originalInviteId = invite.data?.id;

		const invite2 = await client.organization.inviteMember(
			{
				organizationId: org.data?.id as string,
				email: "test10@test.com",
				role: "member",
				resend: true,
			},
			{
				headers,
			},
		);
		expect(invite2.data?.status).toBe("pending");
		// Should return the same invitation ID, not create a new one
		expect(invite2.data?.id).toBe(originalInviteId);

		const listInvitations = await client.organization.listInvitations({
			fetchOptions: {
				headers,
			},
		});
		// Should still only have 1 pending invitation, not 2
		expect(
			listInvitations.data?.filter((invite) => invite.status === "pending")
				.length,
		).toBe(1);
	});
});

describe("owner can update roles", async () => {
	const statement = {
		custom: ["custom"],
	} as const;

	const ac = createAccessControl(statement);

	const custom = ac.newRole({
		custom: ["custom"],
	});

	const { auth } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			admin(),
			organization({
				ac,
				roles: {
					custom,
					owner: ownerAc,
				},
			}),
		],
	});

	const adminEmail = "admin@email.com";
	const adminPassword = "adminpassword";

	await auth.api.createUser({
		body: {
			email: adminEmail,
			password: adminPassword,
			name: "Admin",
			role: "admin",
		},
	});

	const { headers } = await auth.api.signInEmail({
		returnHeaders: true,
		body: {
			email: adminEmail,
			password: adminPassword,
		},
	});

	const adminCookie = headers.getSetCookie()[0]!;

	const org = await auth.api.createOrganization({
		headers: { cookie: adminCookie },
		body: {
			name: "Org",
			slug: "org",
		},
	});

	if (!org) {
		throw new Error("couldn't create an organization");
	}

	const ownerId = org.members.at(0)?.id;
	if (!ownerId) {
		throw new Error("couldn't get the owner id");
	}

	it("allows setting custom role to a user", async () => {
		const userEmail = "user@email.com";
		const userPassword = "userpassword";

		const { user } = await auth.api.createUser({
			headers: { cookie: adminCookie },
			body: {
				name: "user",
				email: userEmail,
				password: userPassword,
			},
		});

		const addMemberRes = await auth.api.addMember({
			headers: { cookie: adminCookie },
			body: {
				organizationId: org.id,
				userId: user.id,
				role: [],
			},
		});

		if (!addMemberRes) {
			throw new Error("couldn't add user as a member to a repo");
		}

		await auth.api.updateMemberRole({
			headers: { cookie: adminCookie },
			body: {
				organizationId: org.id,
				memberId: addMemberRes.id,
				role: ["custom", "owner"],
			},
		});

		const signInRes = await auth.api.signInEmail({
			returnHeaders: true,
			body: {
				email: userEmail,
				password: userPassword,
			},
		});

		const userCookie = signInRes.headers.getSetCookie()[0]!;

		const permissionRes = await auth.api.hasPermission({
			headers: { cookie: userCookie },
			body: {
				organizationId: org.id,
				permissions: {
					custom: ["custom"],
				},
			},
		});

		expect(permissionRes.success).toBe(true);
		expect(permissionRes.error).toBeNull();
	});

	it("allows org owner to set a custom role for themselves", async () => {
		await auth.api.updateMemberRole({
			headers: { cookie: adminCookie },
			body: {
				organizationId: org.id,
				memberId: ownerId,
				role: ["owner", "custom"],
			},
		});

		const permissionRes = await auth.api.hasPermission({
			headers: { cookie: adminCookie },
			body: {
				organizationId: org.id,
				permissions: {
					custom: ["custom"],
				},
			},
		});

		expect(permissionRes.success).toBe(true);
		expect(permissionRes.error).toBeNull();
	});

	it("allows an org owner to remove their own creator role if not sole owner", async () => {
		await auth.api.updateMemberRole({
			headers: { cookie: adminCookie },
			body: {
				organizationId: org.id,
				memberId: ownerId,
				role: [],
			},
		});
	});

	it("should throw error if sole org owner tries to remove creator role"),
		async () => {
			const userEmail = "user@email.com";
			const userPassword = "userpassword";

			const signInRes = await auth.api.signInEmail({
				returnHeaders: true,
				body: {
					email: userEmail,
					password: userPassword,
				},
			});

			const userCookie = signInRes.headers.getSetCookie()[0]!;

			await auth.api
				.updateMemberRole({
					headers: { cookie: userCookie },
					body: {
						organizationId: org.id,
						memberId: ownerId,
						role: [],
					},
				})
				.catch((e: APIError) => {
					expect(e.message).toBe(
						ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER,
					);
				});
		};
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
		expectTypeOf<FullOrganization>().toEqualTypeOf<ActiveOrganization | null>();
	});
});

describe("Additional Fields", async () => {
	const db = {
		users: [],
		sessions: [],
		account: [],
		organization: [],
		invitation: [] as {
			id: string;
			invitationRequiredField: string;
			invitationOptionalField?: string | undefined;
			invitationHiddenField?: string | undefined;
		}[],
		member: [] as {
			id: string;
			memberRequiredField: string;
			memberOptionalField?: string | undefined;
		}[],
		team: [] as {
			id: string;
			teamRequiredField: string;
			teamOptionalField?: string | undefined;
		}[],
		teamMember: [] as {
			id: string;
		}[],
	};

	const orgOptions = {
		teams: {
			enabled: true,
		},
		schema: {
			organization: {
				additionalFields: {
					someRequiredField: {
						type: "string",
						required: true,
					},
					someOptionalField: {
						type: "string",
						required: false,
					},
					someHiddenField: {
						type: "string",
						input: false,
					},
				},
			},
			member: {
				additionalFields: {
					memberRequiredField: {
						type: "string",
						required: true,
					},
					memberOptionalField: {
						type: "string",
					},
					memberHiddenField: {
						type: "string",
						input: false,
					},
				},
			},
			team: {
				additionalFields: {
					teamRequiredField: {
						type: "string",
						required: true,
					},
					teamOptionalField: {
						type: "string",
					},
					teamHiddenField: {
						type: "string",
						input: false,
					},
				},
			},
			invitation: {
				additionalFields: {
					invitationRequiredField: {
						type: "string",
						required: true,
					},
					invitationOptionalField: {
						type: "string",
					},
					invitationHiddenField: {
						type: "string",
						input: false,
					},
				},
			},
		},
		invitationLimit: 3,
	} satisfies OrganizationOptions;

	const orgClientPlugin = organizationClient({
		schema: inferOrgAdditionalFields<typeof auth>(),
		teams: { enabled: true },
	});

	const { auth, signInWithTestUser } = await getTestInstance({
		database: memoryAdapter(db, {
			debugLogs: false,
		}),
		user: {
			modelName: "users",
		},
		plugins: [organization(orgOptions), nextCookies()],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();

	const client = createAuthClient({
		plugins: [orgClientPlugin],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
			headers,
		},
	});

	// The second client is to test passing the schema object directly to test type inference
	const client2 = createAuthClient({
		plugins: [
			organizationClient({
				schema: inferOrgAdditionalFields(orgOptions.schema),
				teams: { enabled: true },
			}),
		],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("Expect team endpoints to still be defined", async () => {
		const teams = client.organization.createTeam;
		expect(teams).toBeDefined();
		expectTypeOf<typeof teams>().not.toEqualTypeOf<undefined>();
	});

	it("Should infer the organization schema", async () => {
		const org = client.organization.create;
		const org2 = client2.organization.create;
		type Params = Omit<Parameters<typeof org>[0], "fetchOptions">;
		type Params2 = Omit<Parameters<typeof org2>[0], "fetchOptions">;
		expect(org).toBeDefined();
		expectTypeOf<Params>().toEqualTypeOf<{
			name: string;
			slug: string;
			logo?: string | undefined;
			userId?: string | undefined;
			metadata?: Record<string, any> | undefined;
			someRequiredField: string;
			someOptionalField?: string | undefined;
			keepCurrentActiveOrganization?: boolean | undefined;
		}>();
		expectTypeOf<Params2>().toEqualTypeOf<{
			name: string;
			slug: string;
			logo?: string | undefined;
			userId?: string | undefined;
			metadata?: Record<string, any> | undefined;
			someRequiredField: string;
			someOptionalField?: string | undefined;
			keepCurrentActiveOrganization?: boolean | undefined;
		}>();
	});

	type ExpectedResult = {
		id: string;
		name: string;
		slug: string;
		createdAt: Date;
		logo?: string | null | undefined;
		metadata: any;
		someRequiredField: string;
		someOptionalField?: string | undefined;
		someHiddenField?: string | undefined;
		members: (
			| {
					id: string;
					organizationId: string;
					userId: string;
					role: string;
					createdAt: Date;
					memberRequiredField: string;
					memberOptionalField?: string | undefined;
					memberHiddenField?: string | undefined;
			  }
			| undefined
		)[];
	} | null;
	let org: NonNullable<ExpectedResult>;
	it("create organization", async () => {
		try {
			const orgRes = await auth.api.createOrganization({
				body: {
					name: "test",
					slug: "test",
					someRequiredField: "hey",
					someOptionalField: "hey",
				},
				headers,
			});

			type Result = PrettifyDeep<typeof orgRes>;
			expectTypeOf<Result>().toEqualTypeOf<ExpectedResult>({} as any);
			expect(orgRes).not.toBeNull();
			if (!orgRes) throw new Error("Organization is null");
			org = orgRes;
			expect(org.someRequiredField).toBeDefined();
			expect(org.someRequiredField).toBe("hey");
			expect(org.someOptionalField).toBe("hey");
			expect(org.someHiddenField).toBeUndefined();
			//@ts-expect-error
			expect(db.organization[0]?.someRequiredField).toBe("hey");
		} catch (error) {
			throw error;
		}
	});

	it("update organization", async () => {
		const updatedOrg = await auth.api.updateOrganization({
			body: {
				data: {
					someRequiredField: "hey2",
				},
				organizationId: org.id,
			},
			headers,
		});
		type Result = PrettifyDeep<typeof updatedOrg>;
		expect(updatedOrg?.someRequiredField).toBe("hey2");
		//@ts-expect-error
		expect(db.organization[0]?.someRequiredField).toBe("hey2");
		expectTypeOf<Result>().toEqualTypeOf<{
			id: string;
			name: string;
			slug: string;
			createdAt: Date;
			logo?: string | null | undefined;
			someRequiredField: string;
			someOptionalField?: string | undefined;
			someHiddenField?: string | undefined;
			metadata: any;
		} | null>();
	});

	it("list user organizations", async () => {
		const orgs = await auth.api.listOrganizations({
			headers,
		});
		expect(orgs?.length).toBe(1);
		expect(orgs?.[0]?.someRequiredField).toBeDefined();
		expect(orgs?.[0]?.someOptionalField).toBeDefined();
		expect(orgs?.[0]?.someHiddenField).toBeUndefined();

		type Result = PrettifyDeep<typeof orgs>;
		expectTypeOf<Result>().toEqualTypeOf<
			{
				id: string;
				name: string;
				slug: string;
				createdAt: Date;
				logo?: string | null | undefined;
				metadata?: any;
				someRequiredField: string;
				someOptionalField?: string | undefined;
				someHiddenField?: string | undefined;
			}[]
		>();
	});

	it("useListOrganizations hook", async () => {
		const { data, error } = await getAtomValue(
			() => orgClientPlugin.getAtoms(client.$fetch).listOrganizations,
		);

		expect(error).toBeNull();
		expectTypeOf<typeof data>().toEqualTypeOf<
			| {
					id: string;
					name: string;
					slug: string;
					createdAt: Date;
					logo?: string | null | undefined;
					metadata?: any;
					someRequiredField: string;
					someOptionalField?: string | undefined;
					someHiddenField?: string | undefined;
			  }[]
			| null
		>();
		expect(data?.length).toBe(1);
		expect(data?.[0]?.someRequiredField).toBe("hey2");
		expect(data?.[0]?.someOptionalField).toBe("hey");
		expect(data?.[0]?.someHiddenField).toBeUndefined();
	});

	it("set active organization", async () => {
		const res = await auth.api.setActiveOrganization({
			body: {
				organizationId: org.id,
			},
			headers,
		});
		type Result = PrettifyDeep<typeof res>;
		type Members = NonNullable<Result>["members"];
		type Team = NonNullable<Result>["teams"][number];
		expectTypeOf<Members>().toEqualTypeOf<
			{
				id: string;
				organizationId: string;
				role: "member" | "admin" | "owner";
				createdAt: Date;
				userId: string;
				teamId?: string | undefined;
				user: {
					id: string;
					email: string;
					name: string;
					image?: string;
				};
				memberRequiredField: string;
				memberOptionalField?: string | undefined;
				memberHiddenField?: string | undefined;
			}[]
		>();
		expectTypeOf<Team>().toEqualTypeOf<{
			id: string;
			name: string;
			organizationId: string;
			createdAt: Date;
			updatedAt?: Date | undefined;
			teamRequiredField: string;
			teamOptionalField?: string | undefined;
			teamHiddenField?: string | undefined;
		}>();
	});

	it("useActiveOrganization hook", async () => {
		const { data, error } = await getAtomValue(
			() => orgClientPlugin.getAtoms(client.$fetch).activeOrganization,
		);
		type Data = PrettifyDeep<typeof data>;

		expect(error).toBeNull();
		expectTypeOf<Data>().toEqualTypeOf<{
			id: string;
			name: string;
			slug: string;
			createdAt: Date;
			logo?: string | null | undefined;
			metadata?: any;
			someRequiredField: string;
			someOptionalField?: string | undefined;
			someHiddenField?: string | undefined;
			members: any[];
			invitations: any[];
		} | null>({} as any);
		if (data === null) return expect(data).not.toBe(null);
		expect(data.someRequiredField).toBe("hey2");
		expect(data.someOptionalField).toBe("hey");
		expect(data.someHiddenField).toBeUndefined();
	});

	it("getFullOrganization", async () => {
		const res = await auth.api.getFullOrganization({
			query: {
				organizationId: org.id,
			},
			headers,
		});
		type Result = PrettifyDeep<typeof res>;
		type ExpectedMembers = {
			id: string;
			organizationId: string;
			role: "member" | "admin" | "owner";
			createdAt: Date;
			userId: string;
			teamId?: string | undefined;
			user: {
				id: string;
				email: string;
				name: string;
				image?: string;
			};
			memberRequiredField: string;
			memberOptionalField?: string | undefined;
			memberHiddenField?: string | undefined;
		}[];
		type ExpectedInvitations = {
			id: string;
			organizationId: string;
			email: string;
			role: "member" | "admin" | "owner";
			status: InvitationStatus;
			inviterId: string;
			expiresAt: Date;
			createdAt: Date;
			teamId?: string | undefined;
			invitationRequiredField: string;
			invitationOptionalField?: string | undefined;
			invitationHiddenField?: string | undefined;
		}[];
		type ExpectedTeams = {
			id: string;
			name: string;
			organizationId: string;
			createdAt: Date;
			updatedAt?: Date | undefined;
			teamRequiredField: string;
			teamOptionalField?: string | undefined;
			teamHiddenField?: string | undefined;
		}[];

		type O = typeof orgOptions;
		type Members = PrettifyDeep<InferMember<O, false>>[];
		type Invitations = PrettifyDeep<InferInvitation<O, false>>[];
		type Teams = PrettifyDeep<InferTeam<O, false>>[];

		expectTypeOf<Members>().toEqualTypeOf<ExpectedMembers>();
		expectTypeOf<Invitations>().toEqualTypeOf<ExpectedInvitations>();
		expectTypeOf<Teams>().toEqualTypeOf<ExpectedTeams>();

		expectTypeOf<NonNullable<Result>>().toEqualTypeOf<{
			id: string;
			metadata?: any;
			createdAt: Date;
			name: string;
			slug: string;
			logo?: string | null | undefined;
			someRequiredField: string;
			someOptionalField?: string | undefined;
			someHiddenField?: string | undefined;
			members: ExpectedMembers;
			invitations: ExpectedInvitations;
			teams: ExpectedTeams;
		}>();
	});

	let addedMemberHeaders = new Headers();

	const { data: addedMember, error } = await client.signUp.email({
		email: "new-member-for-org@email.com",
		password: "password",
		name: "new member for org",
		fetchOptions: {
			onSuccess(context) {
				const header = context.response.headers.get("set-cookie");
				const cookies = parseSetCookieHeader(header || "");
				const signedCookie = cookies.get("better-auth.session_token")?.value;
				addedMemberHeaders.set(
					"cookie",
					`better-auth.session_token=${signedCookie}`,
				);
			},
		},
	});
	if (!addedMember) throw error;

	it("add member", async () => {
		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: addedMember.user.id,
				role: "member",
				memberRequiredField: "hey",
				memberOptionalField: "hey2",
			},
		});
		if (!member) throw new Error("Member is null");
		expect(member?.memberRequiredField).toBe("hey");
		expectTypeOf<typeof member.memberRequiredField>().toEqualTypeOf<string>();
		expect(member?.memberOptionalField).toBe("hey2");
		expectTypeOf<typeof member.memberOptionalField>().toEqualTypeOf<
			string | undefined
		>();
		expect(member?.memberHiddenField).toBeUndefined();
		const row = db.member.find((x) => x.id === member?.id)!;
		expect(row).toBeDefined();
		expect(row.memberRequiredField).toBe("hey");
		expect(row.memberOptionalField).toBe("hey2");
	});

	it("list members", async () => {
		const members = await auth.api.listMembers({
			query: {
				organizationId: org.id,
			},
			headers,
		});
		type Result = PrettifyDeep<typeof members>;
		type ExpectedResult = {
			members: ({
				id: string;
				organizationId: string;
				role: "member" | "admin" | "owner";
				createdAt: Date;
				userId: string;
				teamId?: string | undefined;
				user: {
					id: string;
					email: string;
					name: string;
					image?: string;
				};
				memberRequiredField: string;
				memberOptionalField?: string | undefined;
				memberHiddenField?: string | undefined;
			} & {
				user: {
					id: string;
					name: string;
					email: string;
					image: string | null | undefined;
				};
			})[];
			total: number;
		};
		expectTypeOf<Result>().toEqualTypeOf<ExpectedResult>();
		expect(members?.members?.[1]?.memberRequiredField).toBe("hey");
		expect(members?.members?.[1]?.memberOptionalField).toBe("hey2");
	});

	it("get active member", async () => {
		await auth.api.setActiveOrganization({
			body: { organizationId: org.id },
			headers: addedMemberHeaders,
		});
		const activeMember = await auth.api.getActiveMember({
			headers: addedMemberHeaders,
		});
		type Result = PrettifyDeep<
			Pick<
				NonNullable<typeof activeMember>,
				"memberRequiredField" | "memberOptionalField" | "memberHiddenField"
			>
		>;
		type ExpectedResult = {
			memberRequiredField: string;
			memberOptionalField?: string | undefined;
			memberHiddenField?: string | undefined;
		};
		expectTypeOf<ExpectedResult>().toEqualTypeOf<Result>();
		expect(activeMember?.memberRequiredField).toBe("hey");
		expect(activeMember?.memberOptionalField).toBe("hey2");
		expect(activeMember?.memberHiddenField).toBeUndefined();
		expect(activeMember?.user.email).toBe(addedMember.user.email);
		expect(activeMember?.user.name).toBe(addedMember.user.name);
		expect(activeMember?.user.image).toBe(addedMember.user.image);
	});

	it("remove member", async () => {
		const removedMember = await auth.api.removeMember({
			body: {
				organizationId: org.id,
				memberIdOrEmail: addedMember.user.email,
			},
			headers,
		});
		type Result = PrettifyDeep<typeof removedMember>;
		type ExpectedResult = {
			member: {
				id: string;
				organizationId: string;
				role: "member" | "admin" | "owner";
				createdAt: Date;
				userId: string;
				teamId?: string | undefined;
				user: {
					id: string;
					email: string;
					name: string;
					image?: string;
				};
				memberRequiredField: string;
				memberOptionalField?: string | undefined;
				memberHiddenField?: string | undefined;
			};
		} | null;
		expectTypeOf<Result>().toEqualTypeOf<ExpectedResult>();
		expect(removedMember?.member.user.email).toBe(addedMember.user.email);
		expect(removedMember?.member.memberRequiredField).toBe("hey");
		expect(removedMember?.member.memberOptionalField).toBe("hey2");
		expect(removedMember?.member.memberHiddenField).toBeUndefined();
		const row = db.member.find((x) => x.id === removedMember?.member.id)!;
		expect(row).toBeUndefined();
	});

	let invitation: {
		id: string;
		organizationId: string;
		email: string;
		role: "member" | "admin" | "owner";
		status: InvitationStatus;
		inviterId: string;
		expiresAt: Date;
		teamId?: string | undefined;
		invitationRequiredField: string;
		invitationOptionalField?: string | undefined;
		invitationHiddenField?: string | undefined;
	};

	const { headers: invitedHeaders, user: invitedUser2User } =
		await signInWithInvitationUser();

	async function signInWithInvitationUser() {
		const testUser = {
			email: "test-user-email-12333@test.com",
			emailVerified: true,
			name: "test user",
			createdAt: new Date(),
			updatedAt: new Date(),
			password: "password",
		} satisfies Omit<User, "id"> & { password: string };
		let headers = new Headers();
		const setCookie = (name: string, value: string) => {
			const current = headers.get("cookie");
			headers.set("cookie", `${current || ""}; ${name}=${value}`);
		};

		const { data, error } = await client.signUp.email({
			email: testUser.email,
			password: testUser.password,
			name: testUser.name,
			fetchOptions: {
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
				},
			},
		});
		const session = await client.getSession({ fetchOptions: { headers } });
		return {
			session: session,
			user: data?.user as User,
			headers,
			setCookie,
		};
	}

	it("create invitation", async () => {
		invitation = await auth.api.createInvitation({
			body: {
				email: invitedUser2User.email,
				role: "member",
				invitationRequiredField: "hey",
				invitationOptionalField: "hey2",
				organizationId: org.id,
			},
			headers,
		});

		expect(invitation?.invitationRequiredField).toBe("hey");
		expectTypeOf<
			typeof invitation.invitationRequiredField
		>().toEqualTypeOf<string>();
		expect(invitation?.invitationOptionalField).toBe("hey2");
		expectTypeOf<typeof invitation.invitationOptionalField>().toEqualTypeOf<
			string | undefined
		>();
		expectTypeOf<typeof invitation.invitationHiddenField>().toEqualTypeOf<
			string | undefined
		>();
		expect(invitation.invitationHiddenField).toBeUndefined();
		const row = db.invitation.find((x) => x.id === invitation?.id)!;
		expect(row).toBeDefined();
		expect(row.invitationRequiredField).toBe("hey");
		expect(row.invitationOptionalField).toBe("hey2");
		expect(row.invitationHiddenField).toBeUndefined();
	});

	it("get invitation", async () => {
		const receivedInvitation = await auth.api.getInvitation({
			query: {
				id: invitation.id,
			},
			headers: invitedHeaders,
		});
		type Result = PrettifyDeep<typeof receivedInvitation>;
		type ExpectedResult = {
			id: string;
			organizationId: string;
			email: string;
			role: "member" | "admin" | "owner";
			status: InvitationStatus;
			inviterId: string;
			createdAt: Date;
			expiresAt: Date;
			teamId?: string | undefined;
			invitationRequiredField: string;
			invitationOptionalField?: string | undefined;
			invitationHiddenField?: string | undefined;
			organizationName: string;
			organizationSlug: string;
			inviterEmail: string;
		};
		expectTypeOf<Result>().toEqualTypeOf<ExpectedResult>();
		expect(receivedInvitation?.invitationRequiredField).toBe("hey");
		expect(receivedInvitation?.invitationOptionalField).toBe("hey2");
		expect(receivedInvitation?.invitationHiddenField).toBeUndefined();
		expect(receivedInvitation?.organizationName).toBe(org.name);
		expect(receivedInvitation?.organizationSlug).toBe(org.slug);
	});

	it("accept invitation", async () => {
		const acceptedInvitation = await auth.api.acceptInvitation({
			body: {
				invitationId: invitation.id,
			},
			headers: invitedHeaders,
		});
		type Result = PrettifyDeep<typeof acceptedInvitation>;
		type ExpectedResult = {
			invitation: {
				id: string;
				organizationId: string;
				email: string;
				role: "member" | "admin" | "owner";
				status: InvitationStatus;
				inviterId: string;
				createdAt: Date;
				expiresAt: Date;
				teamId?: string | undefined;
				invitationRequiredField: string;
				invitationOptionalField?: string | undefined;
				invitationHiddenField?: string | undefined;
			};
			member: {
				id: string;
				organizationId: string;
				userId: string;
				role: string;
				createdAt: Date;
				memberRequiredField: string;
				memberOptionalField?: string | undefined;
				memberHiddenField?: string | undefined;
			};
		} | null;
		if (!acceptedInvitation) throw new Error("Accepted invitation is null");
		expectTypeOf<Result>().toEqualTypeOf<ExpectedResult>();
		expect("memberRequiredField" in acceptedInvitation.member).toBeTruthy();
		expect("memberOptionalField" in acceptedInvitation.member).toBeTruthy();
		expect("memberHiddenField" in acceptedInvitation.member).toBeTruthy();
		expect(
			acceptedInvitation?.invitation.invitationHiddenField,
		).toBeUndefined();
		expect(acceptedInvitation?.invitation.invitationOptionalField).toBe("hey2");
		expect(acceptedInvitation?.invitation.status).toBe("accepted");
	});
	it("list invitations", async () => {
		const invitations = await auth.api.listInvitations({
			query: {
				organizationId: org.id,
			},
			headers,
		});

		expect(invitations?.length).toBe(1);
		const invitation = invitations[0]!;
		type ResultInvitation = Prettify<typeof invitation>;
		expectTypeOf<ResultInvitation>().toEqualTypeOf<{
			id: string;
			organizationId: string;
			email: string;
			role: "member" | "admin" | "owner";
			status: InvitationStatus;
			createdAt: Date;
			expiresAt: Date;
			inviterId: string;
			invitationRequiredField: string;
			invitationOptionalField?: string | undefined;
			invitationHiddenField?: string | undefined;
			teamId?: string | undefined;
		}>();
		expect(invitation.invitationRequiredField).toBe("hey");
		expect(invitation.invitationOptionalField).toBe("hey2");
	});

	let team: {
		id: string;
		name: string;
		organizationId: string;
		createdAt: Date;
		updatedAt?: Date | undefined;
		teamRequiredField: string;
		teamOptionalField?: string | undefined;
	} | null = null;

	it("create team", async () => {
		team = await auth.api.createTeam({
			body: {
				name: "test",
				teamRequiredField: "hey",
				teamOptionalField: "hey2",
				organizationId: org.id,
			},
			headers,
		});

		expect(team.teamRequiredField).toBe("hey");
		expect(team.teamOptionalField).toBe("hey2");
		const row = db.team.find((x) => x.id === team?.id)!;
		expect(row).toBeDefined();
		expect(row.teamRequiredField).toBe("hey");
		expect(row.teamOptionalField).toBe("hey2");
	});

	it("update team", async () => {
		if (!team) throw new Error("Team is null");
		const updatedTeam = await auth.api.updateTeam({
			body: {
				teamId: team.id,
				data: {
					teamOptionalField: "hey3",
					teamRequiredField: "hey4",
				},
			},
			headers,
		});

		if (!updatedTeam) throw new Error("Updated team is null");
		expect(updatedTeam?.teamOptionalField).toBe("hey3");
		expect(updatedTeam?.teamRequiredField).toBe("hey4");
		expectTypeOf<
			typeof updatedTeam.teamRequiredField
		>().toEqualTypeOf<string>();
		expectTypeOf<typeof updatedTeam.teamOptionalField>().toEqualTypeOf<
			string | undefined
		>();
		const row = db.team.find((x) => x.id === updatedTeam?.id)!;
		expect(row).toBeDefined();
		expect(row.teamOptionalField).toBe("hey3");
		expect(row.teamRequiredField).toBe("hey4");
	});
});

/**
 * Get the value of an atom without running the hook.
 */
async function getAtomValue<Result>(
	getHook: () => PreinitializedWritableAtom<{
		data: Result | null;
		error: null | BetterFetchError;
		isPending: boolean;
		isRefetching: boolean;
		refetch: () => void;
	}> &
		object,
) {
	// Trick the authClient to think it's on the client side in order to trigger the useAuthQuery hook
	global.window = {} as any;

	// Run the hook and wait for the result
	const res = await new Promise<{
		data: Result | null;
		error: null | BetterFetchError;
	}>((resolve) => {
		const { subscribe, get } = getHook();
		subscribe((res) => {
			if (res.isPending || res.isRefetching) return;
			resolve({ data: res.data, error: res.error });
		});
		get();
	});

	// Reset the window object
	global.window = undefined as any;

	// Return the result
	return res as
		| { data: Result; error: null }
		| { data: null; error: BetterFetchError };
}
describe("organization hooks", async (it) => {
	let hooksCalled: string[] = [];

	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [
			organization({
				organizationHooks: {
					beforeCreateOrganization: async (data) => {
						hooksCalled.push("beforeCreateOrganization");
						return {
							data: {
								...data.organization,
								metadata: { hookCalled: true },
							},
						};
					},
					afterCreateOrganization: async (data) => {
						hooksCalled.push("afterCreateOrganization");
					},
					beforeCreateInvitation: async (data) => {
						hooksCalled.push("beforeCreateInvitation");
					},
					afterCreateInvitation: async (data) => {
						hooksCalled.push("afterCreateInvitation");
					},
					beforeAddMember: async (data) => {
						hooksCalled.push("beforeAddMember");
					},
					afterAddMember: async (data) => {
						hooksCalled.push("afterAddMember");
					},
				},
				async sendInvitationEmail() {},
			}),
		],
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

	const { headers } = await signInWithTestUser();

	it("should call organization creation hooks", async () => {
		hooksCalled = [];
		const organization = await client.organization.create({
			name: "Test Org with Hooks",
			slug: "test-org-hooks",
			fetchOptions: { headers },
		});

		expect(hooksCalled).toContain("beforeCreateOrganization");
		expect(hooksCalled).toContain("afterCreateOrganization");
		expect(organization.data?.metadata).toEqual({ hookCalled: true });
	});

	it("should call invitation hooks", async () => {
		hooksCalled = [];

		await client.organization.inviteMember({
			email: "test@example.com",
			role: "member",
			fetchOptions: { headers },
		});

		expect(hooksCalled).toContain("beforeCreateInvitation");
		expect(hooksCalled).toContain("afterCreateInvitation");
	});
});
