import {
	getAuthTables,
	type BetterAuthDbSchema,
	type FieldAttribute,
} from "better-auth/db";
import type { BetterAuthOptions } from "better-auth/types";
import { existsSync } from "fs";
import type { SchemaGenerator } from "./types";
import prettier from "prettier";

export function convertToSnakeCase(str: string, camelCase?: boolean) {
	if (camelCase) {
		return str;
	}
	// Handle consecutive capitals (like ID, URL, API) by treating them as a single word
	return str
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2") // Handle AABb -> AA_Bb
		.replace(/([a-z\d])([A-Z])/g, "$1_$2") // Handle aBb -> a_Bb
		.toLowerCase();
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

	let code: string = generateImport({ databaseType, tables, options });

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
			name = convertToSnakeCase(name, adapter.options?.camelCase);
			if (field.references?.field === "id") {
				if (options.advanced?.database?.useNumberId) {
					if (databaseType === "pg") {
						return `integer('${name}')`;
					} else if (databaseType === "mysql") {
						return `int('${name}')`;
					} else {
						// using sqlite
						return `integer('${name}')`;
					}
				}
				if (field.references.field) {
					if (databaseType === "mysql") {
						return `varchar('${name}', { length: 36 })`;
					}
				}
				return `text('${name}')`;
			}
			const type = field.type as
				| "string"
				| "number"
				| "boolean"
				| "date"
				| "json"
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
				json: {
					sqlite: `text('${name}')`,
					pg: `jsonb('${name}')`,
					mysql: `json('${name}')`,
				},
			} as const;
			return typeMap[type][databaseType];
		}

		let id: string = "";

		if (options.advanced?.database?.useNumberId) {
			if (databaseType === "pg") {
				id = `serial("id").primaryKey()`;
			} else if (databaseType === "sqlite") {
				id = `int("id").primaryKey()`;
			} else {
				id = `int("id").autoincrement().primaryKey()`;
			}
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
			adapter.options?.camelCase,
		)}", {
					id: ${id},
					${Object.keys(fields)
						.map((field) => {
							const attr = fields[field]!;
							let type = getType(field, attr);
							if (
								attr.defaultValue !== null &&
								typeof attr.defaultValue !== "undefined"
							) {
								if (typeof attr.defaultValue === "function") {
									if (
										attr.type === "date" &&
										attr.defaultValue.toString().includes("new Date()")
									) {
										type += `.defaultNow()`;
									} else {
										type += `.$defaultFn(${attr.defaultValue})`;
									}
								} else if (typeof attr.defaultValue === "string") {
									type += `.default("${attr.defaultValue}")`;
								} else {
									type += `.default(${attr.defaultValue})`;
								}
							}
							// Add .$onUpdate() for fields with onUpdate property
							// Supported for all database types: PostgreSQL, MySQL, and SQLite
							if (attr.onUpdate && attr.type === "date") {
								if (typeof attr.onUpdate === "function") {
									type += `.$onUpdate(${attr.onUpdate})`;
								}
							}
							return `${field}: ${type}${attr.required ? ".notNull()" : ""}${
								attr.unique ? ".unique()" : ""
							}${
								attr.references
									? `.references(()=> ${getModelName(
											tables[attr.references.model]?.modelName ||
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
	const formattedCode = await prettier.format(code, {
		parser: "typescript",
	});
	return {
		code: formattedCode,
		fileName: filePath,
		overwrite: fileExist,
	};
};

function generateImport({
	databaseType,
	tables,
	options,
}: {
	databaseType: "sqlite" | "mysql" | "pg";
	tables: BetterAuthDbSchema;
	options: BetterAuthOptions;
}) {
	let imports: string[] = [];

	let hasBigint = false;
	let hasJson = false;

	for (const table of Object.values(tables)) {
		for (const field of Object.values(table.fields)) {
			if (field.bigint) hasBigint = true;
			if (field.type === "json") hasJson = true;
		}
		if (hasJson && hasBigint) break;
	}

	const useNumberId = options.advanced?.database?.useNumberId;

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
	if (databaseType === "mysql") {
		// Only include int for MySQL if actually needed
		const hasNonBigintNumber = Object.values(tables).some((table) =>
			Object.values(table.fields).some(
				(field) =>
					(field.type === "number" || field.type === "number[]") &&
					!field.bigint,
			),
		);
		const needsInt = !!useNumberId || hasNonBigintNumber;
		if (needsInt) {
			imports.push("int");
		}
	} else if (databaseType === "pg") {
		// Only include integer for PG if actually needed
		const hasNonBigintNumber = Object.values(tables).some((table) =>
			Object.values(table.fields).some(
				(field) =>
					(field.type === "number" || field.type === "number[]") &&
					!field.bigint,
			),
		);
		const hasFkToId = Object.values(tables).some((table) =>
			Object.values(table.fields).some(
				(field) => field.references?.field === "id",
			),
		);
		// handles the references field with useNumberId
		const needsInteger =
			hasNonBigintNumber ||
			(options.advanced?.database?.useNumberId && hasFkToId);
		if (needsInteger) {
			imports.push("integer");
		}
	} else {
		imports.push("integer");
	}
	imports.push(useNumberId ? (databaseType === "pg" ? "serial" : "") : "");

	//handle json last on the import order
	if (hasJson) {
		if (databaseType === "pg") imports.push("jsonb");
		if (databaseType === "mysql") imports.push("json");
		// sqlite uses text for JSON, so there's no need to handle this case
	}

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
