import { describe, expect } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organization } from "../organization";

describe("organization-new", async (it) => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [organization()],
		logger: {
			level: "error",
		},
	});

	const { headers, user } = await signInWithTestUser();

	it("should create an organization", async () => {
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: "Test Organization",
				slug: "test-org",
				metadata: {
					test: "organization-metadata",
				},
			},
		});

		console.log(org);

		expect(org).toBeDefined();
	});
});

const r = await organization({}).endpoints.createOrganization({
	body: { name: "e", slug: "d" },
});
