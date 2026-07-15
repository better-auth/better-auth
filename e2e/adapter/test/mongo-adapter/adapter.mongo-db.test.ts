import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { createTestSuite, testAdapter } from "@better-auth/test-utils/adapter";
import type { Session, User } from "better-auth";
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
	"mongodb://127.0.0.1:27017/?replicaSet=rs0",
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

const { execute } = await testAdapter({
	adapter: (options) => {
		return mongodbAdapter(db, {
			client,
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
