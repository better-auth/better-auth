import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";

describe("listMembers", async () => {
	const { auth, signInWithTestUser, cookieSetter } = await getTestInstance({
		plugins: [organization()],
	});
	const ctx = await auth.$context;
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
	const secondOrg = await client.organization.create({
		name: "test-second",
		slug: "test-second",
		metadata: {
			test: "second-org",
		},
		fetchOptions: {
			headers,
		},
	});

	for (let i = 0; i < 10; i++) {
		const user = await ctx.adapter.create({
			model: "user",
			data: {
				email: `test${i}@test.com`,
				name: `test${i}`,
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org.data?.id as string,
				userId: user.id,
				role: "member",
			},
		});
	}
	it("should return all members", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
		});
		expect(members.data?.members.length).toBe(11);
		expect(members.data?.total).toBe(11);
	});

	it("should return all members by organization slug", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				organizationSlug: "test-second",
			},
		});
		expect(members.data?.members.length).toBe(1);
		expect(members.data?.total).toBe(1);
	});

	it("should limit the number of members", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				limit: 5,
			},
		});
		expect(members.data?.members.length).toBe(5);
		expect(members.data?.total).toBe(11);
	});

	it("should offset the members", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				offset: 5,
			},
		});
		expect(members.data?.members.length).toBe(6);
		expect(members.data?.total).toBe(11);
	});

	it("should filter the members", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				filterField: "createdAt",
				filterOperator: "gt",
				filterValue: new Date(
					Date.now() - 1000 * 60 * 60 * 24 * 30,
				).toISOString(),
			},
		});
		expect(members.data?.members.length).toBe(11);
		expect(members.data?.total).toBe(11);
	});

	it("should filter the members verifying the operator functionality", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				filterField: "role",
				filterOperator: "ne",
				filterValue: "owner",
			},
		});
		expect(members.data?.members.length).toBe(10);
		expect(members.data?.total).toBe(10);
	});

	it("should filter the members with 'in' operator", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				filterField: "role",
				filterOperator: "in",
				filterValue: ["member", "owner"],
			},
		});
		expect(members.data?.members.length).toBe(11);
		expect(members.data?.total).toBe(11);
	});

	it("should filter the members with 'not_in' operator", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				filterField: "role",
				filterOperator: "not_in",
				filterValue: ["owner"],
			},
		});
		expect(members.data?.members.length).toBe(10);
		expect(members.data?.total).toBe(10);
	});

	it("should filter the members with 'starts_with' operator", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				filterField: "role",
				filterOperator: "starts_with",
				filterValue: "mem",
			},
		});
		expect(members.data?.members.length).toBe(10);
		expect(members.data?.total).toBe(10);
	});

	it("should sort the members", async () => {
		const defaultMembers = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
		});
		const firstMember = defaultMembers.data?.members[0];
		if (!firstMember) {
			throw new Error("No first member found");
		}
		const secondMember = defaultMembers.data?.members[1];
		if (!secondMember) {
			throw new Error("No second member found");
		}
		await ctx.adapter.update({
			model: "member",
			where: [{ field: "id", value: secondMember.id }],
			update: {
				// update the second member to be the oldest
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
			},
		});
		const lastMember =
			defaultMembers.data?.members[defaultMembers.data?.members.length - 1];
		if (!lastMember) {
			throw new Error("No last member found");
		}
		const oneBeforeLastMember =
			defaultMembers.data?.members[defaultMembers.data?.members.length - 2];
		if (!oneBeforeLastMember) {
			throw new Error("No one before last member found");
		}
		await ctx.adapter.update({
			model: "member",
			where: [{ field: "id", value: oneBeforeLastMember.id }],
			update: {
				// update the one before last member to be the newest
				createdAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
			},
		});
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				sortBy: "createdAt",
				sortDirection: "asc",
			},
		});
		expect(members.data?.members[0]!.id).not.toBe(firstMember.id);
		expect(
			members.data?.members[members.data?.members.length - 1]!.id,
		).not.toBe(lastMember.id);
		expect(members.data?.members[0]!.id).toBe(secondMember.id);
		expect(members.data?.members[members.data?.members.length - 1]!.id).toBe(
			oneBeforeLastMember.id,
		);
	});

	it("should list members by organization id", async () => {
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
			query: {
				organizationId: secondOrg.data?.id as string,
			},
		});
		expect(members.data?.members.length).toBe(1);
		expect(members.data?.total).toBe(1);
	});

	it("should not list members if not a member", async () => {
		const newHeaders = new Headers();
		await client.signUp.email({
			email: "test21@test.com",
			name: "test22",
			password: "password",
			fetchOptions: {
				onSuccess: cookieSetter(newHeaders),
			},
		});
		const members = await client.organization.listMembers({
			fetchOptions: {
				headers: newHeaders,
			},
			query: {
				organizationId: org.data?.id as string,
			},
		});
		expect(members.error).toBeTruthy();
		expect(members.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION
				.message,
		);
	});
});

