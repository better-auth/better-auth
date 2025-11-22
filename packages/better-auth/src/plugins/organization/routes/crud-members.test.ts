import { describe, expect, it } from "vitest";
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

	it("should not update the member role if the member updating is not a member	", async () => {
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
