import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../helpers/error-codes";
import { organization } from "../organization";
import { defineInstance, getOrganizationData } from "../test/utils";

describe("check organization slug", async (it) => {
	const { signInWithTestUser, client } = await defineInstance([organization()]);

	it("should check if organization slug is available", async () => {
		const { headers } = await signInWithTestUser();

		const unusedSlug = await client.organization.checkSlug({
			slug: "unused-slug-" + crypto.randomUUID(),
			fetchOptions: {
				headers,
			},
		});

		expect(unusedSlug.data?.status).toBe(true);

		const orgData = getOrganizationData();
		const organization = await client.organization.create({
			...orgData,
			fetchOptions: {
				headers,
			},
		});

		expect(organization.data?.slug).toBeDefined();

		const existingSlug = await client.organization.checkSlug({
			slug: organization.data?.slug!,
			fetchOptions: {
				headers,
			},
		});
		expect(existingSlug.error?.status).toBe(400);
		const err = ORGANIZATION_ERROR_CODES.ORGANIZATION_SLUG_ALREADY_TAKEN;
		expect(existingSlug.error?.message).toBe(err.message);
	});

	it("should not allow checking slug if slugs are disabled", async () => {
		const plugin = organization({ disableSlugs: true });
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		await expect(async () => {
			await auth.api.checkOrganizationSlug({
				headers,
				body: {
					slug: "unused-slug-" + crypto.randomUUID(),
				},
			});
		}).rejects.toThrow(ORGANIZATION_ERROR_CODES.SLUG_IS_NOT_ALLOWED.message);
	});
});
