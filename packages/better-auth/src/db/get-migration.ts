import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute, DBFieldType } from "@better-auth/core/db";
import { getAuthTables } from "@better-auth/core/db";
import {
	initGetFieldName,
	initGetModelName,
} from "@better-auth/core/db/adapter";
import { createLogger } from "@better-auth/core/env";
import type {
	AlterTableBuilder,
	AlterTableColumnAlteringBuilder,
	CreateIndexBuilder,
	CreateTableBuilder,
	Kysely,
} from "kysely";
import { sql } from "kysely";
import { createKyselyAdapter } from "../adapters/kysely-adapter/dialect";
import type { KyselyDatabaseType } from "../adapters/kysely-adapter/types";
import { getSchema } from "./get-schema";

const postgresMap = {
	string: ["character varying", "varchar", "text", "uuid"],
	number: [
		"int4",
		"integer",
		"bigint",
		"smallint",
		"numeric",
		"real",
		"double precision",
	],
	boolean: ["bool", "boolean"],
	date: ["timestamptz", "timestamp", "date"],
	json: ["json", "jsonb"],
};
const mysqlMap = {
	string: ["varchar", "text", "uuid"],
	number: [
		"integer",
		"int",
		"bigint",
		"smallint",
		"decimal",
		"float",
		"double",
	],
	boolean: ["boolean", "tinyint"],
	date: ["timestamp", "datetime", "date"],
	json: ["json"],
};

const sqliteMap = {
	string: ["TEXT"],
	number: ["INTEGER", "REAL"],
	boolean: ["INTEGER", "BOOLEAN"], // 0 or 1
	date: ["DATE", "INTEGER"],
	json: ["TEXT"],
};

const mssqlMap = {
	string: ["varchar", "nvarchar", "uniqueidentifier"],
	number: ["int", "bigint", "smallint", "decimal", "float", "double"],
	boolean: ["bit", "smallint"],
	date: ["datetime2", "date", "datetime"],
	json: ["varchar", "nvarchar"],
};

const map = {
	postgres: postgresMap,
	mysql: mysqlMap,
	sqlite: sqliteMap,
	mssql: mssqlMap,
};

export function matchType(
	columnDataType: string,
	fieldType: DBFieldType,
	dbType: KyselyDatabaseType,
) {
	function normalize(type: string) {
		return type.toLowerCase().split("(")[0]!.trim();
	}
	if (fieldType === "string[]" || fieldType === "number[]") {
		return columnDataType.toLowerCase().includes("json");
	}
	const types = map[dbType]!;
	const expected = Array.isArray(fieldType)
		? types["string"].map((t) => t.toLowerCase())
		: types[fieldType]!.map((t) => t.toLowerCase());
	return expected.includes(normalize(columnDataType));
}

/**
 * Get the current PostgreSQL schema (search_path) for the database connection
 * Returns the first schema in the search_path, defaulting to 'public' if not found
 */
