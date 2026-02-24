import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect } from "vitest";
import { organizationClient } from "../../client";
import { organization } from "../../organization";
import { getOrganizationData } from "../../test/utils";

/**
 * Helper to define `getTestInstance` as a shorter alias, specific to the organization plugin.
 * @internal
 */
async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);

	const adapter = (await instance.auth.$context).adapter;

	return { ...instance, adapter };
}

describe("get organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should allow getting organization by organizationId on server", async () => {
		const orgData = getOrganizationData();
		const organization = await auth.api.createOrganization({
			headers,
			body: orgData,
		});
		const org = await auth.api.getOrganization({
			headers,
			query: {
				organizationId: organization.id,
			},
		});
		expect(org).toBeDefined();
		expect(org?.id).toBeDefined();
		expect(org?.name).toBeDefined();
		expect(org?.slug).toBeDefined();
		expect(org?.metadata).toBeDefined();
		expect(org?.createdAt).toBeDefined();
		expect(org?.logo).toBeDefined();
		expect(org).not.toHaveProperty("members");
		expect(org).not.toHaveProperty("invitations");
		expect(org).not.toHaveProperty("teams");
	});

	describe("should work with slug", async (it) => {
		const plugin = organization({ defaultOrganizationIdField: "slug" });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		it("should allow getting organization by organizationId on server with slug", async () => {
			const orgData = getOrganizationData();
			const organization = await auth.api.createOrganization({
				headers,
				body: orgData,
			});
			const org = await auth.api.getOrganization({
				headers,
				query: {
					organizationId: organization.slug,
				},
			});
			expect(org).toBeDefined();
			expect(org?.id).toBeDefined();
			expect(org?.name).toBeDefined();
			expect(org?.slug).toBeDefined();
			expect(org?.metadata).toBeDefined();
			expect(org?.createdAt).toBeDefined();
			expect(org?.logo).toBeDefined();
		});

		it("should not allow getting organization by organizationId on server with id when using slug as the default organization id field", async () => {
			const orgData = getOrganizationData();
			const organization = await auth.api.createOrganization({
				headers,
				body: orgData,
			});
			await expect(async () => {
				await auth.api.getOrganization({
					headers,
					query: {
						organizationId: organization.id,
					},
				});
			}).rejects.toThrow("Organization not found");
		});
	});
});
