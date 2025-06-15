import { getAuthTables, type FieldType } from "better-auth/db";
import { produceSchema } from "@mrleebo/prisma-ast";
import { existsSync } from "fs";
import path from "path";
import fs from "fs/promises";
import { capitalizeFirstLetter } from "better-auth";
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
	let schemaPrisma = "";
	if (schemaPrismaExist) {
		schemaPrisma = await fs.readFile(
			path.join(process.cwd(), filePath),
			"utf-8",
		);
	} else {
		schemaPrisma = getNewPrisma(provider);
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
					referencedCustomModel,
				);

				if (!manyToManyRelations.has(referencedModelNameCap)) {
					manyToManyRelations.set(referencedModelNameCap, new Set());
				}

				const currentCustomModel = tables[table]?.modelName || table;
				const currentModelNameCap = capitalizeFirstLetter(currentCustomModel);

				manyToManyRelations
					.get(referencedModelNameCap)
					.add(currentModelNameCap);
			}
		}
	}

	const schema = produceSchema(schemaPrisma, (builder) => {
		for (const table in tables) {
			const originalTableName = table;
			const customModelName = tables[table]?.modelName || table;
			const modelName = capitalizeFirstLetter(customModelName);
			const fields = tables[table]?.fields;
			function getType({
				isBigint,
				isOptional,
				type,
			}: { type: FieldType; isOptional: boolean; isBigint: boolean }) {
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
					if (options.advanced?.database?.useNumberId) {
						builder
							.model(modelName)
							.field("id", "Int")
							.attribute("id")
							.attribute("default(autoincrement())");
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

				const fieldBuilder = builder.model(modelName).field(
					fieldName,
					field === "id" && options.advanced?.database?.useNumberId
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
										? options.advanced?.database?.useNumberId
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
				} else if (fieldName !== field) {
					fieldBuilder.attribute(`map("${field}")`);
				}

				if (attr.unique) {
					builder.model(modelName).blockAttribute(`unique([${fieldName}])`);
				}
				if (attr.references) {
					const referencedOriginalModelName = attr.references.model;
					const referencedCustomModelName =
						tables[referencedOriginalModelName]?.modelName ||
						referencedOriginalModelName;
					let action = "Cascade";
					if (attr.references.onDelete === "no action") action = "NoAction";
					else if (attr.references.onDelete === "set null") action = "SetNull";
					else if (attr.references.onDelete === "set default")
						action = "SetDefault";
					else if (attr.references.onDelete === "restrict") action = "Restrict";
					builder
						.model(modelName)
						.field(
							`${referencedCustomModelName.toLowerCase()}`,
							capitalizeFirstLetter(referencedCustomModelName),
						)
						.attribute(
							`relation(fields: [${fieldName}], references: [${attr.references.field}], onDelete: ${action})`,
						);
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
					const fieldName = `${relatedModel.toLowerCase()}s`;
					const existingField = builder.findByType("field", {
						name: fieldName,
						within: prismaModel?.properties,
					});
					if (!existingField) {
						builder.model(modelName).field(fieldName, `${relatedModel}[]`);
					}
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
						`${hasChanged ? customModelName : originalTableName}`,
					);
			}
		}
	});

	return {
		code: schema.trim() === schemaPrisma.trim() ? "" : schema,
		fileName: filePath,
		overwrite: true,
	};
};

const getNewPrisma = (provider: string) => `generator client {
    provider = "prisma-client-js"
  }
  
  datasource db {
    provider = "${provider}"
    url      = ${
			provider === "sqlite" ? `"file:./dev.db"` : `env("DATABASE_URL")`
		}
  }`;
