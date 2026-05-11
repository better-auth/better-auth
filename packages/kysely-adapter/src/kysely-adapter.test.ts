import { Kysely, SqliteDialect } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { kyselyAdapter } from "./kysely-adapter";

describe("kysely-adapter", () => {
	it("should create kysely adapter", () => {
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: {
					close: () => {},
					prepare: () =>
						({
							all: () => [],
							run: () => {},
							get: () => {},
							iterate: () => [],
						}) as any,
				} as any,
			}),
		});
		const adapter = kyselyAdapter(db);
		expect(adapter).toBeDefined();
	});

	it("claimOne deletes only the selected row for non-unique predicates", async () => {
		const selected = {
			id: "verification-1",
			identifier: "same-identifier",
			value: "first",
		};
		const deleted = { ...selected };
		const selectQuery = {
			selectAll: vi.fn(() => selectQuery),
			where: vi.fn(() => selectQuery),
			limit: vi.fn(() => selectQuery),
			executeTakeFirst: vi.fn().mockResolvedValue(selected),
		};
		const deleteQuery = {
			where: vi.fn(() => deleteQuery),
			returningAll: vi.fn(() => deleteQuery),
			executeTakeFirst: vi.fn().mockResolvedValue(deleted),
		};
		const db = {
			selectFrom: vi.fn(() => selectQuery),
			deleteFrom: vi.fn(() => deleteQuery),
		} as any;
		const adapter = kyselyAdapter(db)({});

		const result = await adapter.claimOne({
			model: "verification",
			where: [{ field: "identifier", value: "same-identifier" }],
		});

		expect(result).toEqual(deleted);
		expect(selectQuery.where).toHaveBeenCalledTimes(1);
		expect(deleteQuery.where).toHaveBeenCalledTimes(1);
		expect(deleteQuery.where).toHaveBeenCalledWith(
			"verification.id",
			"=",
			"verification-1",
		);
		expect(deleteQuery.returningAll).toHaveBeenCalledTimes(1);
	});
});
