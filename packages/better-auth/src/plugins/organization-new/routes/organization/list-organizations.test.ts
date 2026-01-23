import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("list organizations", async (it) => {
	const plugin = organization();
	const { auth, client, signInWithTestUser, cookieSetter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const organizationIds: string[] = [];

	it("setup: create multiple organizations", async () => {
		// Create 5 organizations for pagination testing
		for (let i = 0; i < 5; i++) {
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
					slug: orgData.slug,
				},
			});
			organizationIds.push(org.id);
		}
		expect(organizationIds.length).toBe(5);
	});

	it("should list all organizations for a user", async () => {
		const result = await client.organization.list({
			fetchOptions: {
				headers,
			},
		});

		expect(result.data).toBeDefined();
		expect(result.data?.organizations.length).toBe(5);
		expect(result.data?.total).toBe(5);
	});

	it("should list organizations with server API", async () => {
		const result = await auth.api.listOrganizations({
			headers,
		});

		expect(result).toBeDefined();
		expect(result.organizations.length).toBe(5);
		expect(result.total).toBe(5);
	});

	it("should support pagination with limit", async () => {
		const result = await client.organization.list({
			query: {
				limit: 2,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(result.data?.organizations.length).toBe(2);
		expect(result.data?.total).toBe(5);
		expect(result.data?.limit).toBe(2);
		expect(result.data?.offset).toBe(0);
	});

	it("should support pagination with offset", async () => {
		const result = await client.organization.list({
			query: {
				offset: 3,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(result.data?.organizations.length).toBe(2); // 5 total - 3 offset = 2
		expect(result.data?.total).toBe(5);
		expect(result.data?.offset).toBe(3);
	});

	it("should support pagination with both limit and offset", async () => {
		const page1 = await client.organization.list({
			query: {
				limit: 2,
				offset: 0,
			},
			fetchOptions: {
				headers,
			},
		});

		const page2 = await client.organization.list({
			query: {
				limit: 2,
				offset: 2,
			},
			fetchOptions: {
				headers,
			},
		});

		const page3 = await client.organization.list({
			query: {
				limit: 2,
				offset: 4,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(page1.data?.organizations.length).toBe(2);
		expect(page1.data?.total).toBe(5);

		expect(page2.data?.organizations.length).toBe(2);
		expect(page2.data?.total).toBe(5);

		expect(page3.data?.organizations.length).toBe(1); // Only 1 remaining
		expect(page3.data?.total).toBe(5);
	});

	it("should return empty array when offset exceeds total", async () => {
		const result = await client.organization.list({
			query: {
				offset: 100,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(result.data?.organizations.length).toBe(0);
		expect(result.data?.total).toBe(5);
	});

	it("should handle string query parameters for limit and offset", async () => {
		const result = await auth.api.listOrganizations({
			query: { limit: "2", offset: "1" } as any,
			headers,
		});

		expect(result.organizations.length).toBe(2);
		expect(result.total).toBe(5);
		expect(result.limit).toBe(2);
		expect(result.offset).toBe(1);
	});

	it("should return empty list for user with no organizations", async () => {
		// Create a new user who has no organizations
		const newHeaders = new Headers();
		await client.signUp.email(
			{
				email: "no-orgs-user@test.com",
				password: "password123",
				name: "no-orgs-user",
			},
			{
				onSuccess: cookieSetter(newHeaders),
			},
		);

		const result = await client.organization.list({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(result.data?.organizations.length).toBe(0);
		expect(result.data?.total).toBe(0);
	});

	it("should require authentication", async () => {
		const result = await client.organization.list({
			fetchOptions: {
				headers: new Headers(), // No auth headers
			},
		});

		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(401);
	});
});

describe("list organizations with custom membershipLimit", async (it) => {
	const plugin = organization({
		membershipLimit: 3,
	});
	const { auth, client, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("setup: create organizations", async () => {
		for (let i = 0; i < 5; i++) {
			const orgData = getOrganizationData();
			await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
					slug: orgData.slug,
				},
			});
		}
	});

	it("should use membershipLimit as default limit when not specified", async () => {
		const result = await client.organization.list({
			fetchOptions: {
				headers,
			},
		});

		// Should be limited to 3 (membershipLimit) by default
		expect(result.data?.organizations.length).toBe(3);
		expect(result.data?.total).toBe(5);
		expect(result.data?.limit).toBe(3);
	});

	it("should allow overriding membershipLimit with query param", async () => {
		const result = await client.organization.list({
			query: {
				limit: 5,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(result.data?.organizations.length).toBe(5);
		expect(result.data?.total).toBe(5);
		expect(result.data?.limit).toBe(5);
	});
});
