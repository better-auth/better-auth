import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

/** @see https://github.com/better-auth/better-auth/issues/8655 */
describe("SQLite JSON serialization", () => {
	it.each([
		{
			metadata: { nested: { enabled: true } },
			redirectUris: ["https://localhost"],
			numbers: [1, 2],
		},
		{ metadata: {}, redirectUris: [], numbers: [] },
		{ metadata: "literal", redirectUris: null, numbers: null },
		{ metadata: null, redirectUris: null, numbers: null },
	])("serializes JSON-mode columns exactly once: %j", async (data) => {
		const sqlite = new Database(":memory:");
		try {
			sqlite.exec(
				"CREATE TABLE client (id TEXT PRIMARY KEY, metadata TEXT, redirect_uris TEXT, numbers TEXT)",
			);
			const client = sqliteTable("client", {
				id: text("id").primaryKey(),
				metadata: text("metadata", { mode: "json" }),
				redirectUris: text("redirect_uris", { mode: "json" }),
				numbers: text("numbers", { mode: "json" }),
			});
			const db = drizzle(sqlite, { schema: { client } });
			const adapter = drizzleAdapter(db, {
				provider: "sqlite",
				schema: { client },
			})({
				plugins: [
					{
						id: "json-test",
						schema: {
							client: {
								fields: {
									metadata: { type: "json", required: false },
									redirectUris: { type: "string[]", required: false },
									numbers: { type: "number[]", required: false },
								},
							},
						},
					},
				],
			});
			const created = await adapter.create<{ id: string }>({
				model: "client",
				data,
			});
			const where = [{ field: "id", value: created.id }];
			const check = async (expected: {
				metadata: unknown;
				redirectUris: string[] | null;
				numbers: number[] | null;
			}) => {
				expect(db.select().from(client).all()[0]).toMatchObject(expected);
				expect(
					sqlite
						.prepare("SELECT metadata, redirect_uris, numbers FROM client")
						.get(),
				).toEqual({
					metadata:
						expected.metadata === null
							? null
							: JSON.stringify(expected.metadata),
					redirect_uris:
						expected.redirectUris === null
							? null
							: JSON.stringify(expected.redirectUris),
					numbers:
						expected.numbers === null ? null : JSON.stringify(expected.numbers),
				});
				expect(await adapter.findOne({ model: "client", where })).toMatchObject(
					expected,
				);
				expect(await adapter.findMany({ model: "client", where })).toEqual([
					expect.objectContaining(expected),
				]);
			};
			expect(created).toMatchObject(data);
			await check(data);
			const updated = {
				metadata: { changed: true },
				redirectUris: ["https://example.com"],
				numbers: [3],
			};
			expect(
				await adapter.update({ model: "client", where, update: updated }),
			).toMatchObject(updated);
			await check(updated);
			expect(
				await adapter.updateMany({ model: "client", where, update: data }),
			).toBe(1);
			await check(data);
		} finally {
			sqlite.close();
		}
	});
});
