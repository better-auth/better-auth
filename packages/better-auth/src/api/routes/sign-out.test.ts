import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "../../plugins/organization";

describe("sign-out", async (it) => {
	const { signInWithTestUser, client } = await getTestInstance();

	it("should sign out", async () => {
		const { headers } = await signInWithTestUser();
		const res = await client.signOut({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toMatchObject({
			success: true,
		});
	});
});

describe("sign-out with organization", async (it) => {
	it("should set lastOrgId on sign out", async () => {
		const { auth, signInWithTestUser, client } = await getTestInstance({
			plugins: [
				organization({
					autoCreateOrganizationOnSignUp: true,
				}),
			],
		});
		const { user: testUser, headers } = await signInWithTestUser();

		const org = await auth.api.createOrganization({
			body: {
				name: "test-org",
				slug: `test-org-${Date.now()}`,
				userId: testUser.id,
			},
		});

		expect(org).toBeDefined();
		if (!org) return;

		await auth.api.setActiveOrganization({
			body: {
				organizationId: org.id,
			},
			headers,
		});

		await client.signOut({
			fetchOptions: {
				headers,
			},
		});
		const ctx = await auth.$context;
		const user = await ctx.internalAdapter.findUserById(testUser.id);
		expect(user?.lastOrgId).toBe(org.id);
	});
});
