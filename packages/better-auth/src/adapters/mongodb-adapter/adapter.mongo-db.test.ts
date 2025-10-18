import { MongoClient, ObjectId } from "mongodb";
import { testAdapter } from "../test-adapter";
import { mongodbAdapter } from "./mongodb-adapter";
import {
	normalTestSuite,
	performanceTestSuite,
	authFlowTestSuite,
	transactionsTestSuite,
} from "../tests";
import { mongoStringIdTestSuite } from "./mongo-string-id-test-suite";
import { objectIdInitTestSuite } from "./object-id-init-test-suite";
import { stringIdInitTestSuite } from "./string-id-init-test-suite";

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
		return mongodbAdapter(db, {
			transaction: false,
		});
	},
	prefixTests: "ObjectId",
	runMigrations: async (betterAuthOptions) => {},
	tests: [
		objectIdInitTestSuite({ db }),
		normalTestSuite(),
		authFlowTestSuite(),
		transactionsTestSuite(),
		// numberIdTestSuite(), // Mongo doesn't support number ids
		performanceTestSuite(),
	],
	customIdGenerator: () => new ObjectId(),
	transformIdOutput: (id: any) => {
		if (id instanceof ObjectId) return id.toHexString();
		return id;
	},
});

// Specific test suite for MongoDB string ID support
const { execute: executeMongoStringIdTestSuite } = await testAdapter({
	adapter: (options) => {
		return mongodbAdapter(db, {
			transaction: false,
			disableObjectIdConversion: true,
		});
	},
	runMigrations: async (betterAuthOptions) => {},
	prefixTests: "string-id",
	tests: [
		stringIdInitTestSuite({ db }),
		mongoStringIdTestSuite(),
		authFlowTestSuite(),
		transactionsTestSuite(),
		// numberIdTestSuite(), // Mongo doesn't support number ids
	],
	customIdGenerator: () => new ObjectId().toHexString(),
});

execute();
executeMongoStringIdTestSuite();