describe("updateMemberRole", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		plugins: [organization()],
	});

	it("should update the member role", async () => {
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
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

		const newUser = await auth.api.signUpEmail({
			body: {
				email: "test2@test.com",
				name: "test",
				password: "password",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.data?.id as string,
				userId: newUser.user.id,
				role: "member",
			},
		});
		const updatedMember = await client.organization.updateMemberRole(
			{
				organizationId: org.data?.id as string,
				memberId: member?.id as string,
				role: "admin",
			},
			{
				headers,
			},
		);
		expect(updatedMember.data?.role).toBe("admin");
	});

	it("should not update the member role if the member updating is not a member	", async () => {
		const { headers, user } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		await client.organization.create({
			name: "test",
			slug: "test",
			metadata: {
				test: "test",
			},
			fetchOptions: {
				headers,
			},
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: "test3@test.com",
				name: "test",
				password: "password",
			},
		});
		const newOrg = await client.organization.create(
			{
				name: "test2",
				slug: "test2",
				metadata: {
					test: "test",
				},
			},
			{
				headers: new Headers({
					authorization: `Bearer ${newUser.token}`,
				}),
			},
		);
		await auth.api.addMember({
			body: {
				organizationId: newOrg.data?.id as string,
				userId: user.id,
				role: "admin",
			},
		});
		const updatedMember = await client.organization.updateMemberRole(
			{
				organizationId: newOrg.data?.id as string,
				memberId: newOrg.data?.members[0]?.id as string,
				role: "admin",
			},
			{
				headers,
			},
		);
		expect(updatedMember.error).toBeTruthy();
		expect(updatedMember.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER
				.message,
		);
	});
});

describe("activeMemberRole", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [organization()],
	});
	const ctx = await auth.$context;
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
	await client.organization.create({
		name: "test-second",
		slug: "test-second",
		metadata: {
			test: "second-org",
		},
		fetchOptions: {
			headers,
		},
	});

	let selectedUserId = "";
	for (let i = 0; i < 10; i++) {
		const user = await ctx.adapter.create({
			model: "user",
			data: {
				email: `test${i}@test.com`,
				name: `test${i}`,
			},
		});

		if (i == 0) {
			selectedUserId = user.id;
		}

		await auth.api.addMember({
			body: {
				organizationId: org.data?.id as string,
				userId: user.id,
				role: "member",
			},
		});
	}

	it("should return the active member role on active organization", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		const activeMember = await client.organization.getActiveMemberRole({
			fetchOptions: {
				headers,
			},
		});

		expect(activeMember.data?.role).toBe("owner");
	});

	it("should return active member role on organization", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		const activeMember = await client.organization.getActiveMemberRole({
			query: {
				userId: selectedUserId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(activeMember.data?.role).toBe("member");
	});
});

