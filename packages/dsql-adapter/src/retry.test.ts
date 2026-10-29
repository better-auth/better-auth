import type { BetterAuthOptions } from "@better-auth/core";
import {
	getCurrentAdapter,
	queueAfterTransactionHook,
	runWithTransaction,
} from "@better-auth/core/context";
import { schemaCheckFor } from "@better-auth/core/db/internal";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import type { CompiledQuery, DatabaseConnection, Dialect } from "kysely";
import { Kysely, PostgresAdapter, PostgresQueryCompiler } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { dsqlAdapter } from "./adapter";
import { withDsqlDialect } from "./dialect";

const options: BetterAuthOptions = {
	advanced: { database: { validateSchema: false } },
	plugins: [
		{
			id: "counter",
			schema: {
				counter: { fields: { remaining: { type: "number" } } },
			},
		},
	],
};

function harness(input?: {
	dsql?: boolean;
	failures?: number;
	code?: string;
	commit?: boolean;
}) {
	const events: string[] = [];
	let failures = input?.failures ?? 1;
	const failure = Object.assign(new Error("database failure"), {
		code: input?.code ?? "40001",
	});
	const connection: DatabaseConnection = {
		async executeQuery<R>(query: CompiledQuery) {
			events.push(query.sql.split(" ")[0]!);
			if (!input?.commit && failures-- > 0) throw failure;
			return { rows: [{ id: "counter", remaining: 1 }] as R[] };
		},
		async *streamQuery() {
			throw new Error("Unexpected stream");
		},
	};
	const dialect: Dialect = {
		createAdapter: () => new PostgresAdapter(),
		createQueryCompiler: () => new PostgresQueryCompiler(),
		createDriver: () => ({
			async init() {},
			async acquireConnection() {
				return connection;
			},
			async releaseConnection() {},
			async beginTransaction() {
				events.push("begin");
			},
			async commitTransaction() {
				events.push("commit");
				if (input?.commit && failures-- > 0) throw failure;
			},
			async rollbackTransaction() {
				events.push("rollback");
			},
			async destroy() {},
		}),
		createIntrospector: () => ({
			async getTables() {
				return [];
			},
			async getSchemas() {
				return [];
			},
			async getMetadata() {
				return { tables: [] };
			},
		}),
	};
	const db = new Kysely<Record<string, Record<string, unknown>>>({
		dialect: withDsqlDialect(dialect),
	});
	const adapter =
		input?.dsql === false
			? kyselyAdapter(db, { type: "postgres", transaction: true })(options)
			: dsqlAdapter(db)(options);
	return { adapter, events, failure, db, dialect, connection };
}

