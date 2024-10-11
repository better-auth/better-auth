import { describe, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from ".";
import { adminClient } from "./client";

describe("Admin plugin", async () => {
	const { client, auth } = await getTestInstance(
		{
			plugins: [admin()],
		},
		{
			testUser: {
				role: "admin",
			},
			clientOptions: {
				plugins: [adminClient()],
			},
		},
	);

	it("should allow admin to list users", async () => {
		const res = await client.admin.listUsers();
		console.log(res);
	});
});
