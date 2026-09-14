import type { BetterAuthOptions } from "@better-auth/core";
import {
	getExpectedSchema,
	schemaCheckFor,
} from "@better-auth/core/db/internal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import Database from "better-sqlite3";
import { defineRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it, vi } from "vitest";

const account = sqliteTable("account", {
	id: text("id").primaryKey(),
	issuer: text("issuer").notNull(),
});

describe("relations-v2 schema validation", () => {
	it("checks relations-only configuration without querying the database", async ({
		onTestFinished,
	}) => {
		const client = new Database(":memory:");
		onTestFinished(() => {
			client.close();
		});
		const logQuery = vi.fn();
		const db = drizzle({
			client,
			relations: defineRelations({ account }),
			logger: { logQuery },
		});
		const adapter = drizzleAdapter(db, { provider: "sqlite" })({});
		const check = schemaCheckFor(adapter);
		expect(check).toBeTypeOf("function");
		await expect(check!()).rejects.toMatchObject({
			code: "SCHEMA_MISMATCH",
			findings: expect.arrayContaining([
				{
					kind: "unexpected-required-column",
					table: "account",
					column: "issuer",
				},
			]),
		});
		expect(logQuery).not.toHaveBeenCalled();
	});

	it("uses explicit schema overrides before relation tables", async ({
		onTestFinished,
	}) => {
		const client = new Database(":memory:");
		onTestFinished(() => {
			client.close();
		});
		const db = drizzle({ client, relations: defineRelations({ account }) });
		const adapter = drizzleAdapter(db, {
			provider: "sqlite",
			schema: {
				account: sqliteTable("account", { id: text("id").primaryKey() }),
			},
		})({});
		const check = schemaCheckFor(adapter);
		expect(check).toBeTypeOf("function");
		await expect(check!()).rejects.toMatchObject({
			findings: expect.not.arrayContaining([
				{
					kind: "unexpected-required-column",
					table: "account",
					column: "issuer",
				},
			]),
		});
	});

	it.each([
		"relations",
		"schema",
	] as const)("accepts a complete %s configuration", async (source) => {
		const client = new Database(":memory:");
		try {
			const expected = getExpectedSchema({});
			function tableFor(name: string) {
				const columns: Record<string, ReturnType<typeof text>> = {};
				for (const field of Object.keys(expected[name]!.fields)) {
					columns[field] = text(field);
				}
				return sqliteTable(name, { ...columns, id: text("id").primaryKey() });
			}
			const schema = {
				user: tableFor("user"),
				session: tableFor("session"),
				account: tableFor("account"),
				verification: tableFor("verification"),
			};
			const db =
				source === "relations"
					? drizzle({ client, relations: defineRelations(schema) })
					: drizzle({ client, schema });
			const check = schemaCheckFor(
				drizzleAdapter(db, { provider: "sqlite" })({}),
			);
			expect(check).toBeTypeOf("function");
			await expect(check!()).resolves.toBeUndefined();
		} finally {
			client.close();
		}
	});

	it("uses relation tables before fullSchema and preserves renamed model keys", async ({
		onTestFinished,
	}) => {
		const client = new Database(":memory:");
		onTestFinished(() => {
			client.close();
		});
		const db = drizzle({
			client,
			schema: {
				identities: sqliteTable("old_account", { id: text("id").primaryKey() }),
			},
			relations: defineRelations({ identities: account }),
		});
		const options: BetterAuthOptions = { account: { modelName: "identities" } };
		const check = schemaCheckFor(
			drizzleAdapter(db, { provider: "sqlite" })(options),
		);
		expect(check).toBeTypeOf("function");
		await expect(check!()).rejects.toMatchObject({
			findings: expect.arrayContaining([
				{
					kind: "unexpected-required-column",
					table: "identities",
					column: "issuer",
				},
			]),
		});
	});

	it("does not register a check when validation is disabled", ({
		onTestFinished,
	}) => {
		const client = new Database(":memory:");
		onTestFinished(() => {
			client.close();
		});
		const db = drizzle({ client, relations: defineRelations({ account }) });
		const adapter = drizzleAdapter(db, { provider: "sqlite" })({
			advanced: { database: { validateSchema: false } },
		});
		expect(schemaCheckFor(adapter)).toBeUndefined();
	});
});
