import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

describe("db", async () => {
	it("should work with custom model names", async () => {
		const { client, db } = await getTestInstance({
			user: {
				modelName: "users",
			},
			session: {
				modelName: "sessions",
			},
			account: {
				modelName: "accounts",
			},
		});
		const res = await client.signUp.email({
			email: "test@email2.com",
			password: "password",
			name: "Test User",
		});
		const users = await db.findMany({
			model: "users",
		});
		const session = await db.findMany({
			model: "sessions",
		});
		const accounts = await db.findMany({
			model: "accounts",
		});
		expect(res.data).toBeDefined();
		//including the user that was created in the test instance
		expect(users).toHaveLength(2);
		expect(session).toHaveLength(2);
		expect(accounts).toHaveLength(2);
	});

	it("should work with custom model names and custom fields", async () => {
		const { client, db } = await getTestInstance({
			user: {
				modelName: "users",
				fields: {
					name: "full_name",
				},
			},
		});
		await client.signUp.email({
			email: "test@mail.com",
			password: "password",
			name: "Test User",
		});
		const result = await db.findMany({
			model: "users",
		});
		console.log({ result });
	});
});
