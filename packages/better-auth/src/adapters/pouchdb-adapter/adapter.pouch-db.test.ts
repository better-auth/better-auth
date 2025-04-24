import { describe, beforeAll, it, expect } from "vitest";

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
		const docs = await db.allDocs();
		await db.bulkDocs(docs.rows.map((row) => ({ ...row, _deleted: true })));
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
