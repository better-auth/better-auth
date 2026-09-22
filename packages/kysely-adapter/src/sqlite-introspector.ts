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

interface SqliteTable {
	name: string;
	sql?: string | null | undefined;
	type?: string | undefined;
}

interface SqliteSystemDatabase {
	sqlite_schema: {
		name: string;
		sql: string | null;
		type: "index" | "table" | "trigger" | "view";
	};
}

function declaredAutoIncrementColumn(
	createSql: string | null | undefined,
): string | undefined {
	return createSql
		?.split(/[(),]/)
		.find((part) => part.toLowerCase().includes("autoincrement"))
		?.split(/\s+/)[0]
		?.replace(/["`]/g, "");
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
	return toSqliteTableMetadata(
		{ name },
		columns,
		sqliteAutoIncrementColumn(undefined, columns),
	);
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
				const createTable = await systemDb
					.selectFrom("sqlite_schema")
					.where("name", "=", name)
					.select("sql")
					.executeTakeFirst();
				const columns = await db
					.selectFrom(
						sql<PragmaTableInfo>`pragma_table_info(${name})`.as("table_info"),
					)
					.select(["cid", "name", "type", "notnull", "dflt_value", "pk"])
					.execute();
				return toSqliteTableMetadata(
					{ name, sql: createTable?.sql },
					columns,
					declaredAutoIncrementColumn(createTable?.sql),
				);
			}),
		);
	}

	return {
		getSchemas,
		getTables,
		getMetadata: async (options) => ({ tables: await getTables(options) }),
	};
}
