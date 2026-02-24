import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("get active member role", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, adapter } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	// Create an organization for testing
	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	// Create additional users for testing
	let selectedUserId = "";
	for (let i = 0; i < 3; i++) {
		const createdUser = await adapter.create({
			model: "user",
			data: {
				email: `get-active-member-role-test-${i}-${crypto.randomUUID()}@test.com`,
				name: `test${i}`,
			},
		});

		if (i === 0) {
			selectedUserId = createdUser.id;
		}

		await auth.api.addMember({
			body: {
				organizationId: testOrg.id,
				userId: createdUser.id,
				role: "member",
			},
		});
	}

	it("should return the active member role on active organization", async () => {
		await auth.api.setActiveOrganization({
			headers,
			body: {
				organizationId: testOrg.id,
			},
		});

		const activeMember = await auth.api.getActiveMemberRole({
			headers,
		});

		expect(activeMember?.role).toBe("owner");
	});

	it("should return active member role for a specific user", async () => {
		await auth.api.setActiveOrganization({
			headers,
			body: {
				organizationId: testOrg.id,
			},
		});

		const activeMember = await auth.api.getActiveMemberRole({
			headers,
			query: {
				userId: selectedUserId,
			},
		});

		expect(activeMember?.role).toBe("member");
	});

	it("should return role when providing organizationId", async () => {
		const activeMember = await auth.api.getActiveMemberRole({
			headers,
			query: {
				organizationId: testOrg.id,
			},
		});

		expect(activeMember?.role).toBe("owner");
	});

	it("should throw error when no active organization is set and no organizationId provided", async () => {
		// Create a new user without setting an active organization
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `no-active-org-role-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "no active org user",
			},
		});

		const newUserHeaders = new Headers();
		newUserHeaders.set("Authorization", `Bearer ${newUser.token}`);

		await expect(
			auth.api.getActiveMemberRole({
				headers: newUserHeaders,
			}),
		).rejects.toThrow("No active organization");
	});

	it("should throw error when user is not a member of the organization", async () => {
		// Create a new user
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `not-member-role-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "not a member",
			},
		});

		const newUserHeaders = new Headers();
		newUserHeaders.set("Authorization", `Bearer ${newUser.token}`);

		// Try to get role for an organization the user is not a member of
		await expect(
			auth.api.getActiveMemberRole({
				headers: newUserHeaders,
				query: {
					organizationId: testOrg.id,
				},
			}),
		).rejects.toThrow("You are not a member of this organization");
	});

	it("should throw error when querying role for user not in organization", async () => {
		// Create a new user who is not a member
		const nonMemberUser = await auth.api.signUpEmail({
			body: {
				email: `non-member-query-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "non member query",
			},
		});

		await auth.api.setActiveOrganization({
			headers,
			body: {
				organizationId: testOrg.id,
			},
		});

		// Try to get role for a user who is not a member
		await expect(
			auth.api.getActiveMemberRole({
				headers,
				query: {
					userId: nonMemberUser.user.id,
				},
			}),
		).rejects.toThrow("You are not a member of this organization");
	});
});
