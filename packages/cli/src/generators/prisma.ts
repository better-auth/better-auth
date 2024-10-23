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

	const schema = produceSchema(schemaPrisma, (builder) => {
		for (const table in tables) {
			const fields = tables[table]?.fields;
			const originalTable = tables[table]?.tableName;
			const tableName = capitalizeFirstLetter(originalTable || "");
			function getType(type: FieldType, isOptional: boolean) {
				if (type === "string") {
					return isOptional ? "String?" : "String";
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
				name: tableName,
			});
			if (!prismaModel) {
				if (provider === "mongodb") {
					builder
						.model(tableName)
						.field("id", "String")
						.attribute("id")
						.attribute(`map("_id")`);
				} else {
					builder.model(tableName).field("id", "String").attribute("id");
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

				builder
					.model(tableName)
					.field(field, getType(attr.type, !attr?.required));
				if (attr.unique) {
					builder.model(tableName).blockAttribute(`unique([${field}])`);
				}
				if (attr.references) {
					builder
						.model(tableName)
						.field(
							`${attr.references.model.toLowerCase()}`,
							capitalizeFirstLetter(attr.references.model),
						)
						.attribute(
							`relation(fields: [${field}], references: [${attr.references.field}], onDelete: Cascade)`,
						);
				}
			}
			const hasAttribute = builder.findByType("attribute", {
				name: "map",
				within: prismaModel?.properties,
			});
			if (originalTable !== tableName && !hasAttribute) {
				builder.model(tableName).blockAttribute("map", originalTable);
			}
		}
	});
	return {
		code: schema.trim() === schemaPrisma.trim() ? "" : schema,
		fileName: filePath,
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
