import { describe, beforeAll, beforeEach, it, expect } from "vitest";

import PouchDB from "pouchdb";
import PouchDBMemory from "pouchdb-adapter-memory";
import PouchDBFind from "pouchdb-find";

import { runAdapterTest } from "../test";
import { pouchdbAdapter } from ".";
import { getTestInstance } from "../../test-utils/test-instance";

PouchDB.plugin(PouchDBMemory);
PouchDB.plugin(PouchDBFind);

describe("adapter test", async () => {
	const dbClient = async (dbName: string) => {
		const db = new PouchDB(dbName, { adapter: "memory" });
		return db;
	};

	let db = await dbClient("better-auth");
	async function clearDb() {
		const docs = await db.allDocs({ include_docs: true });
		await db.bulkDocs(docs.rows.map((row) => ({ ...row.doc, _deleted: true })));
	}

	beforeAll(async () => {
		await clearDb();
	});

	const adapter = pouchdbAdapter(db);
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return adapter({
				...customOptions,
			});
		},
		disableTests: {
			SHOULD_PREFER_GENERATE_ID_IF_PROVIDED: true,
		},
	});

	describe("additional tests", () => {
		const testAdapter = adapter({});

		beforeEach(async () => {
			await clearDb();
		});

		it("should find one with complex where clause", async () => {
			await testAdapter.create({ 
				model: "user",
				data: {
					email: "test1@example.com",
					password: "password1"
				}
			});
			await testAdapter.create({ 
				model: "user",
				data: {
					email: "test2@example.com",
					password: "password2"
				}
			});

			const found = await testAdapter.findOne({ 
				model: "user",
				where: [
					{ field: "email", operator: "contains", value: "test1" }
				]
			});

			expect(found).toBeDefined();
			expect((found as { email: string }).email).toBe("test1@example.com");

			const notFound = await testAdapter.findOne({ 
				model: "user",
				where: [
					{ field: "email", operator: "contains", value: "notfound" }
				]
			});

			expect(notFound).toBeNull();
		});

		it("should count records correctly", async () => {
			const count = await testAdapter.count({ model: "user" });
			expect(count).toBe(0);
			// Create test data
			await testAdapter.create({ model: "user", data: { email: "user1@test.com", password: "pass1" } });
			await testAdapter.create({ model: "user", data: { email: "user2@test.com", password: "pass2" } });
			await testAdapter.create({ model: "user", data: { email: "admin1@test.com", password: "pass3" } });
			await testAdapter.create({ model: "user", data: { email: "admin2@test.com", password: "pass4" } });

			// Test total count
			const totalCount = await testAdapter.count({ model: "user" });
			expect(totalCount).toBe(4);
		});
	});
});

describe("simple-flow", async () => {
	const { auth, client, sessionSetter, db } = await getTestInstance(
		{},
		{
			disableTestUser: true,
			testWith: "pouchdb",
		},
	);
	const testUser = {
		email: "test-email@email.com",
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
