import { isObjectIdLike, mongodbAdapter } from "@better-auth/mongo-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { MongoClient, ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
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
		// numberIdTestSuite(), // no support
		// uuidTestSuite() // no support
	],
	customIdGenerator: () => new ObjectId().toHexString(),
});

execute();

/**
 * Test suite for isObjectIdLike duck-typing validation.
 *
 * This tests the fix for the instanceof ObjectId check which fails
 * when different instances of the mongodb package are loaded
 * (e.g., different versions or bundled copies).
 *
 * @see https://github.com/jdesboeufs/connect-mongo/issues/172
 * @see https://github.com/mongodb/js-bson/blob/main/src/objectid.ts
 */
describe("isObjectIdLike", () => {
	it("should return true for real ObjectId instances", () => {
		const objectId = new ObjectId();
		expect(isObjectIdLike(objectId)).toBe(true);
	});

	it("should return true for ObjectId created from hex string", () => {
		const objectId = new ObjectId("507f1f77bcf86cd799439011");
		expect(isObjectIdLike(objectId)).toBe(true);
	});

	it("should return true for ObjectId-like objects with toHexString method", () => {
		// Simulates an ObjectId from a different mongodb package instance
		const objectIdLike = {
			toHexString: () => "507f1f77bcf86cd799439011",
		};
		expect(isObjectIdLike(objectIdLike)).toBe(true);
	});

	it("should return true for objects that duck-type as ObjectId", () => {
		// This simulates the case when a user passes an ObjectId created
		// from a different version of the mongodb package
		class CustomObjectId {
			private id: string;
			constructor(id?: string) {
				this.id = id || "507f1f77bcf86cd799439011";
			}
			toHexString(): string {
				return this.id;
			}
		}
		const customId = new CustomObjectId();
		expect(isObjectIdLike(customId)).toBe(true);
	});

	it("should return false for null", () => {
		expect(isObjectIdLike(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isObjectIdLike(undefined)).toBe(false);
	});

	it("should return false for plain strings", () => {
		expect(isObjectIdLike("507f1f77bcf86cd799439011")).toBe(false);
	});

	it("should return false for numbers", () => {
		expect(isObjectIdLike(123)).toBe(false);
	});

	it("should return false for plain objects without toHexString", () => {
		expect(isObjectIdLike({ id: "507f1f77bcf86cd799439011" })).toBe(false);
	});

	it("should return false for objects with non-function toHexString", () => {
		const invalidObj = {
			toHexString: "not-a-function",
		};
		expect(isObjectIdLike(invalidObj)).toBe(false);
	});

	it("should return false for arrays", () => {
		expect(isObjectIdLike(["507f1f77bcf86cd799439011"])).toBe(false);
	});

	it("should return false for Date objects", () => {
		expect(isObjectIdLike(new Date())).toBe(false);
	});
});
