import { existsSync } from "fs";
import path from "path";
import type { FieldType } from "../../db";
import { getAuthTables } from "../../db/get-tables";
import type { Adapter, Where } from "../../types";
import fs from "fs/promises";
import { produceSchema } from "@mrleebo/prisma-ast";
import { capitalizeFirstLetter } from "../../utils";

function whereConvertor(where?: Where[]) {
	if (!where) return {};
	if (where.length === 1) {
		const w = where[0];
		if (!w) {
			return;
		}
		return {
			[w.field]: w.value,
		};
	}
	const and = where.filter((w) => w.connector === "AND" || !w.connector);
	const or = where.filter((w) => w.connector === "OR");
	const andClause = and.map((w) => {
		return {
			[w.field]:
				w.operator === "eq" || !w.operator
					? w.value
					: {
							[w.operator]: w.value,
						},
		};
	});
	const orClause = or.map((w) => {
		return {
			[w.field]: {
				[w.operator || "eq"]: w.value,
			},
		};
	});

	return {
		AND: andClause.length ? andClause : undefined,
		OR: orClause.length ? orClause : undefined,
	};
}

interface PrismaClient {
	[model: string]: {
		create: (data: any) => Promise<any>;
		findFirst: (data: any) => Promise<any>;
		findMany: (data: any) => Promise<any>;
		update: (data: any) => Promise<any>;
		delete: (data: any) => Promise<any>;
		[key: string]: any;
	};
}

export const prismaAdapter = (
	prisma: any,
	{
		provider,
	}: {
		provider: "sqlite" | "cockroachdb" | "mysql" | "postgresql" | "sqlserver";
	},
): Adapter => {
	const db: PrismaClient = prisma;
	return {
		id: "prisma",
		async create(data) {
			const { model, data: val, select } = data;

			return await db[model].create({
				data: val,
				...(select?.length
					? {
							select: select.reduce((prev, cur) => {
								return {
									...prev,
									[cur]: true,
								};
							}, {}),
						}
					: {}),
			});
		},
		async findOne(data) {
			const { model, where, select } = data;
			const whereClause = whereConvertor(where);

			return await db[model].findFirst({
				where: whereClause,
				...(select?.length
					? {
							select: select.reduce((prev, cur) => {
								return {
									...prev,
									[cur]: true,
								};
							}, {}),
						}
					: {}),
			});
		},
		async findMany(data) {
			const { model, where } = data;
			const whereClause = whereConvertor(where);

			return await db[model].findMany({ where: whereClause });
		},
		async update(data) {
			const { model, where, update } = data;
			const whereClause = whereConvertor(where);

			return await db[model].update({
				where: whereClause,
				data: update,
			});
		},
		async delete(data) {
			const { model, where } = data;
			const whereClause = whereConvertor(where);

			return await db[model].delete({ where: whereClause });
		},
		async createSchema(options, file) {
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
					const fields = tables[table].fields;
					const originalTable = tables[table].tableName;
					const tableName = capitalizeFirstLetter(originalTable);
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
					}
					const prismaModel = builder.findByType("model", {
						name: tableName,
					});
					!prismaModel &&
						builder.model(tableName).field("id", "String").attribute("id");

					for (const field in fields) {
						const attr = fields[field];

						if (prismaModel) {
							const isAlreadyExist = builder.findByType("field", {
								name: field,
								within: prismaModel.properties,
							});
							console.log(field, "exists");
							if (isAlreadyExist) {
								continue;
							}
						}

						builder
							.model(tableName)
							.field(field, getType(attr.type, !attr.required));
						if (attr.unique) {
							builder.model(tableName).blockAttribute(`unique([${field}])`);
						}
						if (attr.references) {
							builder
								.model(tableName)
								.field(
									`${attr.references.model.toLowerCase()}s`,
									capitalizeFirstLetter(attr.references.model),
								)
								.attribute(
									`relation(fields: [${field}], references: [${attr.references.field}], onDelete: Cascade)`,
								);
						}
					}
					if (originalTable !== tableName) {
						builder.model(tableName).blockAttribute("map", originalTable);
					}
				}
			});
			return {
				code: schema.trim() === schemaPrisma.trim() ? "" : schema,
				fileName: filePath,
			};
		},
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
