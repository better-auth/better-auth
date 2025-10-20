import { expect } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { testAdapter } from "../test-adapter";
import { mongodbAdapter } from "./mongodb-adapter";
import {
	normalTestSuite,
	performanceTestSuite,
	authFlowTestSuite,
	transactionsTestSuite,
} from "../tests";
import { createTestSuite } from "../create-test-suite";
import type { User } from "../../types";

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

const mongodbSpecialCharacterTests = createTestSuite(
	"mongodb-special-characters",
	{},
	(helpers) => {
		const { adapter } = helpers;
		return {
			"findMany - should handle plus sign in email search (issue #5409)":
				async () => {
					const user = await adapter.create({
						model: "user",
						data: {
							email: "test+alias@example.com",
							name: "Test User",
							emailVerified: false,
						},
					});

					const result = await adapter.findMany<User>({
						model: "user",
						where: [
							{
								field: "email",
								operator: "contains",
								value: "test+alias",
							},
						],
					});

					expect(result.length).toBe(1);
					expect(result[0]?.email).toBe("test+alias@example.com");
				},
			"findMany - should handle dots in email search": async () => {
				await adapter.create({
					model: "user",
					data: {
						email: "user.name@example.com",
						name: "Test User Dot",
						emailVerified: false,
					},
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							operator: "contains",
							value: "user.name",
						},
					],
				});

				expect(result.length).toBeGreaterThan(0);
				const found = result.find((u) => u.email === "user.name@example.com");
				expect(found).toBeDefined();
			},
			"findMany - should handle asterisk in name search": async () => {
				await adapter.create({
					model: "user",
					data: {
						email: "asterisk@example.com",
						name: "Test*User",
						emailVerified: false,
					},
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "name",
							operator: "contains",
							value: "Test*User",
						},
					],
				});

				expect(result.length).toBeGreaterThan(0);
				const found = result.find((u) => u.name === "Test*User");
				expect(found).toBeDefined();
			},
			"findMany - should handle question mark in name search": async () => {
				await adapter.create({
					model: "user",
					data: {
						email: "question@example.com",
						name: "Test?User",
						emailVerified: false,
					},
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "name",
							operator: "contains",
							value: "Test?User",
						},
					],
				});

				expect(result.length).toBeGreaterThan(0);
				const found = result.find((u) => u.name === "Test?User");
				expect(found).toBeDefined();
			},
			"findMany - should handle brackets in name search": async () => {
				await adapter.create({
					model: "user",
					data: {
						email: "bracket@example.com",
						name: "Test[User]",
						emailVerified: false,
					},
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "name",
							operator: "contains",
							value: "Test[User]",
						},
					],
				});

				expect(result.length).toBeGreaterThan(0);
				const found = result.find((u) => u.name === "Test[User]");
				expect(found).toBeDefined();
			},
			"findMany - should handle backslash in name search": async () => {
				await adapter.create({
					model: "user",
					data: {
						email: "backslash@example.com",
						name: "Test\\User",
						emailVerified: false,
					},
				});

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "name",
							operator: "contains",
							value: "Test\\User",
						},
					],
				});

				expect(result.length).toBeGreaterThan(0);
				const found = result.find((u) => u.name === "Test\\User");
				expect(found).toBeDefined();
			},
			"findMany - should handle special characters with starts_with":
				async () => {
					await adapter.create({
						model: "user",
						data: {
							email: "special+start@example.com",
							name: "Special Start",
							emailVerified: false,
						},
					});

					const result = await adapter.findMany<User>({
						model: "user",
						where: [
							{
								field: "email",
								operator: "starts_with",
								value: "special+",
							},
						],
					});

					expect(result.length).toBeGreaterThan(0);
					const found = result.find(
						(u) => u.email === "special+start@example.com",
					);
					expect(found).toBeDefined();
				},
			"findMany - should handle special characters with ends_with":
				async () => {
					await adapter.create({
						model: "user",
						data: {
							email: "end@test+domain.com",
							name: "Special End",
							emailVerified: false,
						},
					});

					const result = await adapter.findMany<User>({
						model: "user",
						where: [
							{
								field: "email",
								operator: "ends_with",
								value: "+domain.com",
							},
						],
					});

					expect(result.length).toBeGreaterThan(0);
					const found = result.find((u) => u.email === "end@test+domain.com");
					expect(found).toBeDefined();
				},
		};
	},
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
		mongodbSpecialCharacterTests(),
		// numberIdTestSuite(), // Mongo doesn't support number ids
		performanceTestSuite(),
	],
	customIdGenerator: () => new ObjectId().toString(),
});

execute();
