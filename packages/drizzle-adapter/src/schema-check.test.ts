import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import {
	getExpectedSchema,
	SchemaMismatchError,
	schemaCheckFor,
} from "@better-auth/core/db/internal";
import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "./drizzle-adapter";
import { findDrizzleSchemaProblems } from "./schema-check";

const secret = "test-secret-that-is-at-least-32-chars-long!!";

/**
 * Column builders for the fields Better Auth writes, typed loosely on purpose.
 */
function columnsFor(fields: Record<string, DBFieldAttribute>) {
	const columns: Record<string, ReturnType<typeof text>> = {
		id: text("id").primaryKey(),
	};
	for (const [name, field] of Object.entries(fields)) {
		columns[name] = field.required ? text(name).notNull() : text(name);
	}
	return columns;
}

/**
 * Every table this configuration writes, declared the way `auth generate` would.
 */
function tablesFor(options: BetterAuthOptions, usePlural = false) {
	const schema: Record<string, unknown> = {};
	for (const [name, table] of Object.entries(
		getExpectedSchema(options, { usePlural }),
	)) {
		schema[name] = pgTable(name, columnsFor(table.fields));
	}
	return schema;
}

describe("findDrizzleSchemaProblems", () => {
	it("accepts a schema generated for this configuration", () => {
		expect(findDrizzleSchemaProblems(tablesFor({}), {})).toEqual([]);
	});

	it("reports a table the schema does not export", () => {
		const { account: _account, ...schema } = tablesFor({});
		expect(findDrizzleSchemaProblems(schema, {})).toEqual([
			{ kind: "missing-table", table: "account" },
		]);
	});

	it("reports a column the adapter writes but the table lacks", () => {
		const schema = tablesFor({});
		const { accessToken: _accessToken, ...columns } = columnsFor(
			getExpectedSchema({}).account!.fields,
		);
		schema.account = pgTable("account", columns);
		expect(findDrizzleSchemaProblems(schema, {})).toEqual([
			{ kind: "missing-column", table: "account", column: "accessToken" },
		]);
	});

	it("reports a required column the adapter never fills and accepts one it can omit", () => {
		const schema = tablesFor({});
		schema.account = pgTable("account", {
			...columnsFor(getExpectedSchema({}).account!.fields),
			issuer: text("issuer").notNull(),
			note: text("note"),
			rank: text("rank").notNull().default("member"),
		});
		expect(findDrizzleSchemaProblems(schema, {})).toEqual([
			{
				kind: "unexpected-required-column",
				table: "account",
				column: "issuer",
			},
		]);
	});

	it("reads plural keys and skips relations", () => {
		const schema = tablesFor({}, true);
		const withRelations = {
			...schema,
			usersRelations: relations(pgTable("users", columnsFor({})), () => ({})),
		};
		expect(findDrizzleSchemaProblems(withRelations, {}, true)).toEqual([]);
		expect(
			findDrizzleSchemaProblems(withRelations, {}).map((f) => f.kind),
		).toContain("missing-table");
	});

	it("follows renamed models and fields", () => {
		const options: BetterAuthOptions = {
			user: { modelName: "member", fields: { emailVerified: "verified" } },
		};
		const schema = tablesFor(options);
		expect(schema.member).toBeDefined();
		expect(findDrizzleSchemaProblems(schema, options)).toEqual([]);
	});
});

describe("drizzleAdapter", () => {
	const adapterFor = (schema: Record<string, unknown>, options = {}) =>
		drizzleAdapter(
			{ _: { fullSchema: schema } },
			{ provider: "pg" },
		)({
			secret,
			...options,
		});

	it("registers a check the first request awaits", async () => {
		await expect(
			schemaCheckFor(adapterFor(tablesFor({})))?.(),
		).resolves.toBeUndefined();

		const { account: _account, ...partial } = tablesFor({});
		await expect(schemaCheckFor(adapterFor(partial))?.()).rejects.toThrow(
			SchemaMismatchError,
		);
	});

	it("registers nothing when the check is disabled", () => {
		const adapter = adapterFor(
			{},
			{ advanced: { database: { validateSchema: false } } },
		);
		expect(schemaCheckFor(adapter)).toBeUndefined();
	});
});
