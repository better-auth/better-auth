import { MongoClient, ObjectId } from "mongodb";
import { testAdapter } from "../test-adapter";
import { mongodbAdapter } from "./mongodb-adapter";
import {
	normalTestSuite,
	performanceTestSuite,
	authFlowTestSuite,
	transactionsTestSuite,
} from "../tests";

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

const { execute } = await testAdapter({
	adapter: (options) => {
		return mongodbAdapter(db, { transaction: false });
	},
	runMigrations: async (betterAuthOptions) => {},
	tests: [
		normalTestSuite(),
		authFlowTestSuite(),
		transactionsTestSuite(),
		// numberIdTestSuite(), // Mongo doesn't support number ids
		performanceTestSuite(),
	],
	customIdGenerator: () => new ObjectId().toString(),
	defaultRetryCount: 20,
});

execute();
