import type { BetterAuthOptions } from "@better-auth/core";
import {
	getCurrentAdapter,
	queueAfterTransactionHook,
	runWithTransaction,
} from "@better-auth/core/context";
import type { CompiledQuery, DatabaseConnection, Dialect } from "kysely";
import { Kysely, PostgresAdapter, PostgresQueryCompiler } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { createKyselyAdapter } from "./dialect";
import { kyselyAdapter } from "./kysely-adapter";

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
	const db = new Kysely<Record<string, Record<string, unknown>>>({ dialect });
	const config = {
		type: "postgres" as const,
		transaction: true,
		dsql: input?.dsql ?? true,
	};
	const adapter = kyselyAdapter(db, config)(options);
	return { adapter, events, failure, db, dialect };
}

/** @see https://github.com/better-auth/better-auth/issues/12088 */
describe("Aurora DSQL retries", () => {
	it("enables transactions for both object configurations and rejects unsafe configurations", async () => {
		const { db, dialect, events } = harness({ failures: 0 });
		try {
			const configured = await createKyselyAdapter({
				database: { db, type: "postgres", dsql: true },
			});
			expect(configured).toMatchObject({ dsql: true, transaction: true });
			expect(
				await createKyselyAdapter({
					database: { dialect, type: "postgres", dsql: true },
				}),
			).toMatchObject({ dsql: true, transaction: true });
			await expect(
				createKyselyAdapter({
					database: {
						dialect,
						type: "postgres",
						dsql: true,
						transaction: false,
					},
				}),
			).rejects.toThrow("enabled transactions");
			const automatic = kyselyAdapter(db, { type: "postgres", dsql: true })(
				options,
			);
			await automatic.transaction(async () => {});
			expect(events).toEqual(["begin", "commit"]);

			await expect(
				createKyselyAdapter({ database: { db, type: "sqlite", dsql: true } }),
			).rejects.toThrow("requires PostgreSQL");
			await expect(
				createKyselyAdapter({
					database: { db, type: "postgres", dsql: true, transaction: false },
				}),
			).rejects.toThrow("enabled transactions");
			expect(() =>
				kyselyAdapter(db, { type: "postgres", dsql: true, transaction: false }),
			).toThrow("enabled transactions");
			expect(() => kyselyAdapter(db, { type: "mysql", dsql: true })).toThrow(
				"requires PostgreSQL",
			);
		} finally {
			await db.destroy();
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
		const { adapter, events, failure, db } = harness({ failures: 100 });
		try {
			await expect(
				adapter.findOne({
					model: "counter",
					where: [{ field: "id", value: "counter" }],
				}),
			).rejects.toBe(failure);
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
});
