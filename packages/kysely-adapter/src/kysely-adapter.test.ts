import { readFileSync } from "node:fs";
import path from "node:path";
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

	it("consumeOne deletes only the selected row for non-unique predicates", async () => {
		const selectQuery = {
			select: vi.fn(() => selectQuery),
			where: vi.fn(() => selectQuery),
			limit: vi.fn(() => selectQuery),
		};
		const deleted = {
			id: "verification-1",
			identifier: "same-identifier",
			value: "first",
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

		const result = await adapter.consumeOne({
			model: "verification",
			where: [{ field: "identifier", value: "same-identifier" }],
		});

		expect(result).toEqual(deleted);
		expect(selectQuery.select).toHaveBeenCalledWith("verification.id");
		expect(selectQuery.where).toHaveBeenCalledTimes(1);
		expect(deleteQuery.where).toHaveBeenCalledTimes(1);
		expect(deleteQuery.where).toHaveBeenCalledWith(
			"verification.id",
			"in",
			selectQuery,
		);
		expect(deleteQuery.returningAll).toHaveBeenCalledTimes(1);
	});

	/**
	 * Stale installs of `@better-auth/cli@1.4.x` pin `@better-auth/core@1.4.x`
	 * as a regular dependency, so package managers can hoist that older core
	 * to the top of `node_modules` and shadow the newer core this adapter is
	 * compiled against. The 1.4.x core only exposes `./utils` (no wildcard),
	 * so any `@better-auth/core/utils/<name>` subpath import here will throw
	 * `ERR_PACKAGE_PATH_NOT_EXPORTED` at bundle/resolve time. Keep this
	 * adapter free of `@better-auth/core/utils/*` imports.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/9767
	 */
	it("does not import from @better-auth/core/utils/* subpaths", () => {
		const source = readFileSync(
			path.join(__dirname, "kysely-adapter.ts"),
			"utf8",
		);
		const importLines = source
			.split("\n")
			.filter((line) => /^\s*import\b/.test(line));
		const offenders = importLines.filter((line) =>
			/@better-auth\/core\/utils\//.test(line),
		);
		expect(offenders).toEqual([]);
	});
});
