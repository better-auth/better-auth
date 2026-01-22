import { describe, expect } from "vitest";
import { organization } from "../organization";
import { defineInstance, getOrganizationData } from "../test/utils";

describe("delete organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser, adapter } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should delete an organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		expect(org).toBeDefined();

		await auth.api.deleteOrganization({
			headers,
			body: { organizationId: org.id },
		});

		const deletedOrg = await adapter.findOne({
			model: "organization",
			where: [{ field: "id", value: org.id }],
		});

		expect(deletedOrg).toBeNull();
	});

	it("should prevent deleting an undefined organization", async () => {
		const { headers } = await signInWithTestUser();
		const randomOrgId = "123";

		expect(
			auth.api.deleteOrganization({
				headers,
				body: { organizationId: randomOrgId },
			}),
		).rejects.toThrow("Organization not found");
	});
});
