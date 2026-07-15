import { describe, expect, it } from "vitest";
import {
	getDatabaseIndexName,
	getDatabaseIndexStringLength,
	resolveDatabaseSchemaIndexes,
	resolveDatabaseTableIndexes,
} from "./database-index";
import type { DBTableIndex } from "./type";

describe("database indexes", () => {
	it("generates readable names within the portable database limit", () => {
		expect(
			getDatabaseIndexName("directory_user", {
				fields: ["connection_id", "external_id"],
				unique: true,
			}),
		).toBe("directory_user_connection_id_external_id_uidx");

		const longIndex = {
			fields: [
				"provisioning_connection_identifier",
				"external_directory_subject_identifier",
			],
			unique: true,
		} satisfies DBTableIndex;
		const firstName = getDatabaseIndexName(
			"enterprise_directory_user_identity",
			longIndex,
		);
		const secondName = getDatabaseIndexName(
			"enterprise_directory_user_identity",
			longIndex,
		);

		expect(new TextEncoder().encode(firstName).length).toBeLessThanOrEqual(63);
		expect(firstName).toBe(secondName);
		expect(firstName).toMatch(/_[0-9a-f]{8}_uidx$/);
	});

	it("resolves logical fields and honors an explicit portable name", () => {
		expect(
			resolveDatabaseTableIndexes({
				fields: {
					connectionId: {
						type: "string",
						fieldName: "connection_id",
					},
					externalId: { type: "string", fieldName: "external_id" },
				},
				indexes: [
					{
						fields: ["connectionId", "externalId"],
						name: "directory_identity_uidx",
						unique: true,
					},
				],
				tableName: "directory_user",
			}),
		).toEqual([
			{
				columns: ["connection_id", "external_id"],
				name: "directory_identity_uidx",
				unique: true,
			},
		]);
	});

	it("rejects malformed runtime definitions before adapters use them", () => {
		const emptyFields = [] as unknown as DBTableIndex["fields"];

		expect(() =>
			resolveDatabaseTableIndexes({
				fields: { connectionId: { type: "string" } },
				indexes: [{ fields: emptyFields }],
				tableName: "directory_user",
			}),
		).toThrow(
			'Index on table "directory_user" must include at least one field.',
		);

		expect(() =>
			getDatabaseIndexName("directory_user", {
				fields: ["connectionId"],
				name: " ",
			}),
		).toThrow(
			"Database index names must contain at least one visible character.",
		);

		expect(() =>
			getDatabaseIndexName("directory_user", {
				fields: ["connectionId"],
				name: "a".repeat(64),
			}),
		).toThrow("Database index names must be at most 63 UTF-8 bytes.");

		expect(() =>
			getDatabaseIndexName("directory_user", {
				fields: ["connectionId"],
				name: 'directory_"lookup"',
			}),
		).toThrow(
			"Database index names must start with a letter or underscore and contain only letters, numbers, and underscores.",
		);

		const fields = Object.fromEntries(
			Array.from({ length: 17 }, (_, index) => [
				`field${index}`,
				{ type: "string" as const },
			]),
		);
		expect(
			resolveDatabaseTableIndexes({
				fields,
				indexes: [
					{
						fields: Array.from(
							{ length: 16 },
							(_, index) => `field${index}`,
						) as unknown as DBTableIndex["fields"],
					},
				],
				tableName: "portable_lookup",
			}),
		).toHaveLength(1);
		expect(() =>
			resolveDatabaseTableIndexes({
				fields,
				indexes: [
					{
						fields: Object.keys(fields) as unknown as DBTableIndex["fields"],
					},
				],
				tableName: "portable_lookup",
			}),
		).toThrow(
			'Index on table "portable_lookup" can include at most 16 fields so it works across supported databases.',
		);
	});

	it("rejects index-name collisions instead of dropping a definition", () => {
		expect(() =>
			resolveDatabaseTableIndexes({
				fields: {
					a: { type: "string" },
					a_b: { type: "string" },
					b_c: { type: "string" },
					c: { type: "string" },
				},
				indexes: [{ fields: ["a_b", "c"] }, { fields: ["a", "b_c"] }],
				tableName: "ambiguous",
			}),
		).toThrow(
			'Database index name "ambiguous_a_b_c_idx" identifies more than one index on table "ambiguous".',
		);

		expect(() =>
			resolveDatabaseTableIndexes({
				fields: {
					connectionId: { type: "string" },
					externalId: { type: "string" },
					status: { type: "string" },
				},
				indexes: [
					{
						fields: ["connectionId", "externalId"],
						name: "directory_lookup",
					},
					{
						fields: ["connectionId", "status"],
						name: "directory_lookup",
					},
				],
				tableName: "directory_user",
			}),
		).toThrow(
			'Database index name "directory_lookup" identifies more than one index on table "directory_user".',
		);
	});

	it("rejects indexed logical aliases for the same physical table", () => {
		expect(() =>
			resolveDatabaseSchemaIndexes([
				{
					fields: { issuer: { type: "string" } },
					indexes: [{ fields: ["issuer"] }],
					tableName: "account",
				},
				{
					fields: { providerAccountId: { type: "string" } },
					indexes: undefined,
					tableName: "account",
				},
			]),
		).toThrow(
			'Database schema resolves more than one indexed logical table to "account". Define table-level indexes through one logical schema key instead of aliasing multiple keys to the same database table.',
		);
	});

	it("enforces portable schema-wide names and unique-index null semantics", () => {
		expect(() =>
			resolveDatabaseSchemaIndexes([
				{
					fields: { subject: { type: "string" } },
					indexes: [{ fields: ["subject"], name: "shared_lookup" }],
					tableName: "directory_user",
				},
				{
					fields: { subject: { type: "string" } },
					indexes: [{ fields: ["subject"], name: "shared_lookup" }],
					tableName: "directory_group",
				},
			]),
		).toThrow(
			'Database index name "shared_lookup" is used by both table "directory_user" and table "directory_group".',
		);

		expect(() =>
			resolveDatabaseSchemaIndexes([
				{
					fields: { subject: { type: "string" } },
					indexes: [{ fields: ["subject"], name: "Shared_Lookup" }],
					tableName: "directory_user",
				},
				{
					fields: { subject: { type: "string" } },
					indexes: [{ fields: ["subject"], name: "shared_lookup" }],
					tableName: "directory_group",
				},
			]),
		).toThrow(
			'Database index name "shared_lookup" is used by both table "directory_user" and table "directory_group".',
		);

		expect(() =>
			resolveDatabaseSchemaIndexes([
				{
					fields: { subject: { type: "string" } },
					indexes: [{ fields: ["subject"], name: "directory_group" }],
					tableName: "directory_user",
				},
				{
					fields: {},
					indexes: undefined,
					tableName: "directory_group",
				},
			]),
		).toThrow(
			'Database index name "directory_group" conflicts with a table name.',
		);

		expect(() =>
			resolveDatabaseSchemaIndexes([
				{
					fields: { subject: { type: "string" } },
					indexes: [{ fields: ["subject"], name: "Directory_Group" }],
					tableName: "directory_user",
				},
				{
					fields: {},
					indexes: undefined,
					tableName: "directory_group",
				},
			]),
		).toThrow(
			'Database index name "Directory_Group" conflicts with a table name.',
		);

		expect(() =>
			resolveDatabaseTableIndexes({
				fields: {
					issuer: { type: "string" },
					providerAccountId: { type: "string", required: false },
				},
				indexes: [
					{
						fields: ["issuer", "providerAccountId"],
						unique: true,
					},
				],
				tableName: "account",
			}),
		).toThrow(
			'Unique index on table "account" can only include required fields so its behavior is consistent across databases.',
		);
	});

	it("bounds generated string columns to each dialect's index budget", () => {
		const fields = Object.fromEntries(
			["a", "b", "c", "d", "e"].map((field) => [
				field,
				{ type: "string" as const },
			]),
		);
		const indexes = resolveDatabaseTableIndexes({
			fields,
			indexes: [{ fields: ["a", "b", "c", "d", "e"] }],
			tableName: "wide_lookup",
		});

		expect(
			getDatabaseIndexStringLength({
				columnName: "a",
				dialect: "mysql",
				fields,
				indexes,
			}),
		).toBe(153);
		expect(
			getDatabaseIndexStringLength({
				columnName: "a",
				dialect: "mssql",
				fields,
				indexes,
			}),
		).toBe(255);
	});

	it("rejects duplicate field-level and table-level index metadata", () => {
		expect(() =>
			resolveDatabaseSchemaIndexes([
				{
					fields: {
						subject: { type: "string", index: true },
					},
					indexes: [{ fields: ["subject"] }],
					tableName: "directory_identity",
				},
			]),
		).toThrow(
			'Database index name "directory_identity_subject_idx" is already reserved by field-level index metadata on table "directory_identity".',
		);
	});
});
