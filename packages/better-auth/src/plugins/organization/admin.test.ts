import { describe, expect, expectTypeOf } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { organizationClient } from "./client";
import { adminClient } from "../admin/client";
import { admin, type UserWithRole } from "../admin";
import { organization } from "./organization";

describe("super admin", async (it) => {
	const { customFetchImpl, signInWithTestUser, db } = await getTestInstance(
		{
			plugins: [organization(), admin()],
		},
	);
	const client = createAuthClient({
		plugins: [organizationClient(), adminClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl,
		},
	});
	const { headers, user } = await signInWithTestUser();
	await db.update({model: "user", where: [{field: "id", value: user.id}], update: {role: "admin"}})
	let orgId;
	it("should be allowed to create org", async () => {
		const {data, error} = await client.organization.create(
			{
				name: "test",
				slug: "test",
			},
			{
				headers,
			},
		);
		expect(error).toBe(null);
		orgId = data?.id;
	});
	it("should be allowed to update an org", async () => {
		const {data, error} = await client.organization.update(
			{
				organizationId: orgId,
				data: {
					name: "testAgain"
				}
			},
			{
				headers,
			},
		);
		expect(error).toBe(null);
		expect(data?.name).toBe("testAgain");
	});
	it("should be allowed to get a full org", async () => {
		const {data, error} = await client.organization.getFullOrganization(
			{
				query: {
					organizationId: orgId
				},
				fetchOptions: {
					headers,
				}
			}
		);
		expect(error).toBe(null)
		expect(data?.name).toBe("testAgain");
	});
	it("should be able to list all orgs", async () => {
		const {data, error} = await client.organization.listAll({
				fetchOptions: {
					headers,
				}
			});
		expect(error).toBe(null)
		expect(data?.length).toBe(1)
	})
	it("should be allowed to delete an org", async () => {
		const {data, error} = await client.organization.delete(
			{
				organizationId: orgId,
			},
			{
				headers,
			}
		);
		expect(error).toBe(null)
		expect(data?.name).toBe("testAgain");
	});
});
