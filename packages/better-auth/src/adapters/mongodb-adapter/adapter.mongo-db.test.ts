import { describe, beforeAll, it, expect } from "vitest";

import { MongoClient } from "mongodb";
import { runAdapterTest } from "../test";
import { mongodbAdapter } from ".";
import { getTestInstance } from "../../test-utils/test-instance";
import type { BetterAuthOptions } from "../../types";

describe("adapter test", async () => {
	const dbClient = async (connectionString: string, dbName: string) => {
		const client = new MongoClient(connectionString);
		await client.connect();
		const db = client.db(dbName);
		return db;
	};

	const user = "user";
	const db = await dbClient("mongodb://127.0.0.1:27017", "better-auth");
	async function clearDb() {
		await db.collection(user).deleteMany({});
		await db.collection("session").deleteMany({});
	}

	beforeAll(async () => {
		await clearDb();
	});

	const adapter = mongodbAdapter(db);
	await runAdapterTest({
		adapter: adapter({
			user: {
				fields: {
					email: "email_address",
				},
			},
			session: {
				modelName: "sessions",
				additionalFields: {
					test: {
						type: "string",
						defaultValue: "test",
					},
				},
			},
		} as BetterAuthOptions),
	});
});

describe("simple-flow", async () => {
	const { auth, client, sessionSetter, db } = await getTestInstance(
		{},
		{
			disableTestUser: true,
			testWith: "mongodb",
		},
	);
	const testUser = {
		email: "test-eamil@email.com",
		password: "password",
		name: "Test Name",
	};

	it("should sign up", async () => {
		const user = await auth.api.signUpEmail({
			body: testUser,
		});
		expect(user.user).toBeDefined();
		expect(user.session).toBeDefined();
	});

	it("should sign in", async () => {
		const user = await auth.api.signInEmail({
			body: testUser,
		});
		expect(user.user).toBeDefined();
		expect(user.session).toBeDefined();
	});

	it("should get session", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		const { data: session } = await client.getSession({
			fetchOptions: { headers },
		});
		expect(session?.user).toBeDefined();
	});
});
