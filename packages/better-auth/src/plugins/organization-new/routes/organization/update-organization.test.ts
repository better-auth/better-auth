import { describe, expect, expectTypeOf } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("update organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers, user } = await signInWithTestUser();

	it("should update an organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
				logo: "https://example.com/logo.png",
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

		const updatedOrg = await auth.api.updateOrganization({
			headers,
			body: {
				organizationId: org.id,
				data: {
					logo: "https://example.co/logo.png",
					name: "updated-name",
					slug: "updated-slug",
					metadata: {
						test: "organization-metadata-updated",
					},
				},
			},
		});

		expect(updatedOrg).toBeDefined();
		expect(updatedOrg.id).toBe(org.id);
		expect(updatedOrg.name).toBe("updated-name");
		expect(updatedOrg.slug).toBe("updated-slug");
		expect(updatedOrg.logo).toBe("https://example.co/logo.png");
		expect(updatedOrg.metadata).toStrictEqual({
			test: "organization-metadata-updated",
		});

		expectTypeOf<typeof updatedOrg.slug>().toEqualTypeOf<string>();
	});

	describe("disable slugs", async (it) => {
		const plugin = organization({ disableSlugs: true });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		it("should not update the slug", async () => {
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
					//@ts-expect-error - intentional, should be ignored.
					slug: orgData.slug,
					logo: "https://example.com/logo.png",
					metadata: {
						test: "organization-metadata",
					},
				},
			});

			const updatedOrg = await auth.api.updateOrganization({
				headers,
				body: {
					organizationId: org.id,
					data: {
						//@ts-expect-error - intentional, should be ignored.
						slug: "updated-slug",
					},
				},
			});

			expect(updatedOrg).toBeDefined();
			//@ts-expect-error - intentional, should be undefined.
			expect(updatedOrg?.slug).toBeUndefined();
		});
	});

	describe("update with additional fields", async (it) => {
		const plugin = organization({
			schema: {
				organization: {
					additionalFields: {
						test: {
							type: "string",
							required: true,
						},
					},
				},
			},
		});
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();
		it("should update the organization with additional fields", async () => {
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
					slug: orgData.slug,
					test: "test-value",
					logo: "https://example.com/logo.png",
					metadata: {
						test: "organization-metadata",
					},
				},
			});
			const updatedOrg = await auth.api.updateOrganization({
				headers,
				body: {
					organizationId: org.id,
					data: {
						test: "updated-test-value",
					},
				},
			});
			expect(updatedOrg).toBeDefined();
			expect(updatedOrg.test).toBe("updated-test-value");
		});
	});
});
