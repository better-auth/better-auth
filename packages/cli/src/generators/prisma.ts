import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type {
	ExpectedSchema,
	IntrospectedTable,
	ResolvedDBTableIndex,
} from "@better-auth/core/db/internal";
import {
	diffSchema,
	formatSchemaFinding,
	getDatabaseIndexStringLength,
	getPortableDatabaseIdentifierKey,
	resolveDatabaseSchemaIndexes,
} from "@better-auth/core/db/internal";
import { BetterAuthError } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "@better-auth/core/utils/string";
import type { KeyValue, Model } from "@mrleebo/prisma-ast";
import {
	getSchema as parsePrismaSchema,
	produceSchema,
} from "@mrleebo/prisma-ast";
import { initGetFieldName, initGetModelName } from "better-auth/adapters";
import type { DBFieldType } from "better-auth/db";
import { getAuthTables } from "better-auth/db";
import { getPrismaVersion } from "../utils/get-package-info";
import type { SchemaGenerator } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Each field of a Prisma model with its `@relation` name and, on the side that
 * stores the foreign key, its `fields`. Prisma pairs the two sides by name.
 */
function readRelations(model: Model | null | undefined) {
	return (model?.properties ?? []).flatMap((property) => {
		if (property.type !== "field") return [];
		const args =
			property.attributes
				?.find((attribute) => attribute.name === "relation")
				?.args?.map((arg) => arg.value) ?? [];
		const keyed = (key: string) =>
			args.find((arg): arg is KeyValue => isRecord(arg) && arg.key === key)
				?.value;
		const fields = keyed("fields");
		return {
			type: property.fieldType,
			name: args.find((arg) => typeof arg === "string") ?? keyed("name"),
			fields:
				typeof fields === "object" && fields !== null && "args" in fields
					? fields.args
					: [],
		};
	});
}

function parsePrismaStringLiteral(value: unknown) {
	if (typeof value !== "string") return undefined;
	try {
		const parsed = JSON.parse(value);
		return typeof parsed === "string" ? parsed : undefined;
	} catch {
		return undefined;
	}
}

interface PrismaIndexDefinition {
	columns: readonly string[];
	mappedName: string | undefined;
	setMappedName: (name: string) => void;
	unique: boolean;
	validFullColumns: boolean;
}

function getPrismaIndexDefinition(
	property: unknown,
): PrismaIndexDefinition | undefined {
	if (
		!isRecord(property) ||
		property.type !== "attribute" ||
		property.kind !== "object" ||
		(property.name !== "index" && property.name !== "unique") ||
		!Array.isArray(property.args)
	) {
		return undefined;
	}
	const propertyArgs = property.args;

	let columns: readonly string[] | undefined;
	let mappedName: string | undefined;
	let validFullColumns = false;
	for (const argument of propertyArgs) {
		if (!isRecord(argument) || !isRecord(argument.value)) continue;
		const value = argument.value;
		if (
			value.type === "array" &&
			Array.isArray(value.args) &&
			value.args.every((column) => typeof column === "string")
		) {
			columns = value.args.map((column) => String(column));
			validFullColumns = true;
		} else if (value.type === "keyValue" && value.key === "map") {
			mappedName = parsePrismaStringLiteral(value.value);
		}
	}
	return {
		columns: columns ?? [],
		mappedName,
		setMappedName(name) {
			propertyArgs.push({
				type: "attributeArgument",
				value: {
					type: "keyValue",
					key: "map",
					value: JSON.stringify(name),
				},
			});
		},
		unique: property.name === "unique",
		validFullColumns,
	};
}

function prismaIndexMatches(
	existing: PrismaIndexDefinition,
	configured: ResolvedDBTableIndex,
) {
	return (
		existing.validFullColumns &&
		existing.unique === (configured.unique ?? false) &&
		existing.columns.length === configured.columns.length &&
		existing.columns.every(
			(column, position) => column === configured.columns[position],
		)
	);
}

/**
 * Unqualified on purpose: Postgres reports the column default as
 * `gen_random_uuid()`, and Prisma Migrate compares `dbgenerated` with that
 * text, so the `pg_catalog.` form causes drift on every `migrate dev`.
 */
const UUID_DEFAULT = '"gen_random_uuid()"';
const LEGACY_UUID_DEFAULT = '"pg_catalog.gen_random_uuid()"';

