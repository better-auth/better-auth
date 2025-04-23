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

	// Create a map to store many-to-many relationships
	const manyToManyRelations = new Map();

	// First pass: identify many-to-many relationships
	for (const table in tables) {
		const fields = tables[table]?.fields;
		for (const field in fields) {
			const attr = fields[field]!;
			if (attr.references) {
				const referencedModel = capitalizeFirstLetter(attr.references.model);
				if (!manyToManyRelations.has(referencedModel)) {
					manyToManyRelations.set(referencedModel, new Set());
				}
				manyToManyRelations
					.get(referencedModel)
					.add(capitalizeFirstLetter(table));
			}
		}
	}

	const schema = produceSchema(schemaPrisma, (builder) => {
		for (const table in tables) {
			const fields = tables[table]?.fields;
			const originalTable = tables[table]?.modelName;
			const modelName = capitalizeFirstLetter(originalTable || "");

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

				if (prismaModel) {
					const isAlreadyExist = builder.findByType("field", {
						name: field,
						within: prismaModel.properties,
					});
					if (isAlreadyExist) {
						continue;
					}
				}

				builder.model(modelName).field(
					field,
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
				if (attr.unique) {
					builder.model(modelName).blockAttribute(`unique([${field}])`);
				}
				if (attr.references) {
					let action = "Cascade";
					if (attr.references.onDelete === "no action") action = "NoAction";
					else if (attr.references.onDelete === "set null") action = "SetNull";
					else if (attr.references.onDelete === "set default")
						action = "SetDefault";
					else if (attr.references.onDelete === "restrict") action = "Restrict";
					builder
						.model(modelName)
						.field(
							`${attr.references.model.toLowerCase()}`,
							capitalizeFirstLetter(attr.references.model),
						)
						.attribute(
							`relation(fields: [${field}], references: [${attr.references.field}], onDelete: ${action})`,
						);
				}
				if (
					!attr.unique &&
					!attr.references &&
					provider === "mysql" &&
					attr.type === "string"
				) {
					builder.model(modelName).field(field).attribute("db.Text");
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
			if (originalTable !== modelName && !hasAttribute) {
				builder.model(modelName).blockAttribute("map", originalTable);
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
