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

	it("should use session role when querying current user's active organization (performance optimization)", async () => {
		const { headers: testHeaders, user } = await signInWithTestUser();

		// Create a new organization for this test
		const testOrg = await client.organization.create({
			name: "test-performance-org",
			slug: "test-performance-org",
			fetchOptions: {
				headers: testHeaders,
				onSuccess: cookieSetter(testHeaders),
			},
		});

		// Set organization as active (this populates session with activeOrganizationRole)
		// IMPORTANT: Capture cookie from setActive
		await client.organization.setActive(
			{
				organizationId: testOrg.data?.id as string,
			},
			{
				headers: testHeaders,
				onSuccess: cookieSetter(testHeaders),
			},
		);

		// Verify session has activeOrganizationRole set
		const session = await client.getSession({
			fetchOptions: {
				headers: testHeaders,
			},
		});
		expect((session.data?.session as any).activeOrganizationId).toBe(
			testOrg.data?.id,
		);
		expect((session.data?.session as any).activeOrganizationRole).toBe("owner");
		expect((session.data?.session as any).activeOrganizationSlug).toBe(
			"test-performance-org",
		);

		// Call getActiveMemberRole without query params (should use session defaults)
		// This should return role from session WITHOUT database query
		const activeMemberRole = await client.organization.getActiveMemberRole({
			fetchOptions: {
				headers: testHeaders,
			},
		});

		// Should return role from session
		expect(activeMemberRole.data?.role).toBe("owner");
		expect(activeMemberRole.error).toBeNull();

		// Verify session is correct before updating role
		const sessionBeforeUpdate = await client.getSession({
			fetchOptions: { headers: testHeaders },
		});
		expect(
			(sessionBeforeUpdate.data?.session as any).activeOrganizationId,
		).toBe(testOrg.data?.id);
		expect(
			(sessionBeforeUpdate.data?.session as any).activeOrganizationRole,
		).toBe("owner");

		// Update the current user's role in the active organization
		const org = await client.organization.getFullOrganization({
			query: { organizationId: testOrg.data?.id },
			fetchOptions: { headers: testHeaders },
		});
		if (!org.data) throw new Error("Organization not found");

		const currentUserMember = org.data.members.find(
			(m) => m.userId === user.id,
		);
		if (!currentUserMember) throw new Error("Member not found");

		// Ensure we're updating the current user in the active organization
		expect(currentUserMember.userId).toBe(user.id);
		expect(currentUserMember.organizationId).toBe(testOrg.data?.id);

		// Debug: Check session values before update
		console.log("DEBUG - Before updateMemberRole:");
		console.log("  currentUserMember.userId:", currentUserMember.userId);
		console.log("  user.id:", user.id);
		console.log("  organizationId being passed:", testOrg.data?.id);
		console.log(
			"  session.activeOrganizationId:",
			(sessionBeforeUpdate.data?.session as any).activeOrganizationId,
		);
		console.log(
			"  IDs match?",
			testOrg.data?.id ===
				(sessionBeforeUpdate.data?.session as any).activeOrganizationId,
		);

		// Use the exact organizationId from session to ensure match
		const activeOrgId = (sessionBeforeUpdate.data?.session as any)
			.activeOrganizationId;
		console.log("  Using organizationId from session:", activeOrgId);

		// IMPORTANT: Add another owner first, otherwise we can't change the current user's role
		// from "owner" to "admin" (would leave org without owner)
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "second-owner@test.com",
				password: "password",
				name: "Second Owner",
			},
		});
		await auth.api.addMember({
			body: {
				organizationId: activeOrgId,
				userId: newUser.user.id,
				role: "owner",
			},
		});

		// Now we can safely change current user's role from "owner" to "admin"
		const updatedMember = await client.organization.updateMemberRole(
			{
				organizationId: activeOrgId, // Use exact value from session
				memberId: currentUserMember.id,
				role: "admin",
			},
			{
				headers: testHeaders,
				onSuccess: cookieSetter(testHeaders),
			},
		);

		console.log("DEBUG - After updateMemberRole:");
		console.log("  updatedMember:", updatedMember);
		console.log("  updatedMember.data:", updatedMember.data);
		console.log("  updatedMember.error:", updatedMember.error);
		console.log("  updatedMember.data?.role:", updatedMember.data?.role);
		console.log("  Headers cookie:", testHeaders.get("cookie"));

		// Check for errors
		// if (updatedMember.error) {
		// 	console.error("ERROR in updateMemberRole:", updatedMember.error);
		// 	throw new Error(`updateMemberRole failed: ${updatedMember.error.message}`);
		// }

		// if (!updatedMember.data) {
		// 	console.error("ERROR: updatedMember.data is null");
		// 	throw new Error("updateMemberRole returned null data");
		// }

		// Verify session was updated with new role
		const updatedSession = await client.getSession({
			fetchOptions: {
				headers: testHeaders,
			},
		});
		expect((updatedSession.data?.session as any).activeOrganizationRole).toBe(
			"admin",
		);

		// Call getActiveMemberRole again - should return updated role from session
		const updatedActiveMemberRole =
			await client.organization.getActiveMemberRole({
				fetchOptions: {
					headers: testHeaders,
				},
			});

		// Should return updated role from session (not DB)
		expect(updatedActiveMemberRole.data?.role).toBe("admin");
	});

	it("should query database when getting role for different user (not using session)", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		// Query role for a different user (selectedUserId) - should query DB, not session
		const activeMember = await client.organization.getActiveMemberRole({
			query: {
				userId: selectedUserId, // Different user
				organizationId: org.data?.id as string, // Active org
			},
			fetchOptions: {
				headers,
			},
		});

		// Should return role from DB query (member), not session (owner)
		expect(activeMember.data?.role).toBe("member");
	});

	it("should query database when getting role for different organization (not using session)", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		// Query role for current user but different organization - should query DB, not session
		const activeMember = await client.organization.getActiveMemberRole({
			query: {
				organizationId: secondOrg.data?.id as string, // Different org (not active)
			},
			fetchOptions: {
				headers,
			},
		});

		// Should return role from DB query (owner of secondOrg), not session (owner of first org)
		expect(activeMember.data?.role).toBe("owner");
	});
});
