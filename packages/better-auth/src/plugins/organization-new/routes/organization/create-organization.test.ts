import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("create organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser, client } = await defineInstance([plugin]);
	const { headers, user } = await signInWithTestUser();

	it("should create an organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
				metadata: {
					test: "organization-metadata",
				},
			},
		});

		expect(org).toBeDefined();
		expect(org.id).toBeDefined();
		expect(org.name).toBeDefined();
		expect(org.slug).toBe(orgData.slug);
		expect(org.metadata).toStrictEqual({ test: "organization-metadata" });
		expect(org.members.length).toBe(1);
		expect(org.members[0]!.userId).toBe(user.id);
		expect(org.members[0]!.id).toBeDefined();
	});

	it("should prevent creating organization with empty slug", async () => {
		const { headers } = await signInWithTestUser();
		const orgData = getOrganizationData();
		const organization = await client.organization.create({
			name: orgData.name,
			slug: "",
			fetchOptions: {
				headers,
			},
		});
		expect(organization.error?.status).toBe(400);
	});

	it("should prevent creating organization with empty name", async () => {
		const { headers } = await signInWithTestUser();
		const orgData = getOrganizationData();
		const organization = await client.organization.create({
			name: "",
			slug: orgData.slug,
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

		const orgData = getOrganizationData();
		const organization = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
				userId: session.data?.session.userId,
			},
		});

		expect(organization?.name).toBe(orgData.name);
		expect(organization?.members.length).toBe(1);
		expect(organization?.members[0]?.role).toBe("owner");
	});

	describe("disable slugs", async (it) => {
		const plugin = organization({ disableSlugs: true });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers, user } = await signInWithTestUser();

		it("should create an organization", async () => {
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
					metadata: {
						test: "organization-metadata",
					},
				},
			});

			expect(org).toBeDefined();
			expect(org.id).toBeDefined();
			expect(org.name).toBeDefined();
			expect((org as any).slug).toBeUndefined();
			expect(org.metadata).toStrictEqual({ test: "organization-metadata" });
			expect(org.members.length).toBe(1);
			expect(org.members[0]!.userId).toBe(user.id);
			expect(org.members[0]!.id).toBeDefined();
		});
	});
});
