import { describe, beforeAll, it, expect, test } from "vitest";

import { MongoClient } from "mongodb";
import { runAdapterTest } from "../test";
import { mongodbAdapter } from ".";
import { getTestInstance } from "../../test-utils/test-instance";
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
		await db.collection("sessions").deleteMany({});
	}

	beforeAll(async () => {
		await clearDb();
	});

	const adapter = mongodbAdapter(db);
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return adapter({
				user: {
					fields: {
						email: "email_address",
					},
					additionalFields: {
						test: {
							type: "string",
							defaultValue: "test",
						},
					},
				},
				session: {
					modelName: "sessions",
				},
				...customOptions,
			});
		},
		skipGenerateIdTest: true,
	});

	test("should sanitize regex input to prevent regex injection", async () => {
		await clearDb();

		const mdb = adapter({
			user: {
				fields: {
					email: "email_address",
				},
			},
			session: {
				modelName: "sessions",
			},
		});

		for (const id of ["re1", "re2", "re3"]) {
			await mdb.create({
				model: "user",
				data: {
					id,
					name: `${id} test`,
					email: `email@test-${id}.com`,
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		}
		const checkUsers = await mdb.count({ model: "user" });
		expect(checkUsers).toBe(3);

		const regexInputs = [
			".*",
			".*@",
			".*test.*",
			"^.*$",
			"test(re1|re2)",
			"test(re1)?",
		];

		for (const input of regexInputs) {
			const containOperator = await mdb.findMany({
				model: "user",
				where: [{ field: "email", operator: "contains", value: input }],
			});
			expect(containOperator.length).toBe(0);

			const startsWithOperator = await mdb.findMany({
				model: "user",
				where: [{ field: "email", operator: "starts_with", value: input }],
			});
			expect(startsWithOperator.length).toBe(0);

			const endsWithOperator = await mdb.findMany({
				model: "user",
				where: [{ field: "email", operator: "ends_with", value: input }],
			});
			expect(endsWithOperator.length).toBe(0);
		}
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
		expect(user).toBeDefined();
	});

	it("should sign in", async () => {
		const user = await auth.api.signInEmail({
			body: testUser,
		});
		expect(user).toBeDefined();
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
