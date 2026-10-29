import type { BetterAuthOptions } from "@better-auth/core";
import type {
	CompiledQuery,
	DatabaseConnection,
	Dialect,
	TableMetadata,
} from "kysely";
import {
	CamelCasePlugin,
	Kysely,
	PostgresAdapter,
	PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";
import { getMigrations } from "./get-migration";

function postgres(options?: {
	tables?: TableMetadata[];
	jobSucceeded?: boolean;
	pendingJob?: string;
}) {
	const queries: { sql: string; parameters: readonly unknown[] }[] = [];
	const connection: DatabaseConnection = {
		async executeQuery<R>(query: CompiledQuery) {
			queries.push(query);
			const rows = /^create (unique )?index async/.test(query.sql)
				? [{ job_id: "index-job" }]
				: query.sql.includes("from sys.jobs")
					? options?.pendingJob
						? [{ job_id: options.pendingJob }]
						: []
					: query.sql.includes("sys.wait_for_job")
						? [{ succeeded: options?.jobSucceeded ?? true }]
						: [];
			return { rows: rows as R[] };
		},
		async *streamQuery() {
			throw new Error("Unexpected streaming query");
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
			async beginTransaction() {},
			async commitTransaction() {},
			async rollbackTransaction() {},
			async destroy() {},
		}),
		createIntrospector: () => ({
			async getTables() {
				return options?.tables ?? [];
			},
			async getSchemas() {
				return [{ name: "public" }];
			},
			async getMetadata() {
				return { tables: options?.tables ?? [] };
			},
		}),
	};
	return { dialect, queries };
}

/** @see https://github.com/better-auth/better-auth/issues/12088 */
describe("Aurora DSQL migrations", () => {
	it("generates async indexes without changing PostgreSQL or foreign keys", async () => {
		const { dialect } = postgres();
		const database = { dialect, type: "postgres" as const, dsql: true };
		const migration = await getMigrations({ database });
		const ddl = await migration.compileMigrations();
		expect(ddl).toContain('create index async "verification_identifier_idx"');
		expect(ddl).toContain('references "user" ("id") on delete cascade');
		const ordinary = await getMigrations({
			database: { dialect, type: "postgres" },
		});
		expect(await ordinary.compileMigrations()).not.toContain("index async");
	});

	it("generates unique asynchronous plugin indexes and waits for jobs from interrupted runs", async () => {
		const { dialect, queries } = postgres({ pendingJob: "pending-index" });
		const migration = await getMigrations({
			database: { dialect, type: "postgres", dsql: true, schemaName: "auth" },
			plugins: [
				{
					id: "indexed",
					schema: {
						record: {
							fields: { owner: { type: "string" } },
							indexes: [
								{
									name: "record_owner_unique",
									fields: ["owner"],
									unique: true,
								},
							],
						},
					},
				},
			],
		});
		expect(await migration.compileMigrations()).toContain(
			'create unique index async "record_owner_unique" on "auth"."record"',
		);
		const resumed = queries.findIndex((query) =>
			query.sql.includes("from sys.jobs"),
		);
		expect(queries[resumed]!.parameters).toContain("auth");
		expect(queries[resumed + 1]!.parameters).toEqual(["pending-index"]);
	});

	it("keeps DSQL system result keys unchanged with CamelCasePlugin", async () => {
		const { dialect, queries } = postgres({ pendingJob: "pending-index" });
		const db = new Kysely({ dialect, plugins: [new CamelCasePlugin()] });
		try {
			await (
				await getMigrations({ database: { db, type: "postgres", dsql: true } })
			).runMigrations();
			const calls = queries.filter((query) =>
				query.sql.startsWith("call sys.wait_for_job"),
			);
			expect(calls.length).toBeGreaterThan(1);
			expect(calls[0]!.parameters).toEqual(["pending-index"]);
		} finally {
			await db.destroy();
		}
	});

	it("waits for asynchronous indexes before reporting migration success", async () => {
		const { dialect, queries } = postgres();
		const database = { dialect, type: "postgres" as const, dsql: true };
		await (await getMigrations({ database })).runMigrations();
		const index = queries.findIndex((q) =>
			q.sql.startsWith("create index async"),
		);
		expect(index).toBeGreaterThan(-1);
		expect(queries[index + 1]?.sql).toBe("call sys.wait_for_job($1)");
		expect(queries[index + 1]?.parameters).toEqual(["index-job"]);
	});

	it("fails the migration when the index job fails", async () => {
		const { dialect } = postgres({ jobSucceeded: false });
		const database = { dialect, type: "postgres" as const, dsql: true };
		await expect(
			(await getMigrations({ database })).runMigrations(),
		).rejects.toThrow(/index-job/);
	});

	it("uses an explicit identity cache for numeric IDs", async () => {
		const { dialect } = postgres();
		const database = { dialect, type: "postgres" as const, dsql: true };
		const config: BetterAuthOptions = {
			database,
			advanced: { database: { generateId: "serial" } },
		};
		const ddl = await (await getMigrations(config)).compileMigrations();
		expect(ddl).toContain("bigint GENERATED BY DEFAULT AS IDENTITY (CACHE 1)");
		expect(ddl).toContain('"userId" bigint');
	});

	it.each([false, true])(
		"recovers field indexes after interruption (unique: %s)",
		async (unique) => {
			const { dialect } = postgres({
				tables: [
					{
						name: "record",
						schema: "public",
						isView: false,
						columns: ["id", "owner"].map((name) => ({
							name,
							dataType: "text",
							isNullable: false,
							hasDefaultValue: false,
							isAutoIncrementing: false,
						})),
					},
				],
			});
			const database = { dialect, type: "postgres" as const, dsql: true };
			const migration = await getMigrations({
				database,
				plugins: [
					{
						id: "records",
						schema: {
							record: {
								fields: { owner: { type: "string", index: true, unique } },
							},
						},
					},
				],
			});
			expect(await migration.compileMigrations()).toContain(
				unique
					? 'create unique index async "record_owner_uidx"'
					: 'create index async "record_owner_idx"',
			);
		},
	);
});
