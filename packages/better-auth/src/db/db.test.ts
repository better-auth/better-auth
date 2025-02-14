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
			model: "user",
		});
		const session = await db.findMany({
			model: "session",
		});
		const accounts = await db.findMany({
			model: "account",
		});
		expect(res.data).toBeDefined();
		//including the user that was created in the test instance
		expect(users).toHaveLength(2);
		expect(session).toHaveLength(2);
		expect(accounts).toHaveLength(2);
	});

	it("db hooks", async () => {
		let callback = false;
		const { client, db } = await getTestInstance({
			databaseHooks: {
				user: {
					create: {
						async before(user) {
							return {
								data: {
									...user,
									image: "test-image",
								},
							};
						},
						async after(user) {
							callback = true;
						},
					},
				},
			},
		});
		const res = await client.signUp.email({
			email: "test@email.com",
			name: "test",
			password: "password",
		});
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${res.data?.token}`,
				},
				throw: true,
			},
		});
		expect(session.user?.image).toBe("test-image");
		expect(callback).toBe(true);
	});

	it("should work with custom field names", async () => {
		const { client } = await getTestInstance({
			user: {
				fields: {
					email: "email_address",
				},
			},
		});
		const res = await client.signUp.email({
			email: "test@email.com",
			password: "password",
			name: "Test User",
		});
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${res.data?.token}`,
				},
				throw: true,
			},
		});
		expect(session.user.email).toBe("test@email.com");
	});
});
