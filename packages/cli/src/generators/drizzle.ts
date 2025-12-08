import { existsSync } from "node:fs";
import { initGetFieldName, initGetModelName } from "better-auth/adapters";
import type { BetterAuthDBSchema, DBFieldAttribute } from "better-auth/db";
import { getAuthTables } from "better-auth/db";
import type { BetterAuthOptions } from "better-auth/types";
import prettier from "prettier";
import type { SchemaGenerator } from "./types";

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

	let code: string = generateImport({
		databaseType,
		tables,
		options,
	});

	const getModelName = initGetModelName({
		schema: tables,
		usePlural: adapter.options?.adapterConfig?.usePlural,
	});

	const getFieldName = initGetFieldName({
		schema: tables,
		usePlural: adapter.options?.adapterConfig?.usePlural,
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
			name = convertToSnakeCase(name, adapter.options?.camelCase);
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

		let indexes: Index[] = [];

		const assignIndexes = (indexes: Index[]): string => {
			if (!indexes.length) return "";

			let code: string[] = [`, (table) => [`];

			for (const index of indexes) {
				code.push(`  ${index.type}("${index.name}").on(table.${index.on}),`);
			}

			code.push(`]`);

			return code.join("\n");
		};

		const schema = `export const ${modelName} = ${databaseType}Table("${convertToSnakeCase(
			modelName,
			adapter.options?.camelCase,
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

	let relationsString: string = "";
	for (const tableKey in tables) {
		const table = tables[tableKey]!;
		const modelName = getModelName(tableKey);

		type Relation = {
			/**
			 * The key of the relation that will be defined in the Drizzle schema.
			 * For "one" relations: singular (e.g., "user")
			 * For "many" relations: plural (e.g., "posts")
			 */
			key: string;
			/**
			 * The model name being referenced.
			 */
			model: string;
			/**
			 * The type of the relation: "one" (many-to-one) or "many" (one-to-many).
			 */
			type: "one" | "many";
			/**
			 * Foreign key field name and reference details (only for "one" relations).
			 */
			reference?: {
				field: string;
				references: string;
				fieldName: string; // Original field name for generating unique relation export names
			};
		};

		const oneRelations: Relation[] = [];
		const manyRelations: Relation[] = [];
		// Set to track "many" relations by key to prevent duplicates
		const manyRelationsSet = new Set<string>();

		// 1. Find all foreign keys in THIS table (creates "one" relations)
		const fields = Object.entries(table.fields);
		const foreignFields = fields.filter(([_, field]) => field.references);

		for (const [fieldName, field] of foreignFields) {
			const referencedModel = field.references!.model;
			const relationKey = getModelName(referencedModel);
			const fieldRef = `${getModelName(tableKey)}.${getFieldName({ model: tableKey, field: fieldName })}`;
			const referenceRef = `${getModelName(referencedModel)}.${getFieldName({ model: referencedModel, field: field.references!.field || "id" })}`;

			// Create a separate relation for each foreign key
			oneRelations.push({
				key: relationKey,
				model: getModelName(referencedModel),
				type: "one",
				reference: {
					field: fieldRef,
					references: referenceRef,
					fieldName: fieldName,
				},
			});
		}

		// 2. Find all OTHER tables that reference THIS table (creates "many" relations)
		const otherModels = Object.entries(tables).filter(
			([modelName]) => modelName !== tableKey,
		);

		// Map to track relations by model name to determine if unique or many
		const modelRelationsMap = new Map<
			string,
			{
				modelName: string;
				hasUnique: boolean;
				hasMany: boolean;
			}
		>();

		for (const [modelName, otherTable] of otherModels) {
			const foreignKeysPointingHere = Object.entries(otherTable.fields).filter(
				([_, field]) =>
					field.references?.model === tableKey ||
					field.references?.model === getModelName(tableKey),
			);

			if (foreignKeysPointingHere.length === 0) continue;

			// Check if any foreign key is unique
			const hasUnique = foreignKeysPointingHere.some(
				([_, field]) => !!field.unique,
			);
			const hasMany = foreignKeysPointingHere.some(
				([_, field]) => !field.unique,
			);

			modelRelationsMap.set(modelName, {
				modelName,
				hasUnique,
				hasMany,
			});
		}

		// Add relations, deduplicating by relationKey
		for (const {
			modelName,
			hasUnique,
			hasMany,
		} of modelRelationsMap.values()) {
			// Determine relation type: if all are unique, it's "one", otherwise "many"
			const relationType = hasMany ? "many" : "one";
			let relationKey = getModelName(modelName);

			// We have to apply this after checking if they have usePlural because otherwise they will end up seeing:
			/* cspell:disable-next-line */
			// "sesionss", or "accountss" - double s's.
			if (
				!adapter.options?.adapterConfig?.usePlural &&
				relationType === "many"
			) {
				relationKey = `${relationKey}s`;
			}

			// Only add if we haven't seen this key before
			if (!manyRelationsSet.has(relationKey)) {
				manyRelationsSet.add(relationKey);
				manyRelations.push({
					key: relationKey,
					model: getModelName(modelName),
					type: relationType,
				});
			}
		}

		// Group "one" relations by referenced model to detect duplicates
		const relationsByModel = new Map<string, Relation[]>();
		for (const relation of oneRelations) {
			if (relation.reference) {
				const modelKey = relation.key;
				if (!relationsByModel.has(modelKey)) {
					relationsByModel.set(modelKey, []);
				}
				relationsByModel.get(modelKey)!.push(relation);
			}
		}

		// Separate relations with duplicates (same model) from those without
		const duplicateRelations: Relation[] = [];
		const singleRelations: Relation[] = [];

		for (const [modelKey, relations] of relationsByModel.entries()) {
			if (relations.length > 1) {
				// Multiple relations to the same model - these need field-specific naming
				duplicateRelations.push(...relations);
			} else {
				// Single relation to this model - can be combined with others
				singleRelations.push(relations[0]!);
			}
		}

		// Generate field-specific exports for duplicate relations
		for (const relation of duplicateRelations) {
			if (relation.reference) {
				const fieldName = relation.reference.fieldName;
				const relationExportName = `${modelName}${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}Relations`;

				const tableRelation = `export const ${relationExportName} = relations(${getModelName(
					table.modelName,
				)}, ({ one }) => ({
				${relation.key}: one(${relation.model}, {
					fields: [${relation.reference.field}],
					references: [${relation.reference.references}],
				})
			}))`;

				relationsString += `\n${tableRelation}\n`;
			}
		}

		// Combine all single "one" relations and "many" relations into exports
		const hasOne = singleRelations.length > 0;
		const hasMany = manyRelations.length > 0;

		if (hasOne && hasMany) {
			// Both "one" and "many" relations exist - combine in one export
			const tableRelation = `export const ${modelName}Relations = relations(${getModelName(
				table.modelName,
			)}, ({ one, many }) => ({
				${singleRelations
					.map((relation) =>
						relation.reference
							? ` ${relation.key}: one(${relation.model}, {
					fields: [${relation.reference.field}],
					references: [${relation.reference.references}],
				})`
							: "",
					)
					.filter((x) => x !== "")
					.join(",\n ")}${
					singleRelations.length > 0 && manyRelations.length > 0 ? "," : ""
				}
				${manyRelations
					.map(({ key, model }) => ` ${key}: many(${model})`)
					.join(",\n ")}
			}))`;

			relationsString += `\n${tableRelation}\n`;
		} else if (hasOne) {
			// Only "one" relations exist
			const tableRelation = `export const ${modelName}Relations = relations(${getModelName(
				table.modelName,
			)}, ({ one }) => ({
				${singleRelations
					.map((relation) =>
						relation.reference
							? ` ${relation.key}: one(${relation.model}, {
					fields: [${relation.reference.field}],
					references: [${relation.reference.references}],
				})`
							: "",
					)
					.filter((x) => x !== "")
					.join(",\n ")}
			}))`;

			relationsString += `\n${tableRelation}\n`;
		} else if (hasMany) {
			// Only "many" relations exist
			const tableRelation = `export const ${modelName}Relations = relations(${getModelName(
				table.modelName,
			)}, ({ many }) => ({
				${manyRelations
					.map(({ key, model }) => ` ${key}: many(${model})`)
					.join(",\n ")}
			}))`;

			relationsString += `\n${tableRelation}\n`;
		}
	}
	code += `\n${relationsString}`;

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
	tables: BetterAuthDBSchema;
	options: BetterAuthOptions;
}) {
	const rootImports: string[] = ["relations"];
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
