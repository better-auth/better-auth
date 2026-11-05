import { describe, expect, it } from "vitest";
import { organization } from "../plugins/organization";
import { getTestInstance } from "../test-utils/test-instance";

describe("auth.api.$asUser", () => {
	it("runs organization calls as that user without request headers", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers, user } = await signInWithTestUser();
		const created = await auth.api.createOrganization({
			body: { name: "Home", slug: "home" },
			headers,
		});
		expect(created?.id).toBeTruthy();

		await expect(auth.api.listOrganizations({})).rejects.toBeTruthy();

		const asUser = await auth.api.$asUser(user.id).listOrganizations({});
		expect(asUser?.map((org) => org.id)).toContain(created?.id);

		const other = await auth.api.signUpEmail({
			body: {
				email: "other@example.com",
				password: "passwordpassword",
				name: "Other",
			},
		});
		const otherOrgs = await auth.api
			.$asUser(other?.user.id ?? "")
			.listOrganizations({});
		expect(otherOrgs).toEqual([]);
	});

	it("rejects an unknown user", async () => {
		const { auth } = await getTestInstance({
			plugins: [organization()],
		});
		await expect(
			auth.api.$asUser("missing-user").listOrganizations({}),
		).rejects.toBeTruthy();
	});
});
