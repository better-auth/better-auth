import type {
	AlterTableColumnAlteringBuilder,
	CreateTableBuilder,
} from "kysely";
import type { FieldAttribute, FieldType } from ".";
import { logger } from "../utils/logger";
import type { BetterAuthOptions } from "../types";
import { createKyselyAdapter } from "../adapters/kysely-adapter/dialect";
import type { KyselyDatabaseType } from "../adapters/kysely-adapter/types";
import { getSchema } from "./get-schema";

const postgresMap = {
	string: ["character varying", "text"],
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
	date: ["timestamp", "date"],
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
	boolean: ["boolean"],
	date: ["datetime", "date"],
};

const sqliteMap = {
	string: ["TEXT"],
	number: ["INTEGER", "REAL"],
	boolean: ["INTEGER", "BOOLEAN"], // 0 or 1
	date: ["DATE", "INTEGER"],
};

const mssqlMap = {
	string: ["nvarchar", "varchar"],
	number: ["int", "bigint", "smallint", "decimal", "float", "double"],
	boolean: ["bit", "boolean"],
	date: ["datetime", "date"],
};

const map = {
	postgres: postgresMap,
	mysql: mysqlMap,
	sqlite: sqliteMap,
	mssql: mssqlMap,
};

export function matchType(
	columnDataType: string,
	fieldType: FieldType,
	dbType: KyselyDatabaseType,
) {
	if (fieldType === "string[]" || fieldType === "number[]") {
		return columnDataType.toLowerCase().includes("json");
	}
	const types = map[dbType];
	const type = types[fieldType].map((t) => t.toLowerCase());
	const matches = type.includes(columnDataType.toLowerCase());
	return matches;
}

export async function getMigrations(config: BetterAuthOptions) {
	const betterAuthSchema = getSchema(config);

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
		fields: Record<string, FieldAttribute>;
		order: number;
	}[] = [];
	const toBeAdded: {
		table: string;
		fields: Record<string, FieldAttribute>;
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
					toBeCreated[tIndex].fields = {
						...toBeCreated[tIndex].fields,
						...value.fields,
					};
				}
			} else {
				toBeCreated.splice(insertIndex, 0, tableData);
			}
			continue;
		}
		let toBeAddedFields: Record<string, FieldAttribute> = {};
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

	function getType(type: FieldType) {
		const typeMap = {
			string: "text",
			boolean: "boolean",
			number: "integer",
			date: "date",
		} as const;
		if (dbType === "mysql" && type === "string") {
			return "varchar(255)";
		}
		if (dbType === "sqlite" && (type === "string[]" || type === "number[]")) {
			return "text";
		}
		if (type === "string[]" || type === "number[]") {
			return "jsonb";
		}
		return typeMap[type];
	}
	if (toBeAdded.length) {
		for (const table of toBeAdded) {
			for (const [fieldName, field] of Object.entries(table.fields)) {
				const type = getType(field.type);
				const exec = db.schema
					.alterTable(table.table)
					.addColumn(fieldName, type, (col) => {
						col = field.required !== false ? col.notNull() : col;
						if (field.references) {
							col = col.references(
								`${field.references.model}.${field.references.field}`,
							);
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
				.addColumn("id", getType("string"), (col) =>
					col.primaryKey().notNull(),
				);

			for (const [fieldName, field] of Object.entries(table.fields)) {
				const type = getType(field.type);
				dbT = dbT.addColumn(fieldName, type, (col) => {
					col = field.required !== false ? col.notNull() : col;
					if (field.references) {
						col = col.references(
							`${field.references.model}.${field.references.field}`,
						);
					}
					if (field.unique) {
						col = col.unique();
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
		return compiled.join(";\n\n");
	}
	return { toBeCreated, toBeAdded, runMigrations, compileMigrations };
}
