import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance } from "../../test/utils";

describe("get organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should allow getting organization by organizationId on server", async () => {
		const org = await auth.api.getOrganization({
			headers,
		});
		expect(org).toBeDefined();
		expect(org?.id).toBeDefined();
		expect(org?.name).toBeDefined();
		expect(org?.slug).toBeDefined();
		expect(org?.metadata).toBeDefined();
		expect(org?.createdAt).toBeDefined();
		expect(org?.logo).toBeDefined();
	});
});
