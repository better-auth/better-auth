import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("list members", async (it) => {
	const plugin = organization();
	const { auth, client, adapter, signInWithTestUser, signInWithUser } =
		await defineInstance([plugin]);
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

	// Create a second organization for testing
	const secondOrgData = getOrganizationData();
	const secondOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: secondOrgData.name,
			slug: secondOrgData.slug,
		},
	});

	// Add 10 members to the test organization
	it("setup: add members to organization", async () => {
		for (let i = 0; i < 10; i++) {
			const user = await adapter.create({
				model: "user",
				data: {
					email: `test-member-${i}-${crypto.randomUUID()}@test.com`,
					name: `Test Member ${i}`,
				},
			});
			await auth.api.addMember({
				body: {
					organizationId: testOrg.id,
					userId: user.id,
					role: "member",
				},
			});
		}
	});

	it("should return all members", async () => {
		await client.organization.setActive({
			organizationId: testOrg.id,
			fetchOptions: {
				headers,
			},
		});

		const result = await auth.api.listMembers({
			headers,
		});

		expect(result.members.length).toBe(11);
		expect(result.total).toBe(11);
	});

	it("should return all members using client API", async () => {
		await client.organization.setActive({
			organizationId: testOrg.id,
			fetchOptions: {
				headers,
			},
		});

		const result = await client.organization.listMembers({
			fetchOptions: {
				headers,
			},
		});

		expect(result.data?.members.length).toBe(11);
		expect(result.data?.total).toBe(11);
	});

	it("should return all members by organization slug", async () => {
		const result = await auth.api.listMembers({
			headers,
			query: {
				organizationSlug: secondOrgData.slug,
			},
		});

		expect(result.members.length).toBe(11);
		expect(result.total).toBe(11);
	});

	it("should limit the number of members", async () => {
		const result = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
				limit: 5,
			},
		});

		expect(result.members.length).toBe(5);
		expect(result.total).toBe(11);
		expect(result.limit).toBe(5);
	});

	it("should offset the members", async () => {
		const result = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
				offset: 5,
			},
		});

		expect(result.members.length).toBe(6); // 11 - 5 = 6
		expect(result.total).toBe(11);
		expect(result.offset).toBe(5);
	});

	it("should support pagination with both limit and offset", async () => {
		const page1 = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
				limit: 3,
				offset: 0,
			},
		});

		const page2 = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
				limit: 3,
				offset: 3,
			},
		});

		expect(page1.members.length).toBe(3);
		expect(page1.total).toBe(11);

		expect(page2.members.length).toBe(3);
		expect(page2.total).toBe(11);

		// Ensure different members are returned
		const page1Ids = page1.members.map((m) => m.id);
		const page2Ids = page2.members.map((m) => m.id);
		const overlap = page1Ids.filter((id) => page2Ids.includes(id));
		expect(overlap.length).toBe(0);
	});

	it("should filter members by role", async () => {
		const result = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
				filterField: "role",
				filterOperator: "ne",
				filterValue: "owner",
			},
		});

		expect(result.members.length).toBe(10);
		expect(result.total).toBe(10);
	});

	it("should sort members", async () => {
		// First get default sorted members
		const defaultResult = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
			},
		});

		const firstMember = defaultResult.members[0];
		const secondMember = defaultResult.members[1];

		if (!firstMember || !secondMember) {
			throw new Error("Expected at least 2 members");
		}

		// Update second member to have an earlier createdAt
		await adapter.update({
			model: "member",
			where: [{ field: "id", value: secondMember.id }],
			update: {
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
			},
		});

		// Sort by createdAt ascending (oldest first)
		const sortedResult = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
				sortBy: "createdAt",
				sortDirection: "asc",
			},
		});

		// The second member should now be first (oldest)
		expect(sortedResult.members[0]?.id).toBe(secondMember.id);
	});

	it("should list members by organization id", async () => {
		const result = await auth.api.listMembers({
			headers,
			query: {
				organizationId: secondOrg.id,
			},
		});

		expect(result.members.length).toBe(1);
		expect(result.total).toBe(1);
	});

	it("should not list members if not a member", async () => {
		// Create a new user who is not a member
		const otherUserEmail = `non-member-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: otherUserEmail,
				password: "test123456",
				name: "Non Member User",
			},
		});
		const { headers: otherHeaders } = await signInWithUser(
			otherUserEmail,
			"test123456",
		);

		await expect(
			auth.api.listMembers({
				headers: otherHeaders,
				query: {
					organizationId: testOrg.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION
				.message,
		);
	});

	it("should not list members without authentication", async () => {
		await expect(
			auth.api.listMembers({
				headers: new Headers(),
				query: {
					organizationId: testOrg.id,
				},
			}),
		).rejects.toThrow();
	});

	it("should use active organization when organizationId is not provided", async () => {
		await auth.api.setActiveOrganization({
			headers,
			body: {
				organizationId: testOrg.id,
			},
		});

		const result = await auth.api.listMembers({
			headers,
		});

		expect(result.members.length).toBe(11);
		expect(result.total).toBe(11);
	});

	it("should return empty when offset exceeds total", async () => {
		const result = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
				offset: 100,
			},
		});

		expect(result.members.length).toBe(0);
		expect(result.total).toBe(11);
	});

	it("should handle string query parameters for limit and offset", async () => {
		const result = await auth.api.listMembers({
			query: { organizationId: testOrg.id, limit: "3", offset: "1" } as any,
			headers,
		});

		expect(result.members.length).toBe(3);
		expect(result.total).toBe(11);
		expect(result.limit).toBe(3);
		expect(result.offset).toBe(1);
	});

	it("should require organizationId when no active organization", async () => {
		// Create a new user with no active organization
		const newUserEmail = `no-org-user-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: newUserEmail,
				password: "test123456",
				name: "New User",
			},
		});
		const { headers: newHeaders } = await signInWithUser(
			newUserEmail,
			"test123456",
		);

		await expect(
			auth.api.listMembers({
				headers: newHeaders,
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION.message);
	});
});

describe("list members with custom membershipLimit", async (it) => {
	const plugin = organization({
		membershipLimit: 5,
	});
	const { auth, adapter, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	// Create an organization
	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	// Add 3 more members (owner + 3 = 4 members)
	it("setup: add members", async () => {
		for (let i = 0; i < 3; i++) {
			const newUser = await adapter.create({
				model: "user",
				data: {
					email: `limit-test-member-${i}-${crypto.randomUUID()}@test.com`,
					name: `Limit Test Member ${i}`,
				},
			});
			await auth.api.addMember({
				body: {
					organizationId: testOrg.id,
					userId: newUser.id,
					role: "member",
				},
			});
		}
	});

	it("should use membershipLimit as default limit", async () => {
		const result = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
			},
		});

		// Should return all 4 members (since we only have 4, which is less than limit of 5)
		expect(result.members.length).toBe(4);
		expect(result.total).toBe(4);
	});

	it("should allow overriding membershipLimit with query param", async () => {
		const result = await auth.api.listMembers({
			headers,
			query: {
				organizationId: testOrg.id,
				limit: 2,
			},
		});

		expect(result.members.length).toBe(2);
		expect(result.total).toBe(4);
		expect(result.limit).toBe(2);
	});
});
