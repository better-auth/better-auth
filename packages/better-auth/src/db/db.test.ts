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
		expect(res.data?.user.image).toBe("test-image");
		expect(callback).toBe(true);
	});

	it("should work with custom field names", async () => {
		const { client, signInWithTestUser } = await getTestInstance({
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
		expect(res.data?.user.email).toBe("test@email.com");
		const { headers } = await signInWithTestUser();
		const res2 = await client.updateUser(
			{
				name: "New Name",
			},
			{
				headers,
			},
		);
		expect(res2.data?.user.name).toBe("New Name");
	});
});
