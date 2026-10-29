import type { BetterAuthOptions } from "@better-auth/core";
import { getMigrations } from "better-auth/db/migration";
import type {
	CompiledQuery,
	DatabaseConnection,
	Dialect,
	KyselyPlugin,
	TableMetadata,
} from "kysely";
import {
	CamelCasePlugin,
	Kysely,
	PostgresAdapter,
	PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";
import { dsqlAdapter } from "./adapter";
import { withDsqlDialect } from "./dialect";
import { getDsqlMigrations } from "./migration";

function postgres(options?: {
	tables?: TableMetadata[];
	jobSucceeded?: boolean;
	pendingJob?: string;
	indexes?: {
		table_name: string;
		index_name: string;
		column_name: string;
		is_unique: boolean;
		valid: boolean;
	}[];
}) {
	let indexJobs = 0;
	const queries: { sql: string; parameters: readonly unknown[] }[] = [];
	const connection: DatabaseConnection = {
		async executeQuery<R>(query: CompiledQuery) {
			queries.push(query);
			const rows = /^create (unique )?index async/.test(query.sql)
				? [{ job_id: `index-job-${++indexJobs}` }]
				: query.sql.includes("from sys.jobs")
					? options?.pendingJob
						? [{ job_id: options.pendingJob }]
						: []
					: query.sql.startsWith("select t.relname as table_name")
						? (options?.indexes ?? [])
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
	it("reports schema problems to the CLI and refuses programmatic execution", async () => {
		const { dialect, queries } = postgres({
			tables: [
				{
					name: "user",
					schema: "public",
					isView: false,
					columns: ["id", "unexpected"].map((name) => ({
						name,
						dataType: "text",
						isNullable: false,
						hasDefaultValue: false,
						isAutoIncrementing: false,
					})),
				},
			],
		});
		const db = new Kysely<unknown>({ dialect: withDsqlDialect(dialect) });
		try {
			const adapter = dsqlAdapter(db)({});
			const plan = await adapter.getMigrations!({});
			expect(plan.schemaProblems.join(" ")).toContain("unexpected");
			await expect(plan.runMigrations()).rejects.toThrow("unexpected");
			await expect(adapter.createSchema!({})).rejects.toThrow("unexpected");
			expect(
				queries.some(({ sql }) => /^(create|alter|drop) /i.test(sql)),
			).toBe(false);
		} finally {
			await db.destroy();
		}
	});

	it("provides the CLI migration hook without applying the plan during preparation", async () => {
		const { dialect, queries } = postgres();
		const db = new Kysely<unknown>({ dialect: withDsqlDialect(dialect) });
		try {
			const adapter = dsqlAdapter(db)({});
			const plan = await adapter.getMigrations!({});
			expect(plan.toBeCreated.some(({ table }) => table === "user")).toBe(true);
			expect(
				queries.some(({ sql }) => /^(create|alter|drop) /i.test(sql)),
			).toBe(false);
			await plan.runMigrations();
			expect(queries.some(({ sql }) => /^create table /i.test(sql))).toBe(true);
			expect(queries.some(({ sql }) => sql.includes("sys.wait_for_job"))).toBe(
				true,
			);
		} finally {
			await db.destroy();
		}
	});

	function fixture(
		input?: Parameters<typeof postgres>[0],
		plugins: KyselyPlugin[] = [],
	) {
		const { dialect, queries } = postgres(input);
		const db = new Kysely({ dialect: withDsqlDialect(dialect), plugins });
		return { db, dialect, queries };
	}
	it("uses a separate dialect without changing PostgreSQL migrations", async () => {
		const { db, dialect } = fixture();
		const plan = await getDsqlMigrations({}, db);
		const ddl = await plan.compileMigrations();
		expect(ddl).toContain('create index async "verification_identifier_idx"');
		expect(ddl).toContain('references "user" ("id") on delete cascade');
		const ordinary = await getMigrations({
			database: { dialect, type: "postgres" },
		});
		expect(await ordinary.compileMigrations()).not.toContain("index async");
	});
	it("uses the existing adapter createSchema hook", async () => {
		const { db } = fixture();
		const adapter = dsqlAdapter(db)({});
		const schema = await adapter.createSchema!({}, "migration.sql");
		expect(schema.path).toBe("migration.sql");
		expect(schema.code).toContain(
			'create index async "verification_identifier_idx"',
		);
	});
	const indexed: BetterAuthOptions = {
		plugins: [
			{
				id: "indexed",
				schema: {
					record: {
						fields: { owner: { type: "string" } },
						indexes: [
							{ name: "record_owner_unique", fields: ["owner"], unique: true },
						],
					},
				},
			},
		],
	};
	it("resumes matching jobs in the configured schema", async () => {
		const { db, queries } = fixture({ pendingJob: "pending-index" });
		const plan = await getDsqlMigrations(indexed, db, { schemaName: "auth" });
		expect(await plan.compileMigrations()).toContain(
			'create unique index async "record_owner_unique" on "auth"."record"',
		);
		const resumed = queries.findIndex((q) => q.sql.includes("from sys.jobs"));
		expect(queries[resumed]!.parameters).toContain("auth");
		expect(queries[resumed + 1]!.parameters).toEqual(["pending-index"]);
	});
	it("keeps system result keys unchanged with CamelCasePlugin", async () => {
		const { db, queries } = fixture({ pendingJob: "pending-index" }, [
			new CamelCasePlugin(),
		]);
		await (await getDsqlMigrations({}, db)).runMigrations();
		const calls = queries.filter((q) =>
			q.sql.startsWith("call sys.wait_for_job"),
		);
		expect(calls.length).toBeGreaterThan(1);
		expect(calls[0]!.parameters).toEqual(["pending-index"]);
	});
	it("waits for every async index on the same connection", async () => {
		const { db, queries } = fixture();
		await (await getDsqlMigrations({}, db)).runMigrations();
		let jobs = 0;
		for (const [position, query] of queries.entries()) {
			if (!/^create (unique )?index async/.test(query.sql)) continue;
			jobs++;
			expect(queries[position + 1]?.sql).toBe("call sys.wait_for_job($1)");
			expect(queries[position + 1]?.parameters).toEqual([`index-job-${jobs}`]);
		}
		expect(jobs).toBeGreaterThan(1);
	});
	it("refuses unsuccessful jobs", async () => {
		const { db } = fixture({ jobSucceeded: false });
		await expect(
			(await getDsqlMigrations({}, db)).runMigrations(),
		).rejects.toThrow(/index-job/);
	});
	it("compiles bigint identities and matching foreign keys", async () => {
		const { db } = fixture();
		const plan = await getDsqlMigrations(
			{ advanced: { database: { generateId: "serial" } } },
			db,
		);
		const ddl = await plan.compileMigrations();
		expect(ddl).toContain("bigint GENERATED BY DEFAULT AS IDENTITY (CACHE 1)");
		expect(ddl).toContain('"userId" bigint');
	});
	it.each([false, true])(
		"recovers an existing field index (unique: %s)",
		async (unique) => {
			const { db } = fixture({
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
			const plan = await getDsqlMigrations(
				{
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
				},
				db,
			);
			expect(await plan.compileMigrations()).toContain(
				unique
					? 'create unique index async "record_owner_uidx"'
					: 'create index async "record_owner_idx"',
			);
		},
	);
	it("reuses an inline unique constraint when recovering field indexes", async () => {
		const { db } = fixture({
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
			indexes: [
				{
					table_name: "record",
					index_name: "record_owner_key",
					column_name: "owner",
					is_unique: true,
					valid: true,
				},
			],
		});
		const plan = await getDsqlMigrations(
			{
				plugins: [
					{
						id: "records",
						schema: {
							record: { fields: { owner: { type: "string", unique: true } } },
						},
					},
				],
			},
			db,
		);
		expect(await plan.compileMigrations()).not.toContain('"record_owner_uidx"');
	});
	it("refuses an incompatible named recovery index", async () => {
		const { db } = fixture({
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
			indexes: [
				{
					table_name: "record",
					index_name: "record_owner_idx",
					column_name: "id",
					is_unique: false,
					valid: true,
				},
			],
		});
		await expect(
			getDsqlMigrations(
				{
					plugins: [
						{
							id: "records",
							schema: {
								record: { fields: { owner: { type: "string", index: true } } },
							},
						},
					],
				},
				db,
			),
		).rejects.toThrow("does not match");
	});
	/** @see https://docs.aws.amazon.com/aurora-dsql/latest/userguide/create-index-syntax-support.html */
	it("accepts covering indexes with a single key and included payload columns", async () => {
		const { db, queries } = fixture({
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
			indexes: [
				{
					table_name: "record",
					index_name: "record_owner_idx",
					column_name: "owner",
					is_unique: false,
					valid: true,
				},
			],
		});
		const plan = await getDsqlMigrations(
			{
				plugins: [
					{
						id: "records",
						schema: {
							record: { fields: { owner: { type: "string", index: true } } },
						},
					},
				],
			},
			db,
		);
		expect(
			plan.toBeAddedIndexes.filter((index) => index.table === "record"),
		).toHaveLength(0);
		const catalog = queries.find((query) =>
			query.sql.startsWith("select t.relname as table_name"),
		)!.sql;
		expect(catalog).toContain("i.indnkeyatts = 1");
		expect(catalog).not.toContain("i.indnatts = 1");
	});
});
