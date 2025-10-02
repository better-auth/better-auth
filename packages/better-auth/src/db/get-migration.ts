import type {
	AlterTableColumnAlteringBuilder,
	CreateTableBuilder,
} from "kysely";
import type { DBFieldAttribute, DBFieldType } from "@better-auth/core/db";
import { sql } from "kysely";
import { createLogger } from "../utils/logger";
import type { BetterAuthOptions } from "../types";
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
	const tableMetadata = await db.introspection.getTables();
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
		return typeMap[type]![dbType || "sqlite"];
	}
	if (toBeAdded.length) {
		for (const table of toBeAdded) {
			for (const [fieldName, field] of Object.entries(table.fields)) {
				const type = getType(field, fieldName);
				const exec = db.schema
					.alterTable(table.table)
					.addColumn(fieldName, type, (col) => {
						col = field.required !== false ? col.notNull() : col;
						if (field.references) {
							col = col
								.references(
									`${field.references.model}.${field.references.field}`,
								)
								.onDelete(field.references.onDelete || "cascade");
						}
						if (field.unique) {
							col = col.unique();
						}
						if (
							field.type === "date" &&
							typeof field.defaultValue === "function" &&
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

			const indices: Array<{ table: string; field: string }> = [];
			for (const [fieldName, field] of Object.entries(table.fields)) {
				const type = getType(field, fieldName);
				dbT = dbT.addColumn(fieldName, type, (col) => {
					col = field.required !== false ? col.notNull() : col;
					if (field.references) {
						col = col
							.references(`${field.references.model}.${field.references.field}`)
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
