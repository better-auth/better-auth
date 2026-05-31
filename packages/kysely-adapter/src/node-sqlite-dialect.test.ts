import { DatabaseSync } from "node:sqlite";
import type { Generated } from "kysely";
import { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeSqliteDialect } from "./node-sqlite-dialect";

interface TestDatabase {
	item: {
		id: Generated<number>;
		name: string;
	};
}

describe("NodeSqliteDialect", () => {
	let raw: DatabaseSync;
	let db: Kysely<TestDatabase>;

	beforeEach(async () => {
		raw = new DatabaseSync(":memory:");
		db = new Kysely<TestDatabase>({
			dialect: new NodeSqliteDialect({ database: raw }),
		});
		await db.schema
			.createTable("item")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("name", "text")
			.execute();
		await db
			.insertInto("item")
			.values([{ name: "a" }, { name: "b" }, { name: "c" }])
			.execute();
	});

	afterEach(async () => {
		await db.destroy();
	});

	// A mutation without a RETURNING clause must still report how many rows it
	// touched. updateMany/deleteMany in the adapter read numUpdatedRows /
	// numDeletedRows, which Kysely derives from the connection's numAffectedRows
	// (falling back to 0 when absent). A dialect that drops it silently reports 0.
	it("reports the number of rows affected by a delete", async () => {
		const result = await db
			.deleteFrom("item")
			.where("name", "in", ["a", "b"])
			.executeTakeFirst();

		expect(Number(result.numDeletedRows)).toBe(2);
	});

	it("reports the number of rows affected by an update", async () => {
		const result = await db
			.updateTable("item")
			.set({ name: "z" })
			.executeTakeFirst();

		expect(Number(result.numUpdatedRows)).toBe(3);
	});

	it("reports the inserted row id when no RETURNING clause is used", async () => {
		const result = await db
			.insertInto("item")
			.values({ name: "d" })
			.executeTakeFirst();

		expect(result.insertId).toBeDefined();
		expect(Number(result.insertId)).toBeGreaterThan(0);
	});
});
