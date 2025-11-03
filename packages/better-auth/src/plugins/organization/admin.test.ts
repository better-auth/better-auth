import { describe, expect } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from "../admin";
import { adminClient } from "../admin/client";
import { organizationClient } from "./client";
import { organization } from "./organization";

describe("super admin", async (it) => {
	const { customFetchImpl, signInWithTestUser, db } = await getTestInstance({
		plugins: [organization({ allowSuperAdmin: true }), admin()],
	});
	const client = createAuthClient({
		plugins: [organizationClient(), adminClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl,
		},
	});
	const { headers, user } = await signInWithTestUser();
	await db.update({
		model: "user",
		where: [{ field: "id", value: user.id }],
		update: { role: "admin" },
	});
	let orgId: string | null = null;
	it("should be allowed to create org", async () => {
		const { data, error } = await client.organization.create(
			{
				name: "test",
				slug: "test",
			},
			{
				headers,
			},
		);
		expect(error).toBe(null);
		orgId = data?.id ?? null;
	});
	it("should be allowed to update an org", async () => {
		const { data, error } = await client.organization.update(
			{
				organizationId: orgId || undefined,
				data: {
					name: "testAgain",
				},
			},
			{
				headers,
			},
		);
		expect(error).toBe(null);
		expect(data?.name).toBe("testAgain");
	});
	it("should be allowed to get a full org", async () => {
		const { data, error } = await client.organization.getFullOrganization({
			query: {
				organizationId: orgId || undefined,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(error).toBe(null);
		expect(data?.name).toBe("testAgain");
	});
	it("should be able to list all orgs", async () => {
		const { data, error } = await client.organization.listAll({
			fetchOptions: {
				headers,
			},
		});
		expect(error).toBe(null);
		expect(data?.length).toBe(1);
	});
	it("should be allowed to delete an org", async () => {
		const { data, error } = await client.organization.delete(
			{
				organizationId: orgId as string,
			},
			{
				headers,
			},
		);
		expect(error).toBe(null);
		expect(data?.name).toBe("testAgain");
	});
});
