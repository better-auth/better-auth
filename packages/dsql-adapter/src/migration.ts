import type { BetterAuthOptions } from "@better-auth/core";
import {
	getDatabaseFieldIndexName,
	invalidateSchemaChecks,
} from "@better-auth/core/db/internal";
import { BetterAuthError } from "@better-auth/core/error";
import {
	getPostgresSchema,
	toPhysicalSchema,
} from "@better-auth/kysely-adapter";
import { getSchema } from "better-auth/db";
import { getMigrations } from "better-auth/db/migration";
import type { CompiledQuery, Kysely } from "kysely";
import { CreateIndexNode, sql } from "kysely";
import type { DsqlAdapterConfig } from "./adapter";
import { assertDsqlDatabase, waitForIndex } from "./dialect";
import { withDsqlRetry } from "./retry";

/** Plan DSQL migrations using the shared PostgreSQL planner and adapter-local recovery. */
export async function getDsqlMigrations<DB>(
	options: BetterAuthOptions,
	connection: Kysely<DB>,
	config: DsqlAdapterConfig = {},
) {
	const database = connection as unknown as Kysely<unknown>;
	assertDsqlDatabase(database);
	const db = config.schemaName
		? database.withSchema(config.schemaName)
		: database;
	const systemDB = db.withoutPlugins();
	const schema = config.schemaName ?? (await getPostgresSchema(db));
	const expected = getSchema(options);
	const fieldIndexes = Object.entries(expected).flatMap(
		([table, definition]) =>
			definition.disableMigrations
				? []
				: Object.entries(definition.fields).flatMap(([field, attribute]) => {
						if (!attribute.index && !attribute.unique) return [];
						const name = getDatabaseFieldIndexName(
							table,
							field,
							attribute.unique ?? false,
						);
						const builder = db.schema.createIndex(name).on(table).column(field);
						const index = attribute.unique ? builder.unique() : builder;
						return [
							{
								table,
								field,
								unique: attribute.unique ?? false,
								name,
								builder: index,
							},
						];
					}),
	);
	const names = [
		...fieldIndexes.map(({ builder }) => builder.compile()),
		...Object.entries(expected).flatMap(([table, definition]) =>
			definition.disableMigrations
				? []
				: (definition.indexes ?? []).map((index) =>
						db.schema
							.createIndex(index.name)
							.on(table)
							.columns([...index.columns])
							.compile(),
					),
		),
	].flatMap(({ query }) =>
		CreateIndexNode.is(query) ? [query.name.name] : [],
	);
	if (names.length) {
		const jobs = await withDsqlRetry(() =>
			sql<{
				job_id: string;
			}>`select j.job_id from sys.jobs j join pg_catalog.pg_class c on c.oid = j.object_id join pg_catalog.pg_namespace n on n.oid = c.relnamespace where j.job_type = 'INDEX_BUILD' and j.status <> 'completed' and n.nspname = ${schema} and c.relname in (${sql.join(names)})`.execute(
				systemDB,
			),
		);
		for (const job of jobs.rows)
			await waitForIndex(job.job_id, <R>(query: CompiledQuery) =>
				systemDB.executeQuery<R>(query),
			);
	}
	const plan = await getMigrations({
		...options,
		database: { db: database, type: "postgres", schemaName: config.schemaName },
	});
	const tables = await db.introspection.getTables();
	const existing = await withDsqlRetry(() =>
		sql<{
			table_name: string;
			index_name: string;
			column_name: string;
			is_unique: boolean;
			valid: boolean;
		}>`select t.relname as table_name, c.relname as index_name, a.attname as column_name, i.indisunique as is_unique, (i.indisvalid and i.indpred is null and i.indexprs is null and i.indnkeyatts = 1) as valid from pg_catalog.pg_index i join pg_catalog.pg_class t on t.oid = i.indrelid join pg_catalog.pg_class c on c.oid = i.indexrelid join pg_catalog.pg_namespace n on n.oid = t.relnamespace left join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = i.indkey[0] where n.nspname = ${schema}`.execute(
			systemDB,
		),
	);
	const recovery = fieldIndexes.filter((index) => {
		const physical = toPhysicalSchema(db, {
			[index.table]: {
				fields: { [index.field]: expected[index.table]!.fields[index.field]! },
			},
		});
		const [table, definition] = Object.entries(physical)[0]!;
		const field = Object.keys(definition.fields)[0]!;
		if (
			!tables.some(
				(entry) =>
					entry.name === table &&
					entry.schema === schema &&
					entry.columns.some((column) => column.name === field),
			)
		)
			return false;
		const query = index.builder.compile().query;
		const name = CreateIndexNode.is(query) ? query.name.name : index.name;
		const named = existing.rows.find((entry) => entry.index_name === name);
		if (named) {
			if (
				named.table_name !== table ||
				named.column_name !== field ||
				named.is_unique !== index.unique ||
				!named.valid
			)
				throw new BetterAuthError(
					`Database index "${name}" does not match the configured field. Inspect sys.jobs and correct the index before rerunning the migration.`,
				);
			return false;
		}
		if (
			index.unique &&
			existing.rows.some(
				(entry) =>
					entry.table_name === table &&
					entry.column_name === field &&
					entry.is_unique &&
					entry.valid,
			)
		)
			return false;
		return !plan.toBeAddedIndexes.some(
			(planned) => planned.table === index.table && planned.name === index.name,
		);
	});
	return {
		...plan,
		toBeAddedIndexes: [
			...plan.toBeAddedIndexes,
			...recovery.map((index) => ({
				table: index.table,
				name: index.name,
				index: {
					name: index.name,
					columns: [index.field] as [string],
					unique: index.unique,
				},
			})),
		],
		async compileMigrations() {
			const original = await plan.compileMigrations();
			return (
				[
					original === ";" ? "" : original,
					...recovery.map(({ builder }) => `${builder.compile().sql};`),
				]
					.filter(Boolean)
					.join("\n\n") || ";"
			);
		},
		async runMigrations() {
			if (plan.schemaProblems.length)
				throw new BetterAuthError(plan.schemaProblems.join("\n"));
			try {
				await plan.runMigrations();
				for (const { builder } of recovery) await builder.execute();
			} finally {
				if (options.database) invalidateSchemaChecks(options.database);
			}
		},
	};
}
