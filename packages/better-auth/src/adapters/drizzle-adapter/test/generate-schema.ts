import { getAuthTables } from "../../../db";
import type { BetterAuthOptions } from "../../../types";
import * as pg from "drizzle-orm/pg-core";
import * as mysql from "drizzle-orm/mysql-core";
import * as sqlite from "drizzle-orm/sqlite-core";

/**
 * generates a drizzle schema based on BetterAuthOptions & a given dialect.
 *
 * Useful for testing the Drizzle adapter.
 */
export const generateDrizzleSchema = (
	options: BetterAuthOptions,
	dialect: "sqlite" | "mysql" | "pg",
) => {
	const models = getAuthTables(options);
	let schema: Record<string, any> = {};
	let debugSchema: Record<string, any> = {};
	for (const defaultModelName in models) {
		const model = models[defaultModelName]!;
		const modelName = model?.modelName || defaultModelName;

		const table: Record<string, any> = {};
		const debugTable: Record<string, any> = {};

		const fields = model?.fields || {};
		if (dialect === "pg") {
			table.id = pg.varchar("id", { length: 36 }).primaryKey();
		} else if (dialect === "mysql") {
			table.id = mysql.varchar("id", { length: 36 }).primaryKey();
		} else if (dialect === "sqlite") {
			table.id = sqlite.text("id").primaryKey();
		}
		for (const defaultFieldName in fields) {
			const field = fields[defaultFieldName];
			const fieldName = field?.fieldName || defaultFieldName;
			const key = fieldName;

			const type = field.type;
			if (type === "boolean") {
				if (dialect === "pg") {
					table[key] = pg.boolean(fieldName);
				} else if (dialect === "mysql") {
					table[key] = mysql.boolean(fieldName);
				} else if (dialect === "sqlite") {
					table[key] = sqlite.integer(fieldName, { mode: "boolean" });
				}
			} else if (type === "number") {
				if (dialect === "pg") {
					table[key] = pg.integer(fieldName);
				} else if (dialect === "mysql") {
					table[key] = mysql.int(fieldName);
				} else if (dialect === "sqlite") {
					table[key] = sqlite.integer(fieldName);
				}
			} else if (
				type === "string" ||
				type === "string[]" ||
				type === "number[]"
			) {
				if (dialect === "pg") {
					table[key] = pg.varchar(fieldName, { length: 255 });
				} else if (dialect === "mysql") {
					table[key] = mysql.varchar(fieldName, { length: 255 });
				} else if (dialect === "sqlite") {
					table[key] = sqlite.text(fieldName);
				}
			} else if (type === "date") {
				if (dialect === "pg") {
					table[key] = pg.timestamp(fieldName);
				} else if (dialect === "mysql") {
					table[key] = mysql.timestamp(fieldName);
				} else if (dialect === "sqlite") {
					table[key] = sqlite.integer(fieldName, { mode: "timestamp_ms" });
				}
			} else if (type === "json") {
				if (dialect === "pg") {
					table[key] = pg.jsonb(fieldName);
				} else if (dialect === "mysql") {
					table[key] = mysql.json(fieldName);
				} else if (dialect === "sqlite") {
					table[key] = sqlite.text(fieldName);
				}
			}
			debugTable[key] = { fieldName, type };

			if (field.references) {
				const { model: modelRef, field: fieldRef } = field.references;
				table[key] = table[key].references(() => schema[modelRef][fieldRef]);
			}

			if (field.references && "default" in table[key]) {
				table[key] = table[fieldName].default(field.defaultValue);
			}

			if (field.unique && "unique" in table[key]) {
				table[key] = table[key].unique();
			}

			if (field.required && "notNull" in table[key]) {
				table[key] = table[key].notNull();
			}
		}

		if (dialect === "pg") {
			schema[modelName] = pg.pgTable(modelName, table);
		} else if (dialect === "mysql") {
			schema[modelName] = mysql.mysqlTable(modelName, table);
		} else if (dialect === "sqlite") {
			schema[modelName] = sqlite.sqliteTable(modelName, table);
		}

		debugSchema[modelName] = debugTable;
	}
	// console.log(debugSchema);
	return schema;
};
