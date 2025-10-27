import { MongoClient, ObjectId } from "mongodb";
import { testAdapter } from "../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	transactionsTestSuite,
} from "../tests";
import { mongodbAdapter } from "./mongodb-adapter";

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
	],
	customIdGenerator: () => new ObjectId().toString(),
});

execute();
