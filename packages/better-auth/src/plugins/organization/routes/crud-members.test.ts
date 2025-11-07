import { beforeEach, describe, expect, it, vi } from "vitest";
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
		expect(members.data?.members.length).toBe(0);
		expect(members.data?.total).toBe(0);
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
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});
});

describe("updateMemberRole", async () => {
	const { auth, signInWithTestUser, cookieSetter, customFetchImpl } =
		await getTestInstance({
			plugins: [organization()],
		});

	it("should update the member role", async () => {
		const { headers, user } = await signInWithTestUser();
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

	it("should not update the member role if the member updating is not a member", async () => {
		const { headers, user } = await signInWithTestUser();
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
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
		);
	});
});

describe("activeMemberRole", async () => {
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

describe("leaveOrganization", async () => {
	const beforeRemoveMember = vi.fn();
	const afterRemoveMember = vi.fn();

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	const { auth, signInWithTestUser, cookieSetter, customFetchImpl } =
		await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						beforeRemoveMember,
						afterRemoveMember,
					},
				}),
			],
		});

	it("should call beforeRemoveMember and afterRemoveMember hooks when a member leaves", async () => {
		const { headers: ownerHeaders } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const org = await client.organization.create({
			name: "org-for-leaving",
			slug: "org-for-leaving",
			fetchOptions: {
				headers: ownerHeaders,
			},
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: "member-to-leave@test.com",
				name: "member-to-leave",
				password: "password",
			},
		});

		const newMember = await auth.api.addMember({
			body: {
				organizationId: org.data?.id as string,
				userId: newUser.user.id,
				role: "member",
			},
		});

		const memberHeaders = new Headers();
		await client.signIn.email({
			email: "member-to-leave@test.com",
			password: "password",
			fetchOptions: {
				onSuccess: cookieSetter(memberHeaders),
			},
		});

		const result = await client.organization.leave(
			{
				organizationId: org.data?.id as string,
			},
			{
				headers: memberHeaders,
			},
		);

		expect(result.error).toBeNull();
		expect(result.data?.id).toBe(newMember?.id);
		expect(beforeRemoveMember).toHaveBeenCalledOnce();
		expect(afterRemoveMember).toHaveBeenCalledOnce();

		// Verify the member is actually gone
		const members = await client.organization.listMembers({
			query: { organizationId: org.data?.id as string },
			fetchOptions: { headers: ownerHeaders },
		});
		expect(members.data?.members.length).toBe(1); // Only the owner left
		expect(
			members.data?.members.find((m) => m.id === newMember?.id),
		).toBeUndefined();
	});

	it("should prevent leaving if beforeRemoveMember hook throws an error", async () => {
		const beforeRemoveMock = vi.fn().mockImplementation(() => {
			throw new Error("Cleanup failed");
		});
		const afterRemoveMock = vi.fn();
		const {
			auth: auth2,
			signInWithTestUser: signInWithTestUser2,
			cookieSetter: cookieSetter2,
			customFetchImpl: customFetchImpl2,
		} = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						beforeRemoveMember: beforeRemoveMock,
						afterRemoveMember: afterRemoveMock,
					},
				}),
			],
		});

		const { headers: ownerHeaders } = await signInWithTestUser2();
		const client = createAuthClient({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: customFetchImpl2,
			},
		});

		const org = await client.organization.create({
			name: "org-for-hook-fail",
			slug: "org-for-hook-fail",
			fetchOptions: {
				headers: ownerHeaders,
			},
		});

		const newUser = await auth2.api.signUpEmail({
			body: {
				email: "member-hook-fail@test.com",
				name: "member-hook-fail",
				password: "password",
			},
		});

		const newMember = await auth2.api.addMember({
			body: {
				organizationId: org.data?.id as string,
				userId: newUser.user.id,
				role: "member",
			},
		});

		const memberHeaders = new Headers();
		await client.signIn.email({
			email: "member-hook-fail@test.com",
			password: "password",
			fetchOptions: {
				onSuccess: cookieSetter2(memberHeaders),
			},
		});

		const result = await client.organization.leave(
			{
				organizationId: org.data?.id as string,
			},
			{
				headers: memberHeaders,
			},
		);

		expect(result.error).toBeTruthy();
		expect(result.error?.message).toBe("Cleanup failed");
		expect(beforeRemoveMock).toHaveBeenCalledOnce();
		expect(afterRemoveMock).not.toHaveBeenCalled();

		// Verify the member is NOT gone
		const members = await client.organization.listMembers({
			query: { organizationId: org.data?.id as string },
			fetchOptions: { headers: ownerHeaders },
		});
		expect(members.data?.members.length).toBe(2); // Owner and member
		expect(
			members.data?.members.find((m) => m.id === newMember?.id),
		).toBeDefined();
	});

	it("should allow differentiation via ctx in beforeRemoveMember hook", async () => {
		const hookLog: string[] = [];
		const beforeRemoveMock = vi.fn().mockImplementation((data, ctx) => {
			if (ctx.request?.url.includes("/organization/leave")) {
				hookLog.push("self-leave");
			} else {
				hookLog.push("admin-remove");
			}
		});
		const {
			auth: auth2,
			signInWithTestUser: signInWithTestUser2,
			cookieSetter: cookieSetter2,
			customFetchImpl: customFetchImpl2,
		} = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						beforeRemoveMember: beforeRemoveMock,
					},
				}),
			],
		});

		const { headers: ownerHeaders } = await signInWithTestUser2();
		const client = createAuthClient({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: customFetchImpl2,
			},
		});

		const org = await client.organization.create({
			name: "org-for-ctx-test",
			slug: "org-for-ctx-test",
			fetchOptions: {
				headers: ownerHeaders,
			},
		});

		const newUser = await auth2.api.signUpEmail({
			body: {
				email: "member-ctx-test@test.com",
				name: "member-ctx-test",
				password: "password",
			},
		});

		await auth2.api.addMember({
			body: {
				organizationId: org.data?.id as string,
				userId: newUser.user.id,
				role: "member",
			},
		});

		const memberHeaders = new Headers();
		await client.signIn.email({
			email: "member-ctx-test@test.com",
			password: "password",
			fetchOptions: {
				onSuccess: cookieSetter2(memberHeaders),
			},
		});

		await client.organization.leave(
			{
				organizationId: org.data?.id as string,
			},
			{
				headers: memberHeaders,
			},
		);

		expect(beforeRemoveMock).toHaveBeenCalledOnce();
		expect(hookLog).toContain("self-leave");
	});
});
