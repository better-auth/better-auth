import {
	getAuthTables,
	type BetterAuthDbSchema,
	type FieldAttribute,
} from "better-auth/db";
import { existsSync } from "fs";
import type { SchemaGenerator } from "./types";

export function convertToSnakeCase(str: string) {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export const generateDrizzleSchema: SchemaGenerator = async ({
	options,
	file,
	adapter,
}) => {
	const tables = getAuthTables(options);
	const filePath = file || "./auth-schema.ts";
	const databaseType: "sqlite" | "mysql" | "pg" | undefined =
		adapter.options?.provider;

	if (!databaseType) {
		throw new Error(
			`Database provider type is undefined during Drizzle schema generation. Please define a \`provider\` in the Drizzle adapter config. Read more at https://better-auth.com/docs/adapters/drizzle`,
		);
	}
	const fileExist = existsSync(filePath);

	let code: string = generateImport({ databaseType, tables });

	for (const tableKey in tables) {
		const table = tables[tableKey]!;
		const modelName = getModelName(table.modelName, adapter.options);
		const fields = table.fields;

		function getType(name: string, field: FieldAttribute) {
			// Not possible to reach, it's here to make typescript happy
			if (!databaseType) {
				throw new Error(
					`Database provider type is undefined during Drizzle schema generation. Please define a \`provider\` in the Drizzle adapter config. Read more at https://better-auth.com/docs/adapters/drizzle`,
				);
			}
			name = convertToSnakeCase(name);

			if (field.references?.field === "id") {
				if (options.advanced?.database?.useNumberId) {
					if (databaseType === "pg") {
						return `serial('${name}').primaryKey()`;
					} else if (databaseType === "mysql") {
						return `int('${name}').autoIncrement().primaryKey()`;
					} else {
						// using sqlite
						return `integer({ mode: 'number' }).primaryKey({ autoIncrement: true })`;
					}
				}
				return `text('${name}')`;
			}

			const type = field.type as
				| "string"
				| "number"
				| "boolean"
				| "date"
				| `${"string" | "number"}[]`;

			const typeMap: Record<
				typeof type,
				Record<typeof databaseType, string>
			> = {
				string: {
					sqlite: `text('${name}')`,
					pg: `text('${name}')`,
					mysql: field.unique
						? `varchar('${name}', { length: 255 })`
						: field.references
							? `varchar('${name}', { length: 36 })`
							: `text('${name}')`,
				},
				boolean: {
					sqlite: `integer('${name}', { mode: 'boolean' })`,
					pg: `boolean('${name}')`,
					mysql: `boolean('${name}')`,
				},
				number: {
					sqlite: `integer('${name}')`,
					pg: field.bigint
						? `bigint('${name}', { mode: 'number' })`
						: `integer('${name}')`,
					mysql: field.bigint
						? `bigint('${name}', { mode: 'number' })`
						: `int('${name}')`,
				},
				date: {
					sqlite: `integer('${name}', { mode: 'timestamp' })`,
					pg: `timestamp('${name}')`,
					mysql: `timestamp('${name}')`,
				},
				"number[]": {
					sqlite: `integer('${name}').array()`,
					pg: field.bigint
						? `bigint('${name}', { mode: 'number' }).array()`
						: `integer('${name}').array()`,
					mysql: field.bigint
						? `bigint('${name}', { mode: 'number' }).array()`
						: `int('${name}').array()`,
				},
				"string[]": {
					sqlite: `text('${name}').array()`,
					pg: `text('${name}').array()`,
					mysql: `text('${name}').array()`,
				},
			} as const;
			return typeMap[type][databaseType];
		}

		let id: string = "";

		if (options.advanced?.database?.useNumberId) {
			id = `int("id").autoincrement.primaryKey()`;
		} else {
			if (databaseType === "mysql") {
				id = `varchar('id', { length: 36 }).primaryKey()`;
			} else if (databaseType === "pg") {
				id = `text('id').primaryKey()`;
			} else {
				id = `text('id').primaryKey()`;
			}
		}

		const schema = `export const ${modelName} = ${databaseType}Table("${convertToSnakeCase(
			modelName,
		)}", {
					id: ${id},
					${Object.keys(fields)
						.map((field) => {
							const attr = fields[field]!;
							let type = getType(field, attr);
							if (attr.defaultValue) {
								if (typeof attr.defaultValue === "function") {
									type += `.$defaultFn(${attr.defaultValue})`;
								} else if (typeof attr.defaultValue === "string") {
									type += `.default("${attr.defaultValue}")`;
								} else {
									type += `.default(${attr.defaultValue})`;
								}
							}
							return `${field}: ${type}${attr.required ? ".notNull()" : ""}${
								attr.unique ? ".unique()" : ""
							}${
								attr.references
									? `.references(()=> ${getModelName(
											attr.references.model,
											adapter.options,
										)}.${attr.references.field}, { onDelete: '${
											attr.references.onDelete || "cascade"
										}' })`
									: ""
							}`;
						})
						.join(",\n ")}
				});`;
		code += `\n${schema}\n`;
	}

	return {
		code: code,
		fileName: filePath,
		overwrite: fileExist,
	};
};

function generateImport({
	databaseType,
	tables,
}: { databaseType: "sqlite" | "mysql" | "pg"; tables: BetterAuthDbSchema }) {
	let imports: string[] = [];

	const hasBigint = Object.values(tables).some((table) =>
		Object.values(table.fields).some((field) => field.bigint),
	);

	imports.push(`${databaseType}Table`);
	imports.push(
		databaseType === "mysql"
			? "varchar, text"
			: databaseType === "pg"
				? "text"
				: "text",
	);
	imports.push(hasBigint ? (databaseType !== "sqlite" ? "bigint" : "") : "");
	imports.push(databaseType !== "sqlite" ? "timestamp, boolean" : "");
	imports.push(databaseType === "mysql" ? "int" : "integer");

	return `import { ${imports
		.map((x) => x.trim())
		.filter((x) => x !== "")
		.join(", ")} } from "drizzle-orm/${databaseType}-core";\n`;
}

function getModelName(
	modelName: string,
	options: Record<string, any> | undefined,
) {
	return options?.usePlural ? `${modelName}s` : modelName;
}
