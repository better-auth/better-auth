import { describe, expect, it } from "vitest";
import { getSchema } from "./get-schema";
import type { BetterAuthOptions } from "../types";
import Database from 'better-sqlite3'

describe("getSchema", () => {
	const database = new Database(":memory:");
	it("should generate basic schema", () => {
		const config: BetterAuthOptions = {
			database
		};

		const schema = getSchema(config);

		expect(schema).toBeDefined();
		expect(schema.user).toBeDefined();
		expect(schema.user.modelName).toBe("user");
		expect(schema.user.fields).toBeDefined();
		expect(schema.user.fields.email).toBeDefined();
		expect(schema.user.fields.name).toBeDefined();
	});

	it("should validate schema with zod", () => {
		const config: BetterAuthOptions = {
			database,
			user: {
				modelName: "customUser",
			},
		};

		const schema = getSchema(config);

		expect(schema.customUser).toBeDefined();
		expect(schema.customUser.modelName).toBe("customUser");
		expect(schema.customUser.order).toBeDefined();
		expect(schema.customUser.fields).toBeDefined();
	});

	it("should handle plugin schemas", () => {
		const config: BetterAuthOptions = {
			database,
			plugins: [
				{
					id: "test-plugin",
					schema: {
						testTable: {
							modelName: "testTable",
							fields: {
								id: {
									type: "string",
									unique: true,
								},
								name: {
									type: "string",
								},
							},
						},
					},
				},
			],
		};

		const schema = getSchema(config);

		expect(schema.testTable).toBeDefined();
		expect(schema.testTable.modelName).toBe("testTable");
		expect(schema.testTable.fields.id).toBeDefined();
		expect(schema.testTable.fields.name).toBeDefined();
	});

	it("should throw error on invalid schema", () => {
		const config: BetterAuthOptions = {
			database,
			plugins: [
				{
					id: "invalid-plugin",
					schema: {
						invalidTable: {
							modelName: 123 as any, // Invalid type for testing
							fields: {},
						},
					},
				},
			],
		};

		expect(() => getSchema(config)).toThrowErrorMatchingInlineSnapshot(`
			[BetterAuthError: [
			  {
			    "expected": "string",
			    "code": "invalid_type",
			    "path": [
			      "modelName"
			    ],
			    "message": "Invalid input: expected string, received number"
			  }
			]]
		`);
	});
});
