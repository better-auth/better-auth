import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { createTestSuite, testAdapter } from "@better-auth/test-utils/adapter";
import type { Session, User } from "better-auth";
import { MongoClient, ObjectId } from "mongodb";
import { expect } from "vitest";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	transactionsTestSuite,
} from "../adapter-factory";

const dbClient = async (connectionString: string, dbName: string) => {
	const client = new MongoClient(connectionString);
	await client.connect();
	const db = client.db(dbName);
	return { db, client };
};

const { db } = await dbClient("mongodb://127.0.0.1:27017", "better-auth");

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
			transaction: false,
		});
	},
	runMigrations: async (betterAuthOptions) => {},
	tests: [
		normalTestSuite(),
		authFlowTestSuite(),
		transactionsTestSuite(),
		joinsTestSuite(),
		updateObjectIdTestSuite(),
		// numberIdTestSuite(), // no support
		// uuidTestSuite() // no support
	],
	customIdGenerator: () => new ObjectId().toHexString(),
});

execute();
