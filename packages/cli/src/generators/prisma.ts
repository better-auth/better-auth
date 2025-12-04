import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { capitalizeFirstLetter } from "@better-auth/core/utils";
import { produceSchema } from "@mrleebo/prisma-ast";
import { initGetFieldName, initGetModelName } from "better-auth/adapters";
import type { FieldType } from "better-auth/db";
import { getAuthTables } from "better-auth/db";
import { getPrismaVersion } from "../utils/get-package-info";
import type { SchemaGenerator } from "./types";

export const generatePrismaSchema: SchemaGenerator = async ({
	adapter,
	options,
	file,
}) => {
	const provider = adapter.options?.provider || "postgresql";
	const tables = getAuthTables(options);
	const filePath = file || "./prisma/schema.prisma";
	const schemaPrismaExist = existsSync(path.join(process.cwd(), filePath));

	const getModelName = initGetModelName({
		schema: getAuthTables(options),
		usePlural: adapter.options?.adapterConfig?.usePlural,
	});
	const getFieldName = initGetFieldName({
		schema: getAuthTables(options),
		usePlural: false,
	});

	let schemaPrisma = "";
	if (schemaPrismaExist) {
		schemaPrisma = await fs.readFile(
			path.join(process.cwd(), filePath),
			"utf-8",
		);
	} else {
		schemaPrisma = getNewPrisma(provider, process.cwd());
	}

	// Update generator block for Prisma v7+ in existing schemas
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
		});
	}

	const manyToManyRelations = new Map();

	for (const table in tables) {
		const fields = tables[table]?.fields;
		for (const field in fields) {
			const attr = fields[field]!;
			if (attr.references) {
				const referencedOriginalModel = attr.references.model;
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

		for (const field in fields) {
			const attr = fields[field]!;
			if (attr.index && !attr.unique) {
				const fieldName = attr.fieldName || field;
				indexedFields.get(modelName)!.push(fieldName);
			}
		}
	}

	const schema = produceSchema(schemaPrisma, (builder) => {
		for (const table in tables) {
			const originalTableName = table;
			const customModelName = tables[table]?.modelName || table;
			const modelName = capitalizeFirstLetter(getModelName(customModelName));
			const fields = tables[table]?.fields;
			function getType({
				isBigint,
				isOptional,
				type,
			}: {
				type: FieldType;
				isOptional: boolean;
				isBigint: boolean;
			}) {
				if (type === "string") {
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
					return isOptional ? "Json?" : "Json";
				}
				if (type === "string[]") {
					return isOptional ? "String[]" : "String[]";
				}
				if (type === "number[]") {
					return isOptional ? "Int[]" : "Int[]";
				}
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
						options.advanced?.database?.useNumberId ||
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
							.attribute('default(dbgenerated("pg_catalog.gen_random_uuid()"))')
							.attribute("db.Uuid");
					} else {
						builder.model(modelName).field("id", "String").attribute("id");
					}
				}
			}

			for (const field in fields) {
				const attr = fields[field]!;
				const fieldName = attr.fieldName || field;

				if (prismaModel) {
					const isAlreadyExist = builder.findByType("field", {
						name: fieldName,
						within: prismaModel.properties,
					});
					if (isAlreadyExist) {
						continue;
					}
				}
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				const useNumberId =
					options.advanced?.database?.useNumberId ||
					options.advanced?.database?.generateId === "serial";
				const fieldBuilder = builder.model(modelName).field(
					fieldName,
					field === "id" && useNumberId
						? getType({
								isBigint: false,
								isOptional: false,
								type: "number",
							})
						: getType({
								isBigint: attr?.bigint || false,
								isOptional: !attr?.required,
								type:
									attr.references?.field === "id"
										? useNumberId
											? "number"
											: "string"
										: attr.type,
							}),
				);
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
							let jsonArray = [];
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
							let valueArray = [];
							for (const value of attr.defaultValue)
								valueArray.push(JSON.stringify(value));
							fieldBuilder.attribute(`default([${valueArray}])`);
						} else if (typeof attr.defaultValue[0] === "number") {
							let valueArray = [];
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
					if (
						useUUIDs &&
						provider === "postgresql" &&
						attr.references?.field === "id"
					) {
						builder.model(modelName).field(fieldName).attribute(`db.Uuid`);
					}

					const referencedOriginalModelName = getModelName(
						attr.references.model,
					);
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
								!attr.required ? "?" : ""
							}`,
						)
						.attribute(relationField);
				}
				if (
					!attr.unique &&
					!attr.references &&
					provider === "mysql" &&
					attr.type === "string"
				) {
					builder.model(modelName).field(fieldName).attribute("db.Text");
				}
			}

			// Add many-to-many fields
			if (manyToManyRelations.has(modelName)) {
				for (const relatedModel of manyToManyRelations.get(modelName)) {
					// Find the FK field on the related model that points to this model
					const relatedTableName = Object.keys(tables).find(
						(key) =>
							capitalizeFirstLetter(tables[key]?.modelName || key) ===
							relatedModel,
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
					const [_fieldKey, fkFieldAttr] = fkField || [];
					const isUnique = fkFieldAttr?.unique === true;

					const fieldName =
						isUnique || adapter.options?.usePlural === true
							? `${relatedModel.toLowerCase()}`
							: `${relatedModel.toLowerCase()}s`;
					const existingField = builder.findByType("field", {
						name: fieldName,
						within: prismaModel?.properties,
					});
					if (!existingField) {
						builder
							.model(modelName)
							.field(fieldName, `${relatedModel}${isUnique ? "?" : "[]"}`);
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
							options.advanced?.database?.useNumberId ||
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

	return {
		code: schemaChanged ? schema : "",
		fileName: filePath,
		overwrite: schemaPrismaExist && schemaChanged,
	};
};

const getNewPrisma = (provider: string, cwd?: string) => {
	const prismaVersion = getPrismaVersion(cwd);
	// Use "prisma-client" for Prisma v7+, otherwise use "prisma-client-js"
	const clientProvider =
		prismaVersion && prismaVersion >= 7 ? "prisma-client" : "prisma-client-js";

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
