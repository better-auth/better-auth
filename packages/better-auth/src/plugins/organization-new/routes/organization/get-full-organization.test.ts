import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("get full organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should allow getting full org on server", async () => {
		const orgData = getOrganizationData();
		const organization = await auth.api.createOrganization({
			headers,
			body: orgData,
		});
		const org = await auth.api.getFullOrganization({
			query: {
				organizationId: organization.id,
			},
			headers,
		});
		expect(org?.members.length).toBe(1);
	});

	describe("should work with slug", async (it) => {
		const plugin = organization({ defaultOrganizationIdField: "slug" });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		it("should allow getting full org on server with slug", async () => {
			const orgData = getOrganizationData();
			const organization = await auth.api.createOrganization({
				headers,
				body: orgData,
			});

			const org = await auth.api.getFullOrganization({
				headers,
				query: {
					organizationId: organization.slug,
				},
			});
			expect(org?.members.length).toBe(1);
		});

		it("should not allow getting org with id when using slug as the default organization id field", async () => {
			const orgData = getOrganizationData();
			const organization = await auth.api.createOrganization({
				headers,
				body: orgData,
			});

			await expect(async () => {
				await auth.api.getFullOrganization({
					headers,
					query: {
						organizationId: organization.id,
					},
				});
			}).rejects.toThrow("Organization not found");
		});
	});
});