/**
 * The models an existing schema declares, read the way the comparison wants
 * them: each model by name, each scalar or enum field by name. A relation
 * field is not a column and is skipped.
 */
function introspectPrismaSchema(schemaPrisma: string): IntrospectedTable[] {
	const models = parsePrismaSchema(schemaPrisma).list.filter(
		(block) => block.type === "model",
	);
	const modelNames = new Set(models.map((model) => model.name));
	return models.map((model) => ({
		name: model.name,
		columns: model.properties.flatMap((property) => {
			if (property.type !== "field") return [];
			const relation =
				(typeof property.fieldType === "string" &&
					modelNames.has(property.fieldType)) ||
				property.attributes?.some((attribute) => attribute.name === "relation");
			if (relation) return [];
			return [
				{
					name: property.name,
					nullable: property.optional === true,
					hasDefault:
						property.attributes?.some(
							(attribute) =>
								attribute.name === "default" || attribute.name === "updatedAt",
						) ?? false,
				},
			];
		}),
	}));
}

export const generatePrismaSchema: SchemaGenerator = async ({
	adapter,
	options,
	file,
}) => {
	const provider: "sqlite" | "postgresql" | "mysql" | "mongodb" =
		adapter.options?.provider || "postgresql";
	const tables = getAuthTables(options);
	const filePath = file || "./prisma/schema.prisma";
	// `generate` may pass an absolute path resolved against `--cwd`. Do not
	// re-join absolute paths with process.cwd() or existence/overwrite checks
	// look at the wrong file.
	const resolvedFilePath = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath);
	const schemaPrismaExist = existsSync(resolvedFilePath);

	const getModelName = initGetModelName({
		schema: getAuthTables(options),
		usePlural: adapter.options?.adapterConfig?.usePlural,
	});
	const getFieldName = initGetFieldName({
		schema: getAuthTables(options),
		usePlural: false,
	});
	const isMigrationDisabled = (model: string) =>
		Object.entries(tables).some(([tableKey, table]) => {
			if (table.disableMigrations !== true) {
				return false;
			}
			const customModelName = table.modelName || tableKey;
			return (
				model === tableKey ||
				model === customModelName ||
				model === getModelName(tableKey) ||
				model === getModelName(customModelName)
			);
		});
	const resolvedIndexesByTable = resolveDatabaseSchemaIndexes(
		Object.keys(tables)
			.filter((tableKey) => !isMigrationDisabled(tableKey))
			.map((tableKey) => {
				const customModelName = tables[tableKey]?.modelName || tableKey;
				return {
					fields: tables[tableKey]!.fields,
					indexes: tables[tableKey]!.indexes,
					tableName: getModelName(customModelName),
				};
			}),
	);

	let schemaPrisma = "";
	if (schemaPrismaExist) {
		schemaPrisma = await fs.readFile(resolvedFilePath, "utf-8");
	} else {
		schemaPrisma = getNewPrisma(provider, process.cwd());
	}

	// Update generator and datasource blocks for Prisma v7+ in existing schemas
	const prismaVersion = getPrismaVersion(process.cwd());
	if (prismaVersion && prismaVersion >= 7 && schemaPrismaExist) {
		schemaPrisma = produceSchema(schemaPrisma, (builder) => {
			const generator: any = builder.findByType("generator", {
				name: "client",
			});
			if (generator && generator.properties) {
				const providerProp = generator.properties.find(
					(prop: any) => prop.type === "assignment" && prop.key === "provider",
				);
				if (providerProp && providerProp.value === '"prisma-client-js"') {
					providerProp.value = '"prisma-client"';
				}
			}
			// Remove url from datasource block (now configured in prisma.config.ts)
			const datasource: any = builder.findByType("datasource", {
				name: "db",
			});
			if (datasource && datasource.properties) {
				const urlIndex = datasource.properties.findIndex(
					(prop: any) => prop.type === "assignment" && prop.key === "url",
				);
				if (urlIndex !== -1) {
					datasource.properties.splice(urlIndex, 1);
				}
			}
		});
	}

	const expectedModels: ExpectedSchema = {};
	for (const table in tables) {
		if (isMigrationDisabled(table)) continue;
		const customModelName = tables[table]?.modelName || table;
		const modelName = capitalizeFirstLetter(getModelName(customModelName));
		const entry = (expectedModels[modelName] ??= { fields: {} });
		for (const [field, attr] of Object.entries(tables[table]?.fields ?? {})) {
			entry.fields[attr.fieldName || field] = attr;
		}
	}

	const manyToManyRelations = new Map();

	for (const table in tables) {
		if (isMigrationDisabled(table)) {
			continue;
		}
		const fields = tables[table]?.fields;
		for (const attr of Object.values(fields ?? {})) {
			if (attr.references) {
				const referencedOriginalModel = attr.references.model;
				if (isMigrationDisabled(referencedOriginalModel)) {
					continue;
				}
				const referencedCustomModel =
					tables[referencedOriginalModel]?.modelName || referencedOriginalModel;
				const referencedModelNameCap = capitalizeFirstLetter(
					getModelName(referencedCustomModel),
				);

				if (!manyToManyRelations.has(referencedModelNameCap)) {
					manyToManyRelations.set(referencedModelNameCap, new Set());
				}

				const currentCustomModel = tables[table]?.modelName || table;
				const currentModelNameCap = capitalizeFirstLetter(
					getModelName(currentCustomModel),
				);

				manyToManyRelations
					.get(referencedModelNameCap)
					.add(currentModelNameCap);
			}
		}
	}

	const indexedFields = new Map<string, string[]>();
	for (const table in tables) {
		const fields = tables[table]?.fields;
		const customModelName = tables[table]?.modelName || table;
		const modelName = capitalizeFirstLetter(getModelName(customModelName));
		indexedFields.set(modelName, []);

		for (const [field, attr] of Object.entries(fields ?? {})) {
			if (attr.index && !attr.unique) {
				const fieldName = attr.fieldName || field;
				indexedFields.get(modelName)!.push(fieldName);
			}
		}
	}

	const schema = produceSchema(schemaPrisma, (builder) => {
		for (const table in tables) {
			if (isMigrationDisabled(table)) {
				continue;
			}
			const originalTableName = table;
			const customModelName = tables[table]?.modelName || table;
			const modelName = capitalizeFirstLetter(getModelName(customModelName));
			const fields = tables[table]?.fields;
			const resolvedTableIndexes =
				resolvedIndexesByTable.get(getModelName(customModelName)) ?? [];
			function getType({
				isBigint,
				isOptional,
				type,
			}: {
				type: DBFieldType;
				isOptional: boolean;
				isBigint: boolean;
			}) {
				if (type === "string") {
					return isOptional ? "String?" : "String";
				}
				if (Array.isArray(type)) {
					return isOptional ? "String?" : "String";
				}
				if (type === "number" && isBigint) {
					return isOptional ? "BigInt?" : "BigInt";
				}
				if (type === "number") {
					return isOptional ? "Int?" : "Int";
				}
				if (type === "boolean") {
					return isOptional ? "Boolean?" : "Boolean";
				}
				if (type === "date") {
					return isOptional ? "DateTime?" : "DateTime";
				}
				if (type === "json") {
					if (provider === "sqlite" || provider === "mysql") {
						return isOptional ? "String?" : "String";
					}
					return isOptional ? "Json?" : "Json";
				}
				if (type === "string[]") {
					// SQLite and MySQL don't support array of strings, so we use string instead
					// adapter should handle JSON.stringify and JSON.parse conversion for these fields
					if (provider === "sqlite" || provider === "mysql") {
						return isOptional ? "String?" : "String";
					}
					return "String[]";
				}
				if (type === "number[]") {
					// SQLite and MySQL don't support array of numbers, so we use int instead
					// adapter should handle JSON.stringify and JSON.parse conversion for these fields
					if (provider === "sqlite" || provider === "mysql") {
						return "String";
					}
					return "Int[]";
				}
			}
			function getFieldTypeParts(type: string) {
				const isArray = type.endsWith("[]");
				const typeWithoutArray = isArray ? type.slice(0, -2) : type;
				const isOptional = typeWithoutArray.endsWith("?");
				const fieldType = isOptional
					? typeWithoutArray.slice(0, -1)
					: typeWithoutArray;
				return { fieldType, isArray, isOptional };
			}

			const prismaModel = builder.findByType("model", {
				name: modelName,
			});

			if (!prismaModel) {
				if (provider === "mongodb") {
					// Mongo DB doesn't support auto increment, so just use their normal _id.
					builder
						.model(modelName)
						.field("id", "String")
						.attribute("id")
						.attribute(`map("_id")`);
				} else {
					const useNumberId =
						options.advanced?.database?.generateId === "serial";
					const useUUIDs = options.advanced?.database?.generateId === "uuid";
					if (useNumberId) {
						builder
							.model(modelName)
							.field("id", "Int")
							.attribute("id")
							.attribute("default(autoincrement())");
					} else if (useUUIDs && provider === "postgresql") {
						builder
							.model(modelName)
							.field("id", "String")
							.attribute("id")
							.attribute(`default(dbgenerated(${UUID_DEFAULT}))`)
							.attribute("db.Uuid");
					} else {
						builder.model(modelName).field("id", "String").attribute("id");
					}
				}
			} else if (
				provider === "postgresql" &&
				options.advanced?.database?.generateId === "uuid"
			) {
				// Schemas written by earlier CLI versions carry the qualified
				// default, so they keep drifting until it is rewritten too. Only
				// the `String @id @db.Uuid` field those versions wrote is touched.
				const idField = builder.findByType("field", {
					name: "id",
					within: prismaModel.properties,
				});
				const attributes = idField?.attributes ?? [];
				const isGeneratedUuidId =
					idField?.fieldType === "String" &&
					attributes.some((attribute) => attribute.name === "id") &&
					attributes.some(
						(attribute) =>
							attribute.group === "db" && attribute.name === "Uuid",
					);
				for (const attribute of isGeneratedUuidId ? attributes : []) {
					if (attribute.name !== "default") continue;
					for (const arg of attribute.args ?? []) {
						const value = arg.value;
						if (
							typeof value === "object" &&
							value !== null &&
							"type" in value &&
							value.type === "function" &&
							value.name === "dbgenerated" &&
							value.params?.length === 1 &&
							value.params[0] === LEGACY_UUID_DEFAULT
						) {
							value.params[0] = UUID_DEFAULT;
						}
					}
				}
			}

			for (const [field, attr] of Object.entries(fields ?? {})) {
				const fieldName = attr.fieldName || field;
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				const useNumberId = options.advanced?.database?.generateId === "serial";
				const fieldType =
					field === "id" && useNumberId
						? getType({
								isBigint: false,
								isOptional: false,
								type: "number",
							})
						: getType({
								isBigint: attr?.bigint || false,
								isOptional: attr?.required === false,
								type:
									attr.references?.field === "id"
										? useNumberId
											? "number"
											: "string"
										: attr.type,
							});

				if (prismaModel) {
					const isAlreadyExist = builder.findByType("field", {
						name: fieldName,
						within: prismaModel.properties,
					});
					if (isAlreadyExist) {
						if (fieldType && typeof isAlreadyExist.fieldType === "string") {
							const fieldTypeParts = getFieldTypeParts(fieldType);
							const existingFieldTypeParts = getFieldTypeParts(
								isAlreadyExist.fieldType,
							);
							const isExistingNumericField =
								existingFieldTypeParts.fieldType === "Int" ||
								existingFieldTypeParts.fieldType === "BigInt";
							if (
								isExistingNumericField &&
								(fieldTypeParts.fieldType === "Int" ||
									fieldTypeParts.fieldType === "BigInt")
							) {
								isAlreadyExist.fieldType = fieldTypeParts.fieldType;
								isAlreadyExist.optional =
									fieldTypeParts.isOptional || undefined;
								isAlreadyExist.array = fieldTypeParts.isArray || undefined;
							}
						}
						if (
							provider === "mysql" &&
							(attr.type === "string" || Array.isArray(attr.type)) &&
							typeof isAlreadyExist.fieldType === "string" &&
							getFieldTypeParts(isAlreadyExist.fieldType).fieldType === "String"
						) {
							const tableIndexStringLength = getDatabaseIndexStringLength({
								columnName: fieldName,
								dialect: "mysql",
								fields: fields ?? {},
								indexes: resolvedTableIndexes,
							});
							if (tableIndexStringLength) {
								isAlreadyExist.attributes = isAlreadyExist.attributes?.filter(
									(attribute) => attribute.group !== "db",
								);
								builder
									.model(modelName)
									.field(fieldName)
									.attribute(`db.VarChar(${tableIndexStringLength})`);
							}
						}
						continue;
					}
				}
				if (!fieldType) {
					throw new Error(
						`Unsupported Prisma field type for model "${modelName}", field "${fieldName}"${
							attr.type ? ` (source type: "${attr.type}")` : ""
						}.`,
					);
				}
				const fieldBuilder = builder
					.model(modelName)
					.field(fieldName, fieldType);
				if (field === "id") {
					fieldBuilder.attribute("id");
					if (provider === "mongodb") {
						fieldBuilder.attribute(`map("_id")`);
					}
				}

				if (attr.unique) {
					builder.model(modelName).blockAttribute(`unique([${fieldName}])`);
				}

				if (attr.defaultValue !== undefined) {
					if (Array.isArray(attr.defaultValue)) {
						// for json objects and array of object

						if (attr.type === "json") {
							if (
								Object.prototype.toString.call(attr.defaultValue[0]) ===
								"[object Object]"
							) {
								fieldBuilder.attribute(
									`default("${JSON.stringify(attr.defaultValue).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`,
								);
								continue;
							}
							const jsonArray = [];
							for (const value of attr.defaultValue) jsonArray.push(value);
							fieldBuilder.attribute(
								`default("${JSON.stringify(jsonArray).replace(/"/g, '\\"')}")`,
							);
							continue;
						}

						if (attr.defaultValue.length === 0) {
							fieldBuilder.attribute(`default([])`);
							continue;
						} else if (
							typeof attr.defaultValue[0] === "string" &&
							attr.type === "string[]"
						) {
							const valueArray = [];
							for (const value of attr.defaultValue)
								valueArray.push(JSON.stringify(value));
							fieldBuilder.attribute(`default([${valueArray}])`);
						} else if (typeof attr.defaultValue[0] === "number") {
							const valueArray = [];
							for (const value of attr.defaultValue)
								valueArray.push(`${value}`);
							fieldBuilder.attribute(`default([${valueArray}])`);
						}
					}
					// for json objects
					else if (
						typeof attr.defaultValue === "object" &&
						!Array.isArray(attr.defaultValue) &&
						attr.defaultValue !== null
					) {
						if (
							Object.entries(attr.defaultValue as Record<string, any>)
								.length === 0
						) {
							fieldBuilder.attribute(`default("{}")`);
							continue;
						}
						fieldBuilder.attribute(
							`default("${JSON.stringify(attr.defaultValue).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`,
						);
					}
					if (field === "createdAt") {
						fieldBuilder.attribute("default(now())");
					} else if (
						typeof attr.defaultValue === "string" &&
						provider !== "mysql"
					) {
						fieldBuilder.attribute(`default("${attr.defaultValue}")`);
					} else if (
						typeof attr.defaultValue === "boolean" ||
						typeof attr.defaultValue === "number"
					) {
						fieldBuilder.attribute(`default(${attr.defaultValue})`);
					} else if (typeof attr.defaultValue === "function") {
						// we are intentionally not adding the default value here
						// this is because if the defaultValue is a function, it could have
						// custom logic within that function that might not work in prisma's context.
					}
				}

				// This is a special handling for updatedAt fields
				if (field === "updatedAt" && attr.onUpdate) {
					fieldBuilder.attribute("updatedAt");
				} else if (attr.onUpdate) {
					// we are intentionally not adding the onUpdate value here
					// this is because if the onUpdate is a function, it could have
					// custom logic within that function that might not work in prisma's context.
				}

				if (attr.references) {
					const referencedOriginalModelName = getModelName(
						attr.references.model,
					);
					if (
						isMigrationDisabled(referencedOriginalModelName) ||
						isMigrationDisabled(attr.references.model)
					) {
						continue;
					}
					if (
						useUUIDs &&
						provider === "postgresql" &&
						attr.references?.field === "id"
					) {
						builder.model(modelName).field(fieldName).attribute(`db.Uuid`);
					}

					const referencedCustomModelName =
						tables[referencedOriginalModelName]?.modelName ||
						referencedOriginalModelName;
					let action = "Cascade";
					if (attr.references.onDelete === "no action") action = "NoAction";
					else if (attr.references.onDelete === "set null") action = "SetNull";
					else if (attr.references.onDelete === "set default")
						action = "SetDefault";
					else if (attr.references.onDelete === "restrict") action = "Restrict";

					const relationField = `relation(fields: [${getFieldName({ model: originalTableName, field: fieldName })}], references: [${getFieldName({ model: attr.references.model, field: attr.references.field })}], onDelete: ${action})`;
					builder
						.model(modelName)
						.field(
							referencedCustomModelName.toLowerCase(),
							`${capitalizeFirstLetter(referencedCustomModelName)}${
								attr.required === false ? "?" : ""
							}`,
						)
						.attribute(relationField);
				}
				if (
					provider === "mysql" &&
					(attr.type === "string" || Array.isArray(attr.type))
				) {
					const tableIndexStringLength = getDatabaseIndexStringLength({
						columnName: fieldName,
						dialect: "mysql",
						fields: fields ?? {},
						indexes: resolvedTableIndexes,
					});
					const nativeType = tableIndexStringLength
						? `db.VarChar(${tableIndexStringLength})`
						: !attr.unique && !attr.references
							? "db.Text"
							: undefined;
					if (nativeType) {
						builder.model(modelName).field(fieldName).attribute(nativeType);
					}
				}
			}

			for (const tableIndex of resolvedTableIndexes) {
				const attributeName = tableIndex.unique ? "unique" : "index";
				const existingIndexes =
					prismaModel?.properties
						.map(getPrismaIndexDefinition)
						.filter(
							(index): index is PrismaIndexDefinition => index !== undefined,
						) ?? [];
				const existingMappedIndex = existingIndexes.find(
					(index) =>
						index.mappedName !== undefined &&
						getPortableDatabaseIdentifierKey(index.mappedName) ===
							getPortableDatabaseIdentifierKey(tableIndex.name),
				);
				if (existingMappedIndex) {
					if (!prismaIndexMatches(existingMappedIndex, tableIndex)) {
						throw new BetterAuthError(
							`Prisma index "${tableIndex.name}" on model "${modelName}" does not match the configured fields and uniqueness. Rename or replace the existing index, then generate the schema again.`,
						);
					}
					continue;
				}
				const existingUnmappedIndex = existingIndexes.find(
					(index) =>
						index.mappedName === undefined &&
						prismaIndexMatches(index, tableIndex),
				);
				if (existingUnmappedIndex) {
					existingUnmappedIndex.setMappedName(tableIndex.name);
					continue;
				}
				builder
					.model(modelName)
					.blockAttribute(
						`${attributeName}([${tableIndex.columns.join(", ")}], map: ${JSON.stringify(tableIndex.name)})`,
					);
			}

			// Add many-to-many fields
			if (manyToManyRelations.has(modelName)) {
				for (const relatedModel of manyToManyRelations.get(modelName)) {
					// Find the FK field on the related model that points to this model
					const relatedTableName = Object.keys(tables).find(
						(key) =>
							capitalizeFirstLetter(
								getModelName(tables[key]?.modelName || key),
							) === relatedModel,
					);
					const relatedFields = relatedTableName
						? tables[relatedTableName]?.fields
						: {};
					const fkField = Object.entries(relatedFields || {}).find(
						([_fieldName, fieldAttr]: any) =>
							fieldAttr.references &&
							getModelName(fieldAttr.references.model) ===
								getModelName(originalTableName),
					);
					const [fkFieldKey, fkFieldAttr] = fkField || [];
					const isUnique = fkFieldAttr?.unique === true;

					const fieldName =
						isUnique || adapter.options?.usePlural === true
							? `${relatedModel.toLowerCase()}`
							: `${relatedModel.toLowerCase()}s`;
					const existingField = builder.findByType("field", {
						name: fieldName,
						within: prismaModel?.properties,
					});
					// Users may name the back-relation anything, so pair it by relation
					// name with the field that stores this foreign key. A missing one
					// takes that relation name, or Prisma cannot pair the two sides.
					const foreignKey = fkFieldAttr?.fieldName || fkFieldKey;
					const relationsToThisModel = readRelations(
						builder.findByType("model", { name: relatedModel }),
					).filter(
						(relation) =>
							relation.type === modelName &&
							relation.fields.some((field) => field === foreignKey),
					);
					const singleColumnRelations = relationsToThisModel.filter(
						(relation) => relation.fields.length === 1,
					);
					const candidateNames = (
						singleColumnRelations.length
							? singleColumnRelations
							: relationsToThisModel
					).map((relation) => relation.name);
					const backRelationNames = readRelations(prismaModel)
						.filter(
							(relation) =>
								relation.type === relatedModel && relation.fields.length === 0,
						)
						.map((relation) => relation.name);
					const unpairedNames = (
						candidateNames.length ? candidateNames : [undefined]
					).filter((name) => !backRelationNames.includes(name));
					if (unpairedNames.length > 1) {
						throw new BetterAuthError(
							`Model "${relatedModel}" has several relations to "${modelName}" through "${foreignKey}" without a back-relation: ${unpairedNames.map((name) => name ?? "an unnamed relation").join(", ")}. Add the back-relations to "${modelName}", then generate the schema again.`,
						);
					}
					const relationName = unpairedNames[0];
					if (existingField && unpairedNames.length === 1) {
						throw new BetterAuthError(
							`Model "${modelName}" needs a back-relation for ${relationName ?? "the unnamed relation"} from "${relatedModel}", but its field "${fieldName}" is already taken. Add the back-relation to "${modelName}" under another field name, then generate the schema again.`,
						);
					}
					if (unpairedNames.length === 1) {
						const backRelation = builder
							.model(modelName)
							.field(fieldName, `${relatedModel}${isUnique ? "?" : "[]"}`);
						if (relationName !== undefined) {
							// The parsed name is the quoted literal from the schema.
							backRelation.attribute(`relation(${relationName})`);
						}
					}
				}
			}

			// Add indexes
			const indexedFieldsForModel = indexedFields.get(modelName);
			if (indexedFieldsForModel && indexedFieldsForModel.length > 0) {
				for (const fieldName of indexedFieldsForModel) {
					if (prismaModel) {
						const indexExist = prismaModel.properties.some(
							(v) =>
								v.type === "attribute" &&
								v.name === "index" &&
								JSON.stringify(v.args[0]?.value).includes(fieldName),
						);
						if (indexExist) {
							continue;
						}
					}
					const field = Object.entries(fields!).find(
						([key, attr]) => (attr.fieldName || key) === fieldName,
					)?.[1];

					let indexField = fieldName;
					if (provider === "mysql" && field && field.type === "string") {
						const useNumberId =
							options.advanced?.database?.generateId === "serial";
						const useUUIDs = options.advanced?.database?.generateId === "uuid";
						if (field.references?.field === "id" && (useNumberId || useUUIDs)) {
							indexField = `${fieldName}`;
						} else {
							indexField = `${fieldName}(length: 191)`; // length of 191 because String in Prisma is varchar(191)
						}
					}

					builder.model(modelName).blockAttribute(`index([${indexField}])`);
				}
			}

			const hasAttribute = builder.findByType("attribute", {
				name: "map",
				within: prismaModel?.properties,
			});
			const hasChanged = customModelName !== originalTableName;
			if (!hasAttribute) {
				builder
					.model(modelName)
					.blockAttribute(
						"map",
						`${getModelName(hasChanged ? customModelName : originalTableName)}`,
					);
			}
		}
	});

	const schemaChanged = schema.trim() !== schemaPrisma.trim();

	// Columns the existing schema requires that Better Auth never writes. The
	// generated code keeps them, so the user has to relax them by hand.
	const schemaProblems = schemaPrismaExist
		? diffSchema(expectedModels, introspectPrismaSchema(schemaPrisma))
				.filter((finding) => finding.kind === "unexpected-required-column")
				.map((finding) => formatSchemaFinding(finding, "prisma"))
		: [];

	return {
		code: schemaChanged ? schema : "",
		fileName: filePath,
		overwrite: schemaPrismaExist && schemaChanged,
		schemaProblems,
	};
};

const getNewPrisma = (provider: string, cwd?: string) => {
	const prismaVersion = getPrismaVersion(cwd);
	const isV7 = prismaVersion && prismaVersion >= 7;
	// Use "prisma-client" for Prisma v7+, otherwise use "prisma-client-js"
	const clientProvider = isV7 ? "prisma-client" : "prisma-client-js";

	// In Prisma v7+, the url is configured in prisma.config.ts instead of the schema
	if (isV7) {
		return `generator client {
    provider = "${clientProvider}"
  }

  datasource db {
    provider = "${provider}"
  }`;
	}

	return `generator client {
    provider = "${clientProvider}"
  }

  datasource db {
    provider = "${provider}"
    url      = ${
			provider === "sqlite" ? `"file:./dev.db"` : `env("DATABASE_URL")`
		}
  }`;
};
