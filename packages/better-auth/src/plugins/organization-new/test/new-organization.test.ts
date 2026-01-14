import { describe, expect } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organization } from "../organization";

describe("organization", async (it) => {
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
		expect(org.id).toBeDefined();
		expect(org.name).toBeDefined();
		expect(org.slug).toBe("test-org");
		expect(org.metadata).toStrictEqual({ test: "organization-metadata" });

		expect(org.members.length).toBe(1);
		expect(org.members[0]!.userId).toBe(user.id);
		expect(org.members[0]!.id).toBeDefined();
	});

	describe("disable slugs", async (it) => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					disableSlugs: true,
				}),
			],
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
					metadata: {
						test: "organization-metadata",
					},
				},
			});

			expect(org).toBeDefined();
			expect(org.id).toBeDefined();
			expect(org.name).toBeDefined();
			expect((org as any).slug).toBeUndefined();
			expect(org.metadata).toStrictEqual({ test: "organization-metadata" });

			expect(org.members.length).toBe(1);
			expect(org.members[0]!.userId).toBe(user.id);
			expect(org.members[0]!.id).toBeDefined();
		});
	});
});
