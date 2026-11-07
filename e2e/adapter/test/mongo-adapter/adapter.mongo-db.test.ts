import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { createTestSuite, testAdapter } from "@better-auth/test-utils/adapter";
import type { BetterAuthOptions, Session, User } from "better-auth";
import { MongoClient, ObjectId } from "mongodb";
import { expect } from "vitest";
import {
	authFlowTestSuite,
	caseInsensitiveTestSuite,
	joinsTestSuite,
	normalTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../adapter-factory";
import { compoundIndexTestSuite } from "../adapter-factory/compound-index-test-suite";

const dbClient = async (connectionString: string, dbName: string) => {
	const client = new MongoClient(connectionString);
	await client.connect();
	const db = client.db(dbName);
	return { db, client };
};

const { db, client } = await dbClient(
	"mongodb://127.0.0.1:27017",
	"better-auth",
);

const updateObjectIdTestSuite = createTestSuite(
	"update-object-id",
	{},
	(helpers) => {
		return {
			"update - after update, id or FK id fields should be ObjectID":
				async () => {
					const adapter = helpers.adapter;
					const user = await adapter.create<User>({
						model: "user",
						data: {
							name: "Test User",
							email: "test@test.com",
							emailVerified: true,
							image: "test-image",
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});
					const session = await adapter.create<Session>({
						model: "session",
						data: {
							userId: user.id,
							expiresAt: new Date(0),
							createdAt: new Date(),
							updatedAt: new Date(),
							token: "test-token",
						},
					});
					const preDoc = await db
						.collection("session")
						.findOne({ _id: new ObjectId(session.id) });
					expect(preDoc?.userId).toBeInstanceOf(ObjectId);

					const result = await adapter.update<Session>({
						model: "session",
						where: [{ field: "id", value: session.id }],
						update: { ...session, expiresAt: new Date(1), id: undefined },
					});

					const postDoc = await db
						.collection("session")
						.findOne({ _id: new ObjectId(session.id) });
					expect(postDoc?.userId).toBeInstanceOf(ObjectId);

					expect(result).toBeDefined();
				},
		};
	},
);

const handlePluginOptions = {
	plugins: [
		{
			id: "field-index-handle",
			schema: {
				user: {
					fields: {
						handle: { type: "string", required: false, unique: true },
					},
				},
			},
		},
	],
} satisfies BetterAuthOptions;

/**
 * @see https://github.com/better-auth/better-auth/issues/12296
 */
const fieldLevelIndexTestSuite = createTestSuite(
	"field-level-indexes",
	{},
	(helpers) => {
		const userData = (email: string, extra: Record<string, unknown> = {}) => ({
			name: "Index User",
			email,
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date(),
			...extra,
		});
		return {
			"unique fields - concurrent creates with the same email keep one user":
				async () => {
					const results = await Promise.allSettled(
						Array.from({ length: 10 }, () =>
							helpers.adapter.create<User>({
								model: "user",
								data: userData("race@example.com"),
							}),
						),
					);
					expect(
						results.filter((result) => result.status === "fulfilled"),
					).toHaveLength(1);
					expect(
						await db
							.collection("user")
							.countDocuments({ email: "race@example.com" }),
					).toBe(1);
				},
			"unique fields - optional values may be missing on many documents": {
				migrateBetterAuth: handlePluginOptions,
				async test() {
					await helpers.adapter.create({
						model: "user",
						data: userData("no-handle-1@example.com"),
					});
					await helpers.adapter.create({
						model: "user",
						data: userData("no-handle-2@example.com", { handle: null }),
					});
					await helpers.adapter.create({
						model: "user",
						data: userData("handle-1@example.com", { handle: "ada" }),
					});
					await expect(
						helpers.adapter.create({
							model: "user",
							data: userData("handle-2@example.com", { handle: "ada" }),
						}),
					).rejects.toThrow(/duplicate key/);
				},
			},
			"unique fields - existing duplicates do not block writes": async () => {
				const collection = db.collection("existing_duplicates_user");
				await collection.insertMany([
					{ name: "A", email: "dup@example.com" },
					{ name: "B", email: "dup@example.com" },
				]);
				try {
					const adapter = mongodbAdapter(db, { transaction: false })({
						user: { modelName: "existing_duplicates_user" },
					});
					await expect(
						adapter.create<User>({
							model: "user",
							data: userData("new@example.com"),
						}),
					).resolves.toMatchObject({ email: "new@example.com" });
					const indexNames = (await collection.indexes()).map(
						(index) => index.name,
					);
					expect(indexNames).not.toContain(
						"existing_duplicates_user_email_uidx",
					);
				} finally {
					await collection.drop();
				}
			},
		};
	},
);

const { execute } = await testAdapter({
	adapter: async () => {
		// The adapter is rebuilt when a test changes the schema options. Drop the
		// indexes created for the previous options, as a migration would.
		const collections = await db
			.listCollections({}, { nameOnly: true })
			.toArray();
		await Promise.all(
			collections.map(({ name }) => db.collection(name).dropIndexes()),
		);
		return mongodbAdapter(db, {
			transaction: false,
		});
	},
	runMigrations: async (betterAuthOptions) => {},
	tests: [
		normalTestSuite(),
		authFlowTestSuite(),
		transactionsTestSuite(),
		joinsTestSuite(),
		caseInsensitiveTestSuite(),
		updateObjectIdTestSuite(),
		uuidTestSuite(),
		fieldLevelIndexTestSuite(),
		compoundIndexTestSuite({
			mismatchError: /existing index has the same name/i,
			async verifyIndexState() {
				const indexes = await db
					.collection("compound_index_subject")
					.listIndexes()
					.toArray();
				expect(indexes).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							key: { issuer_url: 1, provider_subject: 1 },
							name: "compound_identity_uidx",
							unique: true,
						}),
					]),
				);
			},
			async verifyMismatchedIndexRejected(options) {
				const collection = db.collection("compound_index_subject");
				await collection.dropIndex("compound_identity_uidx");
				await collection.createIndex(
					{ provider_subject: 1 },
					{ name: "compound_identity_uidx" },
				);
				try {
					const freshAdapter = mongodbAdapter(db, { transaction: false })(
						options,
					);
					await freshAdapter.create({
						model: "compoundIndexSubject",
						data: {
							displayName: "Mismatch probe",
							issuer: "https://mismatch.example",
							providerSubject: "employee-mismatch",
						},
					});
				} finally {
					await collection.dropIndex("compound_identity_uidx");
					await collection.createIndex(
						{ issuer_url: 1, provider_subject: 1 },
						{ name: "compound_identity_uidx", unique: true },
					);
				}
			},
		}),
		// numberIdTestSuite(), // no support
	],
	customIdGenerator: () => new ObjectId().toHexString(),
	async onFinish() {
		await client.close();
	},
});

execute();