async function getPostgresSchema(db: Kysely<unknown>): Promise<string> {
	try {
		const result = await sql<{ search_path: string }>`SHOW search_path`.execute(
			db,
		);
		if (result.rows[0]?.search_path) {
			// search_path can be a comma-separated list like "$user, public" or '"$user", public'
			// We want the first non-variable schema
			const schemas = result.rows[0].search_path
				.split(",")
				.map((s) => s.trim())
				// Remove quotes and filter out variables like $user
				.map((s) => s.replace(/^["']|["']$/g, ""))
				.filter((s) => !s.startsWith("$"));
			return schemas[0] || "public";
		}
	} catch (error) {
		// If query fails, fall back to public schema
	}
	return "public";
}

export async function getMigrations(config: BetterAuthOptions) {
	const betterAuthSchema = getSchema(config);
	const logger = createLogger(config.logger);

	let { kysely: db, databaseType: dbType } = await createKyselyAdapter(config);

	if (!dbType) {
		logger.warn(
			"Could not determine database type, defaulting to sqlite. Please provide a type in the database options to avoid this.",
		);
		dbType = "sqlite";
	}

	if (!db) {
		logger.error(
			"Only kysely adapter is supported for migrations. You can use `generate` command to generate the schema, if you're using a different adapter.",
		);
		process.exit(1);
	}

	// For PostgreSQL, detect and log the current schema being used
	let currentSchema = "public";
	if (dbType === "postgres") {
		currentSchema = await getPostgresSchema(db);
		logger.debug(
			`PostgreSQL migration: Using schema '${currentSchema}' (from search_path)`,
		);

		// Verify the schema exists
		try {
			const schemaCheck = await sql<{ schema_name: string }>`
				SELECT schema_name 
				FROM information_schema.schemata 
				WHERE schema_name = ${currentSchema}
			`.execute(db);

			if (!schemaCheck.rows[0]) {
				logger.warn(
					`Schema '${currentSchema}' does not exist. Tables will be inspected from available schemas. Consider creating the schema first or checking your database configuration.`,
				);
			}
		} catch (error) {
			logger.debug(
				`Could not verify schema existence: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	const allTableMetadata = await db.introspection.getTables();

	// For PostgreSQL, filter tables to only those in the target schema
	let tableMetadata = allTableMetadata;
	if (dbType === "postgres") {
		// Get tables with their schema information
		try {
			const tablesInSchema = await sql<{
				table_name: string;
			}>`
				SELECT table_name 
				FROM information_schema.tables 
				WHERE table_schema = ${currentSchema}
				AND table_type = 'BASE TABLE'
			`.execute(db);

			const tableNamesInSchema = new Set(
				tablesInSchema.rows.map((row) => row.table_name),
			);

			// Filter to only tables that exist in the target schema
			tableMetadata = allTableMetadata.filter(
				(table) =>
					table.schema === currentSchema && tableNamesInSchema.has(table.name),
			);

			logger.debug(
				`Found ${tableMetadata.length} table(s) in schema '${currentSchema}': ${tableMetadata.map((t) => t.name).join(", ") || "(none)"}`,
			);
		} catch (error) {
			logger.warn(
				`Could not filter tables by schema. Using all discovered tables. Error: ${error instanceof Error ? error.message : String(error)}`,
			);
			// Fall back to using all tables if schema filtering fails
		}
	}
	const toBeCreated: {
		table: string;
		fields: Record<string, DBFieldAttribute>;
		order: number;
	}[] = [];
	const toBeAdded: {
		table: string;
		fields: Record<string, DBFieldAttribute>;
		order: number;
	}[] = [];

	for (const [key, value] of Object.entries(betterAuthSchema)) {
		const table = tableMetadata.find((t) => t.name === key);
		if (!table) {
			const tIndex = toBeCreated.findIndex((t) => t.table === key);
			const tableData = {
				table: key,
				fields: value.fields,
				order: value.order || Infinity,
			};

			const insertIndex = toBeCreated.findIndex(
				(t) => (t.order || Infinity) > tableData.order,
			);

			if (insertIndex === -1) {
				if (tIndex === -1) {
					toBeCreated.push(tableData);
				} else {
					toBeCreated[tIndex]!.fields = {
						...toBeCreated[tIndex]!.fields,
						...value.fields,
					};
				}
			} else {
				toBeCreated.splice(insertIndex, 0, tableData);
			}
			continue;
		}
		let toBeAddedFields: Record<string, DBFieldAttribute> = {};
		for (const [fieldName, field] of Object.entries(value.fields)) {
			const column = table.columns.find((c) => c.name === fieldName);
			if (!column) {
				toBeAddedFields[fieldName] = field;
				continue;
			}

			if (matchType(column.dataType, field.type, dbType)) {
				continue;
			} else {
				logger.warn(
					`Field ${fieldName} in table ${key} has a different type in the database. Expected ${field.type} but got ${column.dataType}.`,
				);
			}
		}
		if (Object.keys(toBeAddedFields).length > 0) {
			toBeAdded.push({
				table: key,
				fields: toBeAddedFields,
				order: value.order || Infinity,
			});
		}
	}

	const migrations: (
		| AlterTableColumnAlteringBuilder
		| ReturnType<AlterTableBuilder["addIndex"]>
		| CreateTableBuilder<string, string>
		| CreateIndexBuilder
	)[] = [];

	const useUUIDs = config.advanced?.database?.generateId === "uuid";
	const useNumberId =
		config.advanced?.database?.useNumberId ||
		config.advanced?.database?.generateId === "serial";

	function getType(field: DBFieldAttribute, fieldName: string) {
		const type = field.type;
		const typeMap = {
			string: {
				sqlite: "text",
				postgres: "text",
				mysql: field.unique
					? "varchar(255)"
					: field.references
						? "varchar(36)"
						: field.sortable
							? "varchar(255)"
							: field.index
								? "varchar(255)"
								: "text",
				mssql:
					field.unique || field.sortable
						? "varchar(255)"
						: field.references
							? "varchar(36)"
							: // mssql deprecated `text`, and the alternative is `varchar(max)`.
								// Kysely type interface doesn't support `text`, so we set this to `varchar(8000)` as
								// that's the max length for `varchar`
								"varchar(8000)",
			},
			boolean: {
				sqlite: "integer",
				postgres: "boolean",
				mysql: "boolean",
				mssql: "smallint",
			},
			number: {
				sqlite: field.bigint ? "bigint" : "integer",
				postgres: field.bigint ? "bigint" : "integer",
				mysql: field.bigint ? "bigint" : "integer",
				mssql: field.bigint ? "bigint" : "integer",
			},
			date: {
				sqlite: "date",
				postgres: "timestamptz",
				mysql: "timestamp(3)",
				mssql: sql`datetime2(3)`,
			},
			json: {
				sqlite: "text",
				postgres: "jsonb",
				mysql: "json",
				mssql: "varchar(8000)",
			},
			id: {
				postgres: useNumberId
					? sql`integer GENERATED BY DEFAULT AS IDENTITY`
					: useUUIDs
						? "uuid"
						: "text",
				mysql: useNumberId
					? "integer"
					: useUUIDs
						? "varchar(36)"
						: "varchar(36)",
				mssql: useNumberId
					? "integer"
					: useUUIDs
						? "varchar(36)"
						: "varchar(36)",
				sqlite: useNumberId ? "integer" : "text",
			},
			foreignKeyId: {
				postgres: useNumberId ? "integer" : useUUIDs ? "uuid" : "text",
				mysql: useNumberId
					? "integer"
					: useUUIDs
						? "varchar(36)"
						: "varchar(36)",
				mssql: useNumberId
					? "integer"
					: useUUIDs
						? "varchar(36)" /* Should be using `UNIQUEIDENTIFIER` but Kysely doesn't support it */
						: "varchar(36)",
				sqlite: useNumberId ? "integer" : "text",
			},
		} as const;
		if (fieldName === "id" || field.references?.field === "id") {
			if (fieldName === "id") {
				return typeMap.id[dbType!];
			}
			return typeMap.foreignKeyId[dbType!];
		}
		if (dbType === "sqlite" && (type === "string[]" || type === "number[]")) {
			return "text";
		}
		if (type === "string[]" || type === "number[]") {
			return "jsonb";
		}
		if (Array.isArray(type)) {
			return "text";
		}
		if (!(type in typeMap)) {
			throw new Error(
				`Unsupported field type '${String(type)}' for field '${fieldName}'. Allowed types are: string, number, boolean, date, string[], number[]. If you need to store structured data, store it as a JSON string (type: "string") or split it into primitive fields. See https://better-auth.com/docs/advanced/schema#additional-fields`,
			);
		}
		return typeMap[type]![dbType || "sqlite"];
	}
	const getModelName = initGetModelName({
		schema: getAuthTables(config),
		usePlural: false,
	});
	const getFieldName = initGetFieldName({
		schema: getAuthTables(config),
		usePlural: false,
	});

	// Helper function to safely resolve model and field names, falling back to
	// user-supplied strings for external tables not in the BetterAuth schema
	function getReferencePath(model: string, field: string): string {
		try {
			const modelName = getModelName(model);
			const fieldName = getFieldName({ model, field });
			return `${modelName}.${fieldName}`;
		} catch {
			// If resolution fails (external table), fall back to user-supplied references
			return `${model}.${field}`;
		}
	}

	if (toBeAdded.length) {
		for (const table of toBeAdded) {
			for (const [fieldName, field] of Object.entries(table.fields)) {
				const type = getType(field, fieldName);
				let builder = db.schema.alterTable(table.table);

				if (field.index) {
					const index = db.schema
						.alterTable(table.table)
						.addIndex(`${table.table}_${fieldName}_idx`);
					migrations.push(index);
				}

				let built = builder.addColumn(fieldName, type, (col) => {
					col = field.required !== false ? col.notNull() : col;
					if (field.references) {
						col = col
							.references(
								getReferencePath(
									field.references.model,
									field.references.field,
								),
							)
							.onDelete(field.references.onDelete || "cascade");
					}
					if (field.unique) {
						col = col.unique();
					}
					if (
						field.type === "date" &&
						typeof field.defaultValue === "function" &&
						(dbType === "postgres" || dbType === "mysql" || dbType === "mssql")
					) {
						if (dbType === "mysql") {
							col = col.defaultTo(sql`CURRENT_TIMESTAMP(3)`);
						} else {
							col = col.defaultTo(sql`CURRENT_TIMESTAMP`);
						}
					}
					return col;
				});
				migrations.push(built);
			}
		}
	}

	let toBeIndexed: CreateIndexBuilder[] = [];

	if (config.advanced?.database?.useNumberId) {
		logger.warn(
			"`useNumberId` is deprecated. Please use `generateId` with `serial` instead.",
		);
	}

	if (toBeCreated.length) {
		for (const table of toBeCreated) {
			const idType = getType({ type: useNumberId ? "number" : "string" }, "id");
			let dbT = db.schema
				.createTable(table.table)
				.addColumn("id", idType, (col) => {
					if (useNumberId) {
						if (dbType === "postgres") {
							// Identity column is already specified in the type via sql template tag
							return col.primaryKey().notNull();
						} else if (dbType === "sqlite") {
							return col.primaryKey().notNull();
						} else if (dbType === "mssql") {
							return col.identity().primaryKey().notNull();
						}
						return col.autoIncrement().primaryKey().notNull();
					}
					if (useUUIDs) {
						if (dbType === "postgres") {
							return col
								.primaryKey()
								.defaultTo(sql`pg_catalog.gen_random_uuid()`)
								.notNull();
						}
						return col.primaryKey().notNull();
					}
					return col.primaryKey().notNull();
				});

			for (const [fieldName, field] of Object.entries(table.fields)) {
				const type = getType(field, fieldName);
				dbT = dbT.addColumn(fieldName, type, (col) => {
					col = field.required !== false ? col.notNull() : col;
					if (field.references) {
						col = col
							.references(
								getReferencePath(
									field.references.model,
									field.references.field,
								),
							)
							.onDelete(field.references.onDelete || "cascade");
					}

					if (field.unique) {
						col = col.unique();
					}
					if (
						field.type === "date" &&
						typeof field.defaultValue === "function" &&
						(dbType === "postgres" || dbType === "mysql" || dbType === "mssql")
					) {
						if (dbType === "mysql") {
							col = col.defaultTo(sql`CURRENT_TIMESTAMP(3)`);
						} else {
							col = col.defaultTo(sql`CURRENT_TIMESTAMP`);
						}
					}
					return col;
				});

				if (field.index) {
					let builder = db.schema
						.createIndex(
							`${table.table}_${fieldName}_${field.unique ? "uidx" : "idx"}`,
						)
						.on(table.table)
						.columns([fieldName]);
					toBeIndexed.push(field.unique ? builder.unique() : builder);
				}
			}
			migrations.push(dbT);
		}
	}

	// instead of adding the index straight to `migrations`,
	// we do this at the end so that indexes are created after the table is created
	if (toBeIndexed.length) {
		for (const index of toBeIndexed) {
			migrations.push(index);
		}
	}

	async function runMigrations() {
		for (const migration of migrations) {
			await migration.execute();
		}
	}
	async function compileMigrations() {
		const compiled = migrations.map((m) => m.compile().sql);
		return compiled.join(";\n\n") + ";";
	}
	return { toBeCreated, toBeAdded, runMigrations, compileMigrations };
}
