import { describe, expect } from "vitest";
import { organization } from "../organization";
import { defineInstance, getOrganizationData } from "../test/utils";

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
					metadata: {
						test: "organization-metadata-updated",
					},
					name: "updated-name",
					slug: "updated-slug",
				},
			},
		});

		expect(updatedOrg).toBeDefined();
		expect(updatedOrg?.id).toBe(org.id);
		expect(updatedOrg?.name).toBe("updated-name");
		expect(updatedOrg?.slug).toBe("updated-slug");
		expect(updatedOrg?.logo).toBe("https://example.co/logo.png");
		expect(updatedOrg?.metadata).toStrictEqual({
			test: "organization-metadata-updated",
		});
	});

	describe("disable slugs", async (it) => {
		const plugin = organization({ disableSlugs: true });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers, user } = await signInWithTestUser();
	});
});
