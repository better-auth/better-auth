import { describe, expect } from "vitest";
import { organization } from "../organization";
import { defineInstance, getOrganizationData } from "../test/utils";

describe("update organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser, client } = await defineInstance([plugin]);
	const { headers, user } = await signInWithTestUser();

	it("should update an organization", async () => {
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

	describe("disable slugs", async (it) => {
		const plugin = organization({ disableSlugs: true });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers, user } = await signInWithTestUser();
	});
});
