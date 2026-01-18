import { existsSync } from "node:fs";
import path from "node:path";
import type { DBAdapterSchemaCreation } from "@better-auth/core/db/adapter";
import { initGetFieldName, initGetModelName } from "better-auth/adapters";
import type { BetterAuthDBSchema, DBFieldAttribute } from "better-auth/db";
import { getAuthTables } from "better-auth/db";
import type { BetterAuthOptions } from "better-auth/types";
import type { DrizzleAdapterConfig } from "./drizzle-adapter";

interface SchemaGenerator {
	<Options extends BetterAuthOptions>(opts: {
		file?: string;
		options: Options;
		provider: "sqlite" | "mysql" | "pg";
		adapterConfig: DrizzleAdapterConfig;
		camelCase?: boolean;
	}): Promise<DBAdapterSchemaCreation>;
}

function convertToSnakeCase(str: string, camelCase?: boolean) {
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
	provider,
	adapterConfig,
	camelCase,
}) => {
	const tables = getAuthTables(options);
	const filePath = file || "./auth-schema.ts";
	const databaseType: "sqlite" | "mysql" | "pg" | undefined = provider;

	if (!databaseType) {
		throw new Error(
			`Database provider type is undefined during Drizzle schema generation. Please define a \`provider\` in the Drizzle adapter config. Read more at https://better-auth.com/docs/adapters/drizzle`,
		);
	}
	const fileExist = existsSync(filePath);

	let code: string = generateImport({
		databaseType,
		tables,
		options,
	});

	const getModelName = initGetModelName({
		schema: tables,
		usePlural: adapterConfig?.usePlural,
	});

	const getFieldName = initGetFieldName({
		schema: tables,
		usePlural: adapterConfig?.usePlural,
	});

	for (const tableKey in tables) {
		const table = tables[tableKey]!;
		const modelName = getModelName(tableKey);
		const fields = table.fields;

		function getType(name: string, field: DBFieldAttribute) {
			// Not possible to reach, it's here to make typescript happy
			if (!databaseType) {
				throw new Error(
					`Database provider type is undefined during Drizzle schema generation. Please define a \`provider\` in the Drizzle adapter config. Read more at https://better-auth.com/docs/adapters/drizzle`,
				);
			}
			name = convertToSnakeCase(name, camelCase);
			if (field.references?.field === "id") {
				const useNumberId =
					options.advanced?.database?.useNumberId ||
					options.advanced?.database?.generateId === "serial";
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				if (useNumberId) {
					if (databaseType === "pg") {
						return `integer('${name}')`;
					} else if (databaseType === "mysql") {
						return `int('${name}')`;
					} else {
						// using sqlite
						return `integer('${name}')`;
					}
				}
				if (useUUIDs && databaseType === "pg") {
					return `uuid('${name}')`;
				}
				if (field.references.field) {
					if (databaseType === "mysql") {
						return `varchar('${name}', { length: 36 })`;
					}
				}
				return `text('${name}')`;
			}
			const type = field.type;
			if (typeof type !== "string") {
				if (Array.isArray(type) && type.every((x) => typeof x === "string")) {
					return {
						sqlite: `text({ enum: [${type.map((x) => `'${x}'`).join(", ")}] })`,
						pg: `text('${name}', { enum: [${type.map((x) => `'${x}'`).join(", ")}] })`,
						mysql: `mysqlEnum([${type.map((x) => `'${x}'`).join(", ")}])`,
					}[databaseType];
				} else {
					throw new TypeError(
						`Invalid field type for field ${name} in model ${modelName}`,
					);
				}
			}
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
							: field.sortable
								? `varchar('${name}', { length: 255 })`
								: field.index
									? `varchar('${name}', { length: 255 })`
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
					sqlite: `integer('${name}', { mode: 'timestamp_ms' })`,
					pg: `timestamp('${name}')`,
					mysql: `timestamp('${name}', { fsp: 3 })`,
				},
				"number[]": {
					sqlite: `text('${name}', { mode: "json" })`,
					pg: field.bigint
						? `bigint('${name}', { mode: 'number' }).array()`
						: `integer('${name}').array()`,
					mysql: `text('${name}', { mode: 'json' })`,
				},
				"string[]": {
					sqlite: `text('${name}', { mode: "json" })`,
					pg: `text('${name}').array()`,
					mysql: `text('${name}', { mode: "json" })`,
				},
				json: {
					sqlite: `text('${name}', { mode: "json" })`,
					pg: `jsonb('${name}')`,
					mysql: `json('${name}', { mode: "json" })`,
				},
			} as const;
			const dbTypeMap = (
				typeMap as Record<string, Record<typeof databaseType, string>>
			)[type as string];
			if (!dbTypeMap) {
				throw new Error(
					`Unsupported field type '${field.type}' for field '${name}'.`,
				);
			}
			return dbTypeMap[databaseType];
		}

		let id: string = "";

		const useNumberId =
			options.advanced?.database?.useNumberId ||
			options.advanced?.database?.generateId === "serial";
		const useUUIDs = options.advanced?.database?.generateId === "uuid";

		if (useUUIDs && databaseType === "pg") {
			id = `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`).primaryKey()`;
		} else if (useNumberId) {
			if (databaseType === "pg") {
				id = `integer("id").generatedByDefaultAsIdentity().primaryKey()`;
			} else if (databaseType === "sqlite") {
				id = `integer("id", { mode: "number" }).primaryKey({ autoIncrement: true })`;
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

		type Index = { type: "uniqueIndex" | "index"; name: string; on: string };

		const indexes: Index[] = [];

		const assignIndexes = (indexes: Index[]): string => {
			if (!indexes.length) return "";

			const code: string[] = [`, (table) => [`];

			for (const index of indexes) {
				code.push(`  ${index.type}("${index.name}").on(table.${index.on}),`);
			}

			code.push(`]`);

			return code.join("\n");
		};

		const schema = `export const ${modelName} = ${databaseType}Table("${convertToSnakeCase(
			modelName,
			camelCase,
		)}", {
					id: ${id},
					${Object.keys(fields)
						.map((field) => {
							const attr = fields[field]!;
							const fieldName = attr.fieldName || field;
							let type = getType(fieldName, attr);

							if (attr.index && !attr.unique) {
								indexes.push({
									type: "index",
									name: `${modelName}_${fieldName}_idx`,
									on: fieldName,
								});
							} else if (attr.index && attr.unique) {
								indexes.push({
									type: "uniqueIndex",
									name: `${modelName}_${fieldName}_uidx`,
									on: fieldName,
								});
							}

							if (
								attr.defaultValue !== null &&
								typeof attr.defaultValue !== "undefined"
							) {
								if (typeof attr.defaultValue === "function") {
									if (
										attr.type === "date" &&
										attr.defaultValue.toString().includes("new Date()")
									) {
										if (databaseType === "sqlite") {
											type += `.default(sql\`(cast(unixepoch('subsecond') * 1000 as integer))\`)`;
										} else {
											type += `.defaultNow()`;
										}
									} else {
										// we are intentionally not adding .$defaultFn(${attr.defaultValue})
										// this is because if the defaultValue is a function, it could have
										// custom logic within that function that might not work in drizzle's context.
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

							return `${fieldName}: ${type}${attr.required ? ".notNull()" : ""}${
								attr.unique ? ".unique()" : ""
							}${
								attr.references
									? `.references(()=> ${getModelName(
											attr.references.model,
										)}.${getFieldName({ model: attr.references.model, field: attr.references.field })}, { onDelete: '${
											attr.references.onDelete || "cascade"
										}' })`
									: ""
							}`;
						})
						.join(",\n ")}
					}${assignIndexes(indexes)});`;
		code += `\n${schema}\n`;
	}

	// Build schema object import for defineRelations
	const schemaObjectKeys: string[] = [];
	for (const tableKey in tables) {
		const modelName = getModelName(tableKey);
		schemaObjectKeys.push(modelName);
	}
	const schemaObject = `{ ${schemaObjectKeys.join(", ")} }`;

	// Build relations map structure for v2 defineRelations
	type RelationDef = {
		key: string;
		type: "one" | "many";
		targetModel: string;
		fromField: string;
		toField: string;
		sourceModel: string;
	};

	// Map to store relations by model name
	const relationsMap = new Map<string, RelationDef[]>();

	// Process all tables to build relations
	for (const tableKey in tables) {
		const table = tables[tableKey]!;
		const modelName = getModelName(tableKey);
		const modelRelations: RelationDef[] = [];

		// 1. Find all foreign keys in THIS table (creates "one" relations)
		const fields = Object.entries(table.fields);
		const foreignFields = fields.filter(([_, field]) => field.references);

		for (const [fieldName, field] of foreignFields) {
			const referencedModel = field.references!.model;
			const targetModelName = getModelName(referencedModel);
			const fromField = getFieldName({ model: tableKey, field: fieldName });
			const toField = getFieldName({
				model: referencedModel,
				field: field.references!.field || "id",
			});

			// For duplicate relations to same model, use field name as key
			const existingToSameModel = modelRelations.filter(
				(r) => r.targetModel === targetModelName && r.type === "one",
			);
			const relationKey =
				existingToSameModel.length > 0
					? `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}${targetModelName}`
					: targetModelName;

			modelRelations.push({
				key: relationKey,
				type: "one",
				targetModel: targetModelName,
				fromField,
				toField,
				sourceModel: modelName,
			});
		}

		// 2. Find all OTHER tables that reference THIS table (creates "many" relations)
		const otherModels = Object.entries(tables).filter(
			([modelName]) => modelName !== tableKey,
		);

		for (const [otherTableKey, otherTable] of otherModels) {
			const foreignKeysPointingHere = Object.entries(otherTable.fields).filter(
				([_, field]) =>
					field.references?.model === tableKey ||
					field.references?.model === modelName,
			);

			if (foreignKeysPointingHere.length === 0) continue;

			const otherModelName = getModelName(otherTableKey);
			// Check if any foreign key is unique (one-to-one) vs many
			const hasMany = foreignKeysPointingHere.some(
				([_, field]) => !field.unique,
			);

			if (hasMany) {
				// Find the foreign key field that points to this table
				const fkField = foreignKeysPointingHere.find(
					([_, field]) => !field.unique,
				);
				if (fkField) {
					const [fkFieldName] = fkField;
					const fromField = "id"; // Primary key of source table
					const toField = getFieldName({
						model: otherTableKey,
						field: fkFieldName,
					});

					// Apply pluralization logic
					let relationKey = otherModelName;
					if (!adapterConfig?.usePlural) {
						relationKey = `${otherModelName}s`;
					}

					modelRelations.push({
						key: relationKey,
						type: "many",
						targetModel: otherModelName,
						fromField,
						toField,
						sourceModel: modelName,
					});
				}
			} else {
				// Handle one-to-one relationships (all foreign keys are unique)
				const fkField = foreignKeysPointingHere.find(
					([_, field]) => field.unique,
				);
				if (fkField) {
					const [fkFieldName, fieldAttr] = fkField;
					// Use the referenced field (not always "id") as the fromField
					const referencedField = fieldAttr.references?.field || "id";
					const fromField = getFieldName({
						model: tableKey,
						field: referencedField,
					});
					const toField = getFieldName({
						model: otherTableKey,
						field: fkFieldName,
					});

					// For one-to-one, use singular form (no pluralization)
					const relationKey = otherModelName;

					modelRelations.push({
						key: relationKey,
						type: "one",
						targetModel: otherModelName,
						fromField,
						toField,
						sourceModel: modelName,
					});
				}
			}
		}

		if (modelRelations.length > 0) {
			relationsMap.set(modelName, modelRelations);
		}
	}

	// Generate defineRelations call
	let relationsString = "";
	if (relationsMap.size > 0) {
		const relationsEntries: string[] = [];

		for (const [modelName, relations] of relationsMap.entries()) {
			const relationDefs: string[] = [];

			for (const relation of relations) {
				if (relation.type === "one") {
					relationDefs.push(
						`    ${relation.key}: r.one.${relation.targetModel}({\n      from: r.${relation.sourceModel}.${relation.fromField},\n      to: r.${relation.targetModel}.${relation.toField},\n    })`,
					);
				} else {
					// many relation
					relationDefs.push(
						`    ${relation.key}: r.many.${relation.targetModel}({\n      from: r.${relation.sourceModel}.${relation.fromField},\n      to: r.${relation.targetModel}.${relation.toField},\n    })`,
					);
				}
			}

			if (relationDefs.length > 0) {
				relationsEntries.push(
					`  ${modelName}: {\n${relationDefs.join(",\n")}\n  }`,
				);
			}
		}

		if (relationsEntries.length > 0) {
			relationsString = `\n\nexport const relations = defineRelations(${schemaObject}, (r) => ({\n${relationsEntries.join(",\n")}\n}));\n`;
		}
	}

	code += relationsString;

	let formattedCode = code
	try {
		//dynamically import prettier to prevent it from palluting globals with cjs shims by default
		const { format } = await import("prettier");
		formattedCode = await format(code, {
			parser: "typescript",
		});
	} catch {}

	return {
		code: formattedCode,
		fileName: path.basename(filePath),
		overwrite: fileExist,
		path: filePath,
		append: false,
	};
};

function generateImport({
	databaseType,
	tables,
	options,
}: {
	databaseType: "sqlite" | "mysql" | "pg";
	tables: BetterAuthDBSchema;
	options: BetterAuthOptions;
}) {
	const rootImports: string[] = ["defineRelations"];
	const coreImports: string[] = [];

	let hasBigint = false;
	let hasJson = false;

	for (const table of Object.values(tables)) {
		for (const field of Object.values(table.fields)) {
			if (field.bigint) hasBigint = true;
			if (field.type === "json") hasJson = true;
		}
		if (hasJson && hasBigint) break;
	}

	const useNumberId =
		options.advanced?.database?.useNumberId ||
		options.advanced?.database?.generateId === "serial";

	const useUUIDs = options.advanced?.database?.generateId === "uuid";

	coreImports.push(`${databaseType}Table`);
	coreImports.push(
		databaseType === "mysql"
			? "varchar, text"
			: databaseType === "pg"
				? "text"
				: "text",
	);
	coreImports.push(
		hasBigint ? (databaseType !== "sqlite" ? "bigint" : "") : "",
	);
	coreImports.push(databaseType !== "sqlite" ? "timestamp, boolean" : "");
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
			coreImports.push("int");
		}
		const hasEnum = Object.values(tables).some((table) =>
			Object.values(table.fields).some(
				(field) =>
					typeof field.type !== "string" &&
					Array.isArray(field.type) &&
					field.type.every((x) => typeof x === "string"),
			),
		);
		if (hasEnum) {
			coreImports.push("mysqlEnum");
		}
	} else if (databaseType === "pg") {
		if (useUUIDs) {
			rootImports.push("sql");
		}

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
			((options.advanced?.database?.useNumberId ||
				options.advanced?.database?.generateId === "serial") &&
				hasFkToId);
		if (needsInteger) {
			coreImports.push("integer");
		}
	} else {
		coreImports.push("integer");
	}
	if (databaseType === "pg" && useUUIDs) {
		coreImports.push("uuid");
	}

	//handle json last on the import order
	if (hasJson) {
		if (databaseType === "pg") coreImports.push("jsonb");
		if (databaseType === "mysql") coreImports.push("json");
		// sqlite uses text for JSON, so there's no need to handle this case
	}

	// Add sql import for SQLite timestamps with defaultNow
	const hasSQLiteTimestamp =
		databaseType === "sqlite" &&
		Object.values(tables).some((table) =>
			Object.values(table.fields).some(
				(field) =>
					field.type === "date" &&
					field.defaultValue &&
					typeof field.defaultValue === "function" &&
					field.defaultValue.toString().includes("new Date()"),
			),
		);

	if (hasSQLiteTimestamp) {
		rootImports.push("sql");
	}

	//handle indexes
	const hasIndexes = Object.values(tables).some((table) =>
		Object.values(table.fields).some((field) => field.index && !field.unique),
	);
	const hasUniqueIndexes = Object.values(tables).some((table) =>
		Object.values(table.fields).some((field) => field.unique && field.index),
	);
	if (hasIndexes) {
		coreImports.push("index");
	}
	if (hasUniqueIndexes) {
		coreImports.push("uniqueIndex");
	}

	return `${rootImports.length > 0 ? `import { ${rootImports.join(", ")} } from "drizzle-orm";\n` : ""}import { ${coreImports
		.map((x) => x.trim())
		.filter((x) => x !== "")
		.join(", ")} } from "drizzle-orm/${databaseType}-core";\n`;
}
