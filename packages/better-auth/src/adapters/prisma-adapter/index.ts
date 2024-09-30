import path from "path";
import type { FieldType } from "../../db";
import { getAuthTables } from "../../db/get-tables";
import type { Adapter, Where } from "../../types";
import fs from "fs/promises";

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

export const prismaAdapter = ({
	db: prisma,
	provider,
}: {
	db: any;
	provider: "sqlite" | "cockroachdb" | "mysql" | "postgresql" | "sqlserver";
}): Adapter => {
	const db: PrismaClient = prisma;
	return {
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
		async createSchema(options) {
			const tables = getAuthTables(options);
			let code = "";
			for (const table in tables) {
				const fields = tables[table].fields;
				const tableName = tables[table].tableName;
				function getType(type: FieldType) {
					if (type === "string") {
						return "String";
					}
					if (type === "number") {
						return "Int";
					}
					if (type === "boolean") {
						return "Boolean";
					}
					if (type === "date") {
						return "DateTime";
					}
				}
				function getForeginKey(
					field: string,
					reference: { model: string; field: string },
				) {
					return `${reference.model} ${reference.model} @relation(fields: [${field}], references: [${reference.field}])`;
				}
				const schema = `model ${tableName} {
					id String @id 
					${Object.entries(fields)
						.map(([key, value]) => {
							return `${key} ${getType(value.type)}${
								value.required === false ? "?" : ""
							}${value.unique ? " @unique" : ""}${
								value.references
									? `\n${getForeginKey(key, value.references!)}`
									: ""
							}`;
						})
						.join("\n")}
				}`;
				code += `${schema}\n`;
			}
			return {
				code,
				fileName: "./prisma/schema/auth.prisma",
			};
		},
	};
};
