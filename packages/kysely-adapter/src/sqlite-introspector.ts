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

/** @see https://www.sqlite.org/autoinc.html */
function declaredAutoIncrementColumn(
	createSql: string | null | undefined,
	columns: readonly PragmaTableInfo[],
): string | undefined {
	// PRAGMA table_info does not report the AUTOINCREMENT keyword.
	return /\sAUTOINCREMENT\b/i.test(createSql ?? "")
		? sqliteIntegerPrimaryKeyColumn(columns)
		: undefined;
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
					declaredAutoIncrementColumn(createTable?.sql, columns),
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
