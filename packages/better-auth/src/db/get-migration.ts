import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute, DBFieldType } from "@better-auth/core/db";
import { createLogger } from "@better-auth/core/env";
import type {
	AlterTableColumnAlteringBuilder,
	CreateTableBuilder,
	Kysely,
	RawBuilder,
} from "kysely";
import { sql } from "kysely";
import { createKyselyAdapter } from "../adapters/kysely-adapter/dialect";
import type { KyselyDatabaseType } from "../adapters/kysely-adapter/types";
import { getSchema } from "./get-schema";

const postgresMap = {
	string: ["character varying", "varchar", "text"],
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
	string: ["varchar", "text"],
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
	string: ["varchar", "nvarchar"],
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

/**
 * Partial field attribute overrides that can be returned from the field override callback.
 * All properties are optional - only specified properties will override the field's default attributes.
 */
export type FieldOverride = {
	/**
	 * Override the SQL column type.
	 * Can be a string (e.g., "uuid", "varchar(255)") or a RawBuilder template literal.
	 */
	type?: string | RawBuilder<unknown>;
	/**
	 * Override whether the field is required (NOT NULL).
	 * If undefined, uses the field's default `required` property.
	 */
	required?: boolean;
	/**
	 * Override whether the field has a UNIQUE constraint.
	 * If undefined, uses the field's default `unique` property.
	 */
	unique?: boolean;
};

/**
 * Callback function to override SQL field types and attributes during migration generation.
 *
 * @param field - The field definition
 * @param fieldName - The name of the field
 * @param tableName - The name of the table
 * @param dbType - The database type (postgres, mysql, sqlite, mssql)
 * @param config - The Better Auth configuration
 * @param defaultType - The default type that would be used if no override is provided
 * @returns A FieldOverride object with partial field attributes, or undefined to use defaults
 */
export type FieldTypeOverride = (
	field: DBFieldAttribute,
	fieldName: string,
	tableName: string,
	dbType: KyselyDatabaseType,
	config: BetterAuthOptions,
	defaultType: string | RawBuilder<unknown>,
) =>
	| FieldOverride
	| undefined
	| Promise<FieldOverride | undefined>;

export async function getMigrations(
	config: BetterAuthOptions,
	fieldTypeOverride?: FieldTypeOverride,
) {
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
		| CreateTableBuilder<string, string>
	)[] = [];

	async function computeDefaultType(
		field: DBFieldAttribute,
		fieldName: string,
	): Promise<string | RawBuilder<unknown>> {
		const type = field.type;
		const typeMap = {
			string: {
				sqlite: "text",
				postgres: "text",
				mysql: field.unique
					? "varchar(255)"
					: field.references
						? "varchar(36)"
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
				postgres: config.advanced?.database?.useNumberId ? "serial" : "text",
				mysql: config.advanced?.database?.useNumberId
					? "integer"
					: "varchar(36)",
				mssql: config.advanced?.database?.useNumberId
					? "integer"
					: "varchar(36)",
				sqlite: config.advanced?.database?.useNumberId ? "integer" : "text",
			},
			foreignKeyId: {
				postgres: config.advanced?.database?.useNumberId ? "integer" : "text",
				mysql: config.advanced?.database?.useNumberId
					? "integer"
					: "varchar(36)",
				mssql: config.advanced?.database?.useNumberId
					? "integer"
					: "varchar(36)",
				sqlite: config.advanced?.database?.useNumberId ? "integer" : "text",
			},
		} as const;

		// Compute the default type
		let defaultType: string | RawBuilder<unknown>;
		if (fieldName === "id" || field.references?.field === "id") {
			if (fieldName === "id") {
				defaultType = typeMap.id[dbType!];
			} else {
				defaultType = typeMap.foreignKeyId[dbType!];
			}
		} else if (
			dbType === "sqlite" &&
			(type === "string[]" || type === "number[]")
		) {
			defaultType = "text";
		} else if (type === "string[]" || type === "number[]") {
			defaultType = "jsonb";
		} else if (Array.isArray(type)) {
			defaultType = "text";
		} else {
			defaultType = typeMap[type]![dbType || "sqlite"] as
				| string
				| RawBuilder<unknown>;
		}

		return defaultType;
	}

	async function getType(
		field: DBFieldAttribute,
		fieldName: string,
		tableName: string,
	): Promise<{
		type: string | RawBuilder<unknown>;
		override: FieldOverride | undefined;
		mergedField: DBFieldAttribute;
	}> {
		// Compute default type first
		const defaultType = await computeDefaultType(field, fieldName);

		// Call override callback if provided
		let override: FieldOverride | undefined;
		if (fieldTypeOverride) {
			const overrideResult = await fieldTypeOverride(
				field,
				fieldName,
				tableName,
				dbType!,
				config,
				defaultType,
			);
			override = overrideResult ?? undefined;
		}

		// Create merged field with override attributes applied
		// Note: We don't override the `type` property because it needs to remain a DBFieldType
		// for computeDefaultType to work correctly. The override.type is used directly for SQL.
		const mergedField: DBFieldAttribute = {
			...field,
			...(override?.required !== undefined && { required: override.required }),
			...(override?.unique !== undefined && { unique: override.unique }),
		};

		// Compute the actual SQL type using merged field (for typeMap logic that depends on field attributes)
		const computedType = await computeDefaultType(mergedField, fieldName);

		// Use override type if provided, otherwise use computed type
		const finalType = override?.type ?? computedType;

		return {
			type: finalType,
			override,
			mergedField,
		};
	}
	if (toBeAdded.length) {
		for (const table of toBeAdded) {
			for (const [fieldName, field] of Object.entries(table.fields)) {
				const { type, mergedField } = await getType(
					field,
					fieldName,
					table.table,
				);
				const exec = db.schema
					.alterTable(table.table)
					.addColumn(fieldName, type as any, (col) => {
						col = mergedField.required !== false ? col.notNull() : col;
						if (mergedField.references) {
							col = col
								.references(
									`${mergedField.references.model}.${mergedField.references.field}`,
								)
								.onDelete(mergedField.references.onDelete || "cascade");
						}
						if (mergedField.unique) {
							col = col.unique();
						}
						if (
							mergedField.type === "date" &&
							typeof mergedField.defaultValue === "function" &&
							(dbType === "postgres" ||
								dbType === "mysql" ||
								dbType === "mssql")
						) {
							if (dbType === "mysql") {
								col = col.defaultTo(sql`CURRENT_TIMESTAMP(3)`);
							} else {
								col = col.defaultTo(sql`CURRENT_TIMESTAMP`);
							}
						}
						return col;
					});
				migrations.push(exec);
			}
		}
	}
	if (toBeCreated.length) {
		for (const table of toBeCreated) {
			let dbT = db.schema
				.createTable(table.table)
				.addColumn(
					"id",
					config.advanced?.database?.useNumberId
						? dbType === "postgres"
							? "serial"
							: "integer"
						: dbType === "mysql" || dbType === "mssql"
							? "varchar(36)"
							: "text",
					(col) => {
						if (config.advanced?.database?.useNumberId) {
							if (dbType === "postgres" || dbType === "sqlite") {
								return col.primaryKey().notNull();
							} else if (dbType === "mssql") {
								return col.identity().primaryKey().notNull();
							}
							return col.autoIncrement().primaryKey().notNull();
						}
						return col.primaryKey().notNull();
					},
				);

			for (const [fieldName, field] of Object.entries(table.fields)) {
				const { type, mergedField } = await getType(
					field,
					fieldName,
					table.table,
				);
				dbT = dbT.addColumn(fieldName, type as any, (col) => {
					col = mergedField.required !== false ? col.notNull() : col;
					if (mergedField.references) {
						col = col
							.references(
								`${mergedField.references.model}.${mergedField.references.field}`,
							)
							.onDelete(mergedField.references.onDelete || "cascade");
					}

					if (mergedField.unique) {
						col = col.unique();
					}
					if (
						mergedField.type === "date" &&
						typeof mergedField.defaultValue === "function" &&
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
			}
			migrations.push(dbT);
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