/** @see https://github.com/better-auth/better-auth/issues/12088 */
describe("Aurora DSQL retries", () => {
	it("owns its configuration and retains the Kysely schema check", async () => {
		const { db, events, dialect } = harness({ failures: 0 });
		const plain = new Kysely({ dialect });
		try {
			expect(() => dsqlAdapter(plain)).toThrow("dsqlDialect");
			const adapter = dsqlAdapter(db)(options);
			expect(adapter.id).toBe("dsql");
			expect(adapter.isRetryableError?.({ code: "40001" })).toBe(true);
			expect(adapter.isRetryableError?.({ code: "08006" })).toBe(false);
			expect(schemaCheckFor(adapter)).toBeDefined();
			expect(adapter.options?.adapterConfig.transaction).toBeTypeOf("function");
			await adapter.transaction(async () => {});
			expect(events).toEqual(["begin", "commit"]);
			await adapter.transaction(async (trx) => {
				expect(trx.isRetryableError?.({ code: "40001" })).toBe(true);
			});
			const secondaryStorage = {
				get: async () => null,
				set: async () => {},
				delete: async () => {},
				getAndDelete: async () => null,
				increment: async () => 1,
			};
			expect(() => dsqlAdapter(db)({ ...options, secondaryStorage })).toThrow(
				"without secondaryStorage",
			);
		} finally {
			await db.destroy();
			await plain.destroy();
		}
	});

	it("retries an autocommit single-use consume after an aborted statement", async () => {
		const { adapter, events, db } = harness();
		try {
			const row = await adapter.consumeOne({
				model: "counter",
				where: [{ field: "id", value: "counter" }],
			});
			expect(row).toMatchObject({ id: "counter" });
			expect(events).toEqual(["delete", "delete"]);
		} finally {
			await db.destroy();
		}
	});

	it("leaves ordinary PostgreSQL error handling unchanged", async () => {
		const { adapter, events, failure, db } = harness({ dsql: false });
		try {
			await expect(
				adapter.findOne({
					model: "counter",
					where: [{ field: "id", value: "counter" }],
				}),
			).rejects.toBe(failure);
			expect(events).toEqual(["select"]);
		} finally {
			await db.destroy();
		}
	});

	it.each(["23505", "08006", "XX000"])(
		"does not retry %s or an uncertain outcome",
		async (code) => {
			const { adapter, events, failure, db } = harness({ code });
			try {
				await expect(
					adapter.findOne({
						model: "counter",
						where: [{ field: "id", value: "counter" }],
					}),
				).rejects.toBe(failure);
				expect(events).toHaveLength(1);
			} finally {
				await db.destroy();
			}
		},
	);

	it("stops after three retries and preserves the last database error", async () => {
		const { adapter, events, db, connection } = harness({ failures: 100 });
		const failures = Array.from({ length: 4 }, (_, attempt) =>
			Object.assign(new Error(`abort ${attempt}`), { code: "40001" }),
		);
		vi.spyOn(connection, "executeQuery").mockImplementation(async (query) => {
			events.push(query.sql.split(" ")[0]!);
			throw failures[events.length - 1];
		});
		try {
			await expect(
				adapter.findOne({
					model: "counter",
					where: [{ field: "id", value: "counter" }],
				}),
			).rejects.toBe(failures[3]);
			expect(events).toHaveLength(4);
		} finally {
			await db.destroy();
		}
	});

	it.each([false, true])(
		"restarts the whole transaction and runs committed hooks once (commit conflict: %s)",
		async (commit) => {
			const { adapter, events, db } = harness({ commit });
			const hook = vi.fn(async () => {});
			let attempts = 0;
			try {
				await runWithTransaction(adapter, async () => {
					attempts++;
					await queueAfterTransactionHook(hook);
					const current = await getCurrentAdapter(adapter);
					await current.incrementOne({
						model: "counter",
						where: [{ field: "id", value: "counter" }],
						increment: { remaining: -1 },
					});
					await runWithTransaction(adapter, async () => {});
				});
				expect(attempts).toBe(2);
				expect(events.filter((event) => event === "begin")).toHaveLength(2);
				expect(events.filter((event) => event === "rollback")).toHaveLength(1);
				expect(hook).toHaveBeenCalledTimes(1);
			} finally {
				await db.destroy();
			}
		},
	);

	it("discards hooks when all transaction attempts fail", async () => {
		const { adapter, failure, db } = harness({ commit: true, failures: 100 });
		const hook = vi.fn(async () => {});
		try {
			await expect(
				runWithTransaction(adapter, async () => {
					await queueAfterTransactionHook(hook);
				}),
			).rejects.toBe(failure);
			expect(hook).not.toHaveBeenCalled();
		} finally {
			await db.destroy();
		}
	});

	it("does not retry a hook that fails after the transaction commits", async () => {
		const { adapter, events, failure, db } = harness({ failures: 0 });
		const hook = vi.fn(async () => {
			throw failure;
		});
		try {
			await expect(
				runWithTransaction(adapter, async () => {
					await queueAfterTransactionHook(hook);
				}),
			).rejects.toBe(failure);
			expect(events).toEqual(["begin", "commit"]);
			expect(hook).toHaveBeenCalledTimes(1);
		} finally {
			await db.destroy();
		}
	});
	it("does not retry an uncertain commit failure", async () => {
		const { adapter, events, db, failure } = harness({
			commit: true,
			code: "08006",
		});
		try {
			await expect(adapter.transaction(async () => {})).rejects.toBe(failure);
			expect(events.filter((event) => event === "begin")).toHaveLength(1);
			expect(events.filter((event) => event === "commit")).toHaveLength(1);
		} finally {
			await db.destroy();
		}
	});
});
