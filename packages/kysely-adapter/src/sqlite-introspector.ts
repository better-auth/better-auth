import type {
	DatabaseIntrospector,
	DatabaseMetadataOptions,
	Kysely,
	TableMetadata,
} from "kysely";
import { sql } from "kysely";
import {
	DEFAULT_MIGRATION_LOCK_TABLE,
	DEFAULT_MIGRATION_TABLE,
} from "./kysely-migration-tables";

/**
 * @see https://www.sqlite.org/pragma.html#pragma_table_info
 */
export interface PragmaTableInfo {
	cid: number;
	dflt_value: unknown;
	name: string;
	notnull: 0 | 1;
	pk: number;
	type: string;
}

export interface PragmaIndexListRow {
	name: string;
	origin: "c" | "u" | "pk";
	partial: number;
	unique: number;
}

interface SqliteTable {
	name: string;
	type?: string | undefined;
}

interface SqliteSystemDatabase {
	sqlite_schema: {
		name: string;
		type: "index" | "table" | "trigger" | "view";
	};
}

export function sqliteIntegerPrimaryKeyColumn(
	columns: readonly PragmaTableInfo[],
): string | undefined {
	const primaryKeys = columns.filter((column) => column.pk > 0);
	const primaryKey = primaryKeys.length === 1 ? primaryKeys[0] : undefined;
	return primaryKey?.type.toLowerCase() === "integer"
		? primaryKey.name
		: undefined;
}

async function sqliteGeneratedPrimaryKeyColumn(
	db: Kysely<unknown>,
	name: string,
	columns: readonly PragmaTableInfo[],
): Promise<string | undefined> {
	const column = sqliteIntegerPrimaryKeyColumn(columns);
	if (!column) return;
	const { rows } = await sql<PragmaIndexListRow>`
		PRAGMA index_list(${sql.id(name)})
	`.execute(db.withoutPlugins());
	return rows.some((index) => index.origin === "pk") ? undefined : column;
}

export function toSqliteTableMetadata(
	table: SqliteTable,
	columns: readonly PragmaTableInfo[],
	autoIncrementColumn: string | undefined,
): TableMetadata {
	return {
		name: table.name,
		isView: table.type === "view",
		columns: columns.map((column) => ({
			name: column.name,
			dataType: column.type,
			isNullable: column.notnull === 0,
			isAutoIncrementing: column.name === autoIncrementColumn,
			hasDefaultValue: column.dflt_value != null,
		})),
	};
}

async function readTableMetadata(
	db: Kysely<unknown>,
	name: string,
): Promise<TableMetadata | undefined> {
	const { rows: columns } = await sql<PragmaTableInfo>`
		PRAGMA table_info(${sql.id(name)})
	`.execute(db.withoutPlugins());
	if (columns.length === 0) return;
	const generatedColumn = await sqliteGeneratedPrimaryKeyColumn(
		db,
		name,
		columns,
	);
	return toSqliteTableMetadata({ name }, columns, generatedColumn);
}

export async function introspectSqliteTables(
	db: Kysely<unknown>,
	tableNames: readonly string[],
): Promise<readonly TableMetadata[]> {
	if (tableNames.length === 0) return [];
	try {
		return await db.introspection.getTables();
	} catch {
		// D1 may reject catalog-wide introspection, so inspect only expected tables.
		const tables = await Promise.all(
			tableNames.map((name) => readTableMetadata(db, name)),
		);
		return tables.filter((table) => table !== undefined);
	}
}

export function createSqliteIntrospector(
	db: Kysely<unknown>,
): DatabaseIntrospector {
	const systemDb = db as Kysely<SqliteSystemDatabase>;
	async function getSchemas() {
		// SQLite does not support schemas.
		return [];
	}

	async function getTables(
		options: DatabaseMetadataOptions = { withInternalKyselyTables: false },
	): Promise<TableMetadata[]> {
		let query = systemDb
			.selectFrom("sqlite_schema")
			.where("type", "=", "table")
			.where("name", "not like", "sqlite_%")
			.select("name");

		if (!options.withInternalKyselyTables) {
			query = query
				.where("name", "!=", DEFAULT_MIGRATION_TABLE)
				.where("name", "!=", DEFAULT_MIGRATION_LOCK_TABLE);
		}

		const tables = await query.execute();
		return Promise.all(
			tables.map(async ({ name }) => {
				const columns = await db
					.selectFrom(
						sql<PragmaTableInfo>`pragma_table_info(${name})`.as("table_info"),
					)
					.select(["cid", "name", "type", "notnull", "dflt_value", "pk"])
					.execute();
				const generatedColumn = await sqliteGeneratedPrimaryKeyColumn(
					db,
					name,
					columns,
				);
				return toSqliteTableMetadata({ name }, columns, generatedColumn);
			}),
		);
	}

	return {
		getSchemas,
		getTables,
		getMetadata: async (options) => ({ tables: await getTables(options) }),
	};
}