describe("inviteMember role validation", async () => {
	const { signInWithTestUser, customFetchImpl } = await getTestInstance({
		plugins: [organization()],
	});

	it("should fail when inviting with a non-existent role", async () => {
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const org = await client.organization.create({
			name: "Test Org Validation",
			slug: "test-org-validation",
			fetchOptions: {
				headers,
			},
		});

		// Attempt to invite with a fake role
		const { error } = await client.organization.inviteMember({
			email: "fake-role@test.com",
			// @ts-expect-error invalid role not in base type
			role: "super-invalid-role-123",
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		expect(error).toBeTruthy();
		expect(error?.status).toBe(400);
		expect(error?.message).toContain(
			ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.code,
		);
	});

	it("should succeed when inviting with a valid default role", async () => {
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const org = await client.organization.create({
			name: "Test Org Validation 2",
			slug: "test-org-validation-2",
			fetchOptions: {
				headers,
			},
		});

		const { data, error } = await client.organization.inviteMember({
			email: "valid@test.com",
			role: "admin", // Valid default role
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		expect(error).toBeNull();
		expect(data).toBeDefined();
	});
});

describe("transferOwnership", async () => {
	it("should transfer ownership immediately when no email is configured", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers: ownerHeaders, user: owner } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-immediate", slug: "transfer-immediate" },
			headers: ownerHeaders,
		});

		// Add a member who will become the new owner
		const newOwnerUser = await auth.api.signUpEmail({
			body: {
				email: "newowner@test.com",
				password: "password",
				name: "New Owner",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: newOwnerUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const newOwnerMember = members?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);

		const res = await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: newOwnerMember?.id as string,
			},
			headers: ownerHeaders,
		});
		expect(res).toMatchObject({
			success: true,
			message: "Ownership transferred",
		});

		// Verify roles were swapped
		const updatedMembers = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const updatedNewOwner = updatedMembers?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);
		const updatedOldOwner = updatedMembers?.members.find(
			(m: any) => m.userId === owner.id,
		);
		expect(updatedNewOwner?.role).toContain("owner");
		expect(updatedOldOwner?.role).not.toContain("owner");
	});

	it("should send email and not transfer immediately when configured", async () => {
		let capturedToken = "";
		let capturedUrl = "";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					sendTransferOwnershipEmail: async (data) => {
						capturedToken = data.token;
						capturedUrl = data.url;
					},
				}),
			],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-email", slug: "transfer-email" },
			headers: ownerHeaders,
		});
		await auth.api.setActiveOrganization({
			body: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});

		const newOwnerUser = await auth.api.signUpEmail({
			body: {
				email: "newowner-email@test.com",
				password: "password",
				name: "New Owner Email",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: newOwnerUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const newOwnerMember = members?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);

		const res = await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: newOwnerMember?.id as string,
			},
			headers: ownerHeaders,
		});
		expect(res).toMatchObject({
			success: true,
			message: "Transfer confirmation email sent",
		});
		expect(capturedToken).toHaveLength(32);
		expect(capturedUrl).toContain("/organization/transfer-ownership/callback");
		expect(capturedUrl).toContain(capturedToken);

		// Ownership should NOT have changed yet
		const updatedMembers = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const pendingNewOwner = updatedMembers?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);
		expect(pendingNewOwner?.role).not.toContain("owner");
	});

	it("should complete transfer via GET callback endpoint", async () => {
		let capturedToken = "";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					sendTransferOwnershipEmail: async (data) => {
						capturedToken = data.token;
					},
				}),
			],
		});
		const { headers: ownerHeaders, user: owner } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-callback", slug: "transfer-callback" },
			headers: ownerHeaders,
		});
		await auth.api.setActiveOrganization({
			body: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});

		const newOwnerUser = await auth.api.signUpEmail({
			body: {
				email: "newowner-cb@test.com",
				password: "password",
				name: "New Owner CB",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: newOwnerUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const newOwnerMember = members?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);

		// Initiate transfer
		await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: newOwnerMember?.id as string,
			},
			headers: ownerHeaders,
		});
		expect(capturedToken).toHaveLength(32);

		// New owner signs in and uses the callback
		const newOwnerSignIn = await auth.api.signInEmail({
			body: { email: "newowner-cb@test.com", password: "password" },
			asResponse: true,
		});
		const newOwnerHeaders = new Headers();
		newOwnerSignIn.headers.getSetCookie().forEach((cookie: string) => {
			newOwnerHeaders.append("cookie", cookie);
		});

		const res = await auth.api.transferOwnershipCallback({
			query: { token: capturedToken },
			headers: newOwnerHeaders,
		});
		expect(res).toMatchObject({
			success: true,
			message: "Ownership transferred",
		});

		// Verify roles
		const updatedMembers = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const updatedNewOwner = updatedMembers?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);
		const updatedOldOwner = updatedMembers?.members.find(
			(m: any) => m.userId === owner.id,
		);
		expect(updatedNewOwner?.role).toContain("owner");
		expect(updatedOldOwner?.role).not.toContain("owner");
	});

	it("should complete transfer via POST body token (new owner accepting)", async () => {
		let capturedToken = "";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					sendTransferOwnershipEmail: async (data) => {
						capturedToken = data.token;
					},
				}),
			],
		});
		const { headers: ownerHeaders, user: owner } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-post-token", slug: "transfer-post-token" },
			headers: ownerHeaders,
		});
		await auth.api.setActiveOrganization({
			body: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});

		const newOwnerUser = await auth.api.signUpEmail({
			body: {
				email: "newowner-post@test.com",
				password: "password",
				name: "New Owner Post",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: newOwnerUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const newOwnerMember = members?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);

		// Initiate transfer as the current owner
		await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: newOwnerMember?.id as string,
			},
			headers: ownerHeaders,
		});
		expect(capturedToken).toHaveLength(32);

		// New owner signs in and confirms via POST body token (not GET callback)
		const newOwnerSignIn = await auth.api.signInEmail({
			body: { email: "newowner-post@test.com", password: "password" },
			asResponse: true,
		});
		const newOwnerHeaders = new Headers();
		newOwnerSignIn.headers.getSetCookie().forEach((cookie: string) => {
			newOwnerHeaders.append("cookie", cookie);
		});

		const res = await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				token: capturedToken,
			},
			headers: newOwnerHeaders,
		});
		expect(res).toMatchObject({
			success: true,
			message: "Ownership transferred",
		});

		// Verify roles were swapped
		const updatedMembers = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const updatedNewOwner = updatedMembers?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);
		const updatedOldOwner = updatedMembers?.members.find(
			(m: any) => m.userId === owner.id,
		);
		expect(updatedNewOwner?.role).toContain("owner");
		expect(updatedOldOwner?.role).not.toContain("owner");
	});

	it("should reject POST body token if wrong user tries to accept", async () => {
		let capturedToken = "";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					sendTransferOwnershipEmail: async (data) => {
						capturedToken = data.token;
					},
				}),
			],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-post-wrong", slug: "transfer-post-wrong" },
			headers: ownerHeaders,
		});
		await auth.api.setActiveOrganization({
			body: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});

		const newOwnerUser = await auth.api.signUpEmail({
			body: {
				email: "newowner-pw@test.com",
				password: "password",
				name: "New Owner PW",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: newOwnerUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const newOwnerMember = members?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);

		await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: newOwnerMember?.id as string,
			},
			headers: ownerHeaders,
		});

		// A third user signs in and tries to accept the token via POST
		const thirdSignIn = await auth.api.signInEmail({
			body: { email: "test@test.com", password: "test123456" },
			asResponse: true,
		});
		const thirdHeaders = new Headers();
		thirdSignIn.headers.getSetCookie().forEach((cookie: string) => {
			thirdHeaders.append("cookie", cookie);
		});

		const res = await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				token: capturedToken,
			},
			headers: thirdHeaders,
			asResponse: true,
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.code).toBe("INVALID_TRANSFER_TOKEN");
	});

	it("should reject callback if wrong user tries to accept", async () => {
		let capturedToken = "";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					sendTransferOwnershipEmail: async (data) => {
						capturedToken = data.token;
					},
				}),
			],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-wrong-user", slug: "transfer-wrong-user" },
			headers: ownerHeaders,
		});
		await auth.api.setActiveOrganization({
			body: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});

		const newOwnerUser = await auth.api.signUpEmail({
			body: {
				email: "newowner-wu@test.com",
				password: "password",
				name: "New Owner WU",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: newOwnerUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const newOwnerMember = members?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);

		await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: newOwnerMember?.id as string,
			},
			headers: ownerHeaders,
		});

		// A third user tries to accept with the token via GET callback
		const _thirdUser = await auth.api.signUpEmail({
			body: {
				email: "thirduser@test.com",
				password: "password",
				name: "Third User",
			},
			asResponse: true,
		});
		const thirdSignIn = await auth.api.signInEmail({
			body: { email: "thirduser@test.com", password: "password" },
			asResponse: true,
		});
		const thirdHeaders = new Headers();
		thirdSignIn.headers.getSetCookie().forEach((cookie: string) => {
			thirdHeaders.append("cookie", cookie);
		});

		const res = await auth.api.transferOwnershipCallback({
			query: { token: capturedToken },
			headers: thirdHeaders,
			asResponse: true,
		});
		expect(res.status).toBe(400);
	});

	it("should reject an invalid (non-existent) token", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					sendTransferOwnershipEmail: async () => {},
				}),
			],
		});
		const { headers } = await signInWithTestUser();

		const res = await auth.api.transferOwnershipCallback({
			query: { token: "invalid-token-value" },
			headers,
			asResponse: true,
		});
		expect(res.status).toBe(400);
	});

	it("should reject an expired token", async () => {
		let capturedToken = "";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					sendTransferOwnershipEmail: async (data) => {
						capturedToken = data.token;
					},
					transferOwnershipTokenExpiresIn: 1, // 1 second
				}),
			],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-expired", slug: "transfer-expired" },
			headers: ownerHeaders,
		});
		await auth.api.setActiveOrganization({
			body: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});

		const newOwnerUser = await auth.api.signUpEmail({
			body: {
				email: "newowner-exp@test.com",
				password: "password",
				name: "New Owner Exp",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: newOwnerUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const newOwnerMember = members?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);

		// Initiate the transfer to capture the token
		await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: newOwnerMember?.id as string,
			},
			headers: ownerHeaders,
		});
		expect(capturedToken).toHaveLength(32);

		// Advance time past the 1-second expiry
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(2000);

		const newOwnerSignIn = await auth.api.signInEmail({
			body: { email: "newowner-exp@test.com", password: "password" },
			asResponse: true,
		});
		const newOwnerHeaders = new Headers();
		newOwnerSignIn.headers.getSetCookie().forEach((cookie: string) => {
			newOwnerHeaders.append("cookie", cookie);
		});

		const res = await auth.api.transferOwnershipCallback({
			query: { token: capturedToken },
			headers: newOwnerHeaders,
			asResponse: true,
		});

		vi.useRealTimers();
		expect(res.status).toBe(400);
	});

	it("should reject non-owner attempting to initiate transfer", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-non-owner", slug: "transfer-non-owner" },
			headers: ownerHeaders,
		});

		// Add an admin member
		const adminUser = await auth.api.signUpEmail({
			body: {
				email: "admin-no@test.com",
				password: "password",
				name: "Admin No",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: adminUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const adminMember = members?.members.find(
			(m: any) => m.userId === adminUser?.user?.id,
		);

		// Admin signs in and tries to transfer ownership
		const adminSignIn = await auth.api.signInEmail({
			body: { email: "admin-no@test.com", password: "password" },
			asResponse: true,
		});
		const adminHeaders = new Headers();
		adminSignIn.headers.getSetCookie().forEach((cookie: string) => {
			adminHeaders.append("cookie", cookie);
		});

		const res = await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: adminMember?.id as string,
			},
			headers: adminHeaders,
			asResponse: true,
		});
		expect(res.status).toBe(403);
	});

	it("should reject transfer to a non-member", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "transfer-non-member", slug: "transfer-non-member" },
			headers: ownerHeaders,
		});

		const res = await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: "non-existent-member-id",
			},
			headers: ownerHeaders,
			asResponse: true,
		});
		expect(res.status).toBe(400);
	});

	it("should call beforeTransferOwnership and afterTransferOwnership hooks", async () => {
		const beforeHook = vi.fn();
		const afterHook = vi.fn();

		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						beforeTransferOwnership: async ({
							organization,
							newOwnerMember,
						}) => {
							beforeHook(organization.name, newOwnerMember.id);
						},
						afterTransferOwnership: async ({
							organization,
							newOwnerMember,
						}) => {
							afterHook(organization.name, newOwnerMember.id);
						},
					},
				}),
			],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: { name: "hooks-transfer", slug: "hooks-transfer" },
			headers: ownerHeaders,
		});

		const newOwnerUser = await auth.api.signUpEmail({
			body: {
				email: "newowner-hooks@test.com",
				password: "password",
				name: "New Owner Hooks",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: org?.id as string,
				userId: newOwnerUser?.user?.id as string,
				role: "admin",
			},
			headers: ownerHeaders,
		});
		const members = await auth.api.listMembers({
			query: { organizationId: org?.id as string },
			headers: ownerHeaders,
		});
		const newOwnerMember = members?.members.find(
			(m: any) => m.userId === newOwnerUser?.user?.id,
		);

		await auth.api.transferOwnership({
			body: {
				organizationId: org?.id as string,
				memberId: newOwnerMember?.id as string,
			},
			headers: ownerHeaders,
		});

		expect(beforeHook).toHaveBeenCalledWith(
			"hooks-transfer",
			newOwnerMember?.id,
		);
		expect(afterHook).toHaveBeenCalledWith(
			"hooks-transfer",
			newOwnerMember?.id,
		);
	});
});
