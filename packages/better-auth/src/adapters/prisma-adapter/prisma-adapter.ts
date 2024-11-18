import { getAuthTables } from "../../db";
import type { Adapter, BetterAuthOptions, Where } from "../../types";

interface PrismaConfig {
	/**
	 * Database provider.
	 */
	provider:
		| "sqlite"
		| "cockroachdb"
		| "mysql"
		| "postgresql"
		| "sqlserver"
		| "mongodb";
	/**
	 * Custom generateId function.
	 *
	 * If not provided, nanoid will be used.
	 * If set to false, the database's auto generated id will be used.
	 *
	 * @default nanoid
	 */
	generateId?: ((size?: number) => string) | false;
}

interface PrismaClient {}

interface PrismaClientInternal {
	[model: string]: {
		create: (data: any) => Promise<any>;
		findFirst: (data: any) => Promise<any>;
		findMany: (data: any) => Promise<any>;
		update: (data: any) => Promise<any>;
		delete: (data: any) => Promise<any>;
		[key: string]: any;
	};
}

const createTransform = (config: PrismaConfig, options: BetterAuthOptions) => {
	const schema = getAuthTables(options);

	function getField(model: string, field: string) {
		if (field === "id") {
			return field;
		}
		const f = schema[model].fields[field];
		return f.fieldName || field;
	}

	function operatorToPrismaOperator(operator: string) {
		switch (operator) {
			case "starts_with":
				return "startsWith";
			case "ends_with":
				return "endsWith";
			default:
				return operator;
		}
	}

	function getModelName(model: string) {
		return schema[model].modelName;
	}
	const shouldGenerateId = config?.generateId !== false;
	return {
		transformInput(data: Record<string, any>, model: string) {
			const transformedData: Record<string, any> =
				data.id && shouldGenerateId
					? {
							id: config?.generateId ? config.generateId() : data.id,
						}
					: {};
			for (const key in data) {
				const field = schema[model].fields[key];
				if (field) {
					transformedData[field.fieldName || key] = data[key];
				}
			}
			return transformedData;
		},
		transformOutput(
			data: Record<string, any>,
			model: string,
			select: string[] = [],
		) {
			if (!data) return null;
			const transformedData: Record<string, any> =
				data.id || data._id
					? select.length === 0 || select.includes("id")
						? {
								id: data.id,
							}
						: {}
					: {};
			const tableSchema = schema[model].fields;
			for (const key in tableSchema) {
				if (select.length && !select.includes(key)) {
					continue;
				}
				const field = tableSchema[key];
				if (field) {
					transformedData[key] = data[field.fieldName || key];
				}
			}
			return transformedData as any;
		},
		convertWhereClause(model: string, where?: Where[]) {
			if (!where) return {};
			if (where.length === 1) {
				const w = where[0];
				if (!w) {
					return;
				}
				return {
					[getField(model, w.field)]:
						w.operator === "eq" || !w.operator
							? w.value
							: {
									[operatorToPrismaOperator(w.operator)]: w.value,
								},
				};
			}
			const and = where.filter((w) => w.connector === "AND" || !w.connector);
			const or = where.filter((w) => w.connector === "OR");
			const andClause = and.map((w) => {
				return {
					[getField(model, w.field)]:
						w.operator === "eq" || !w.operator
							? w.value
							: {
									[operatorToPrismaOperator(w.operator)]: w.value,
								},
				};
			});
			const orClause = or.map((w) => {
				return {
					[getField(model, w.field)]: {
						[w.operator || "eq"]: w.value,
					},
				};
			});

			return {
				AND: andClause.length ? andClause : undefined,
				OR: orClause.length ? orClause : undefined,
			};
		},
		convertSelect: (select?: string[], model?: string) => {
			if (!select || !model) return undefined;
			return select.reduce((prev, cur) => {
				return {
					...prev,
					[getField(model, cur)]: true,
				};
			}, {});
		},
		getModelName,
		getField,
	};
};

export const prismaAdapter =
	(prisma: PrismaClient, config: PrismaConfig) =>
	(options: BetterAuthOptions) => {
		const db = prisma as PrismaClientInternal;
		const {
			transformInput,
			transformOutput,
			convertWhereClause,
			convertSelect,
			getModelName,
			getField,
		} = createTransform(config, options);
		return {
			id: "prisma",
			async create(data) {
				const { model, data: values, select } = data;
				const transformed = transformInput(values, model);
				const result = await db[getModelName(model)].create({
					data: transformed,
					select: convertSelect(select, model),
				});
				return transformOutput(result, model, select);
			},
			async findOne(data) {
				const { model, where, select } = data;
				const whereClause = convertWhereClause(model, where);
				const result = await db[getModelName(model)].findFirst({
					where: whereClause,
					select: convertSelect(select, model),
				});
				return transformOutput(result, model, select);
			},
			async findMany(data) {
				const { model, where, limit, offset, sortBy } = data;
				const whereClause = convertWhereClause(model, where);
				const result = (await db[getModelName(model)].findMany({
					where: whereClause,
					take: limit || 100,
					skip: offset || 0,
					orderBy: sortBy?.field
						? {
								[getField(model, sortBy.field)]:
									sortBy.direction === "desc" ? "desc" : "asc",
							}
						: undefined,
				})) as any[];
				return result.map((r) => transformOutput(r, model));
			},
			async update(data) {
				const { model, where, update } = data;
				const whereClause = convertWhereClause(model, where);
				const transformed = transformInput(update, model);
				const result = await db[getModelName(model)].update({
					where: whereClause,
					data: transformed,
				});
				return transformOutput(result, model);
			},
			async updateMany(data) {
				const { model, where, update } = data;
				const whereClause = convertWhereClause(model, where);
				const transformed = transformInput(update, model);
				const result = await db[getModelName(model)].updateMany({
					where: whereClause,
					data: transformed,
				});
				return result ? (result.count as number) : 0;
			},
			async delete(data) {
				const { model, where } = data;
				const whereClause = convertWhereClause(model, where);
				try {
					await db[getModelName(model)].delete({
						where: whereClause,
					});
				} catch (e) {
					// If the record doesn't exist, we don't want to throw an error
				}
			},
			async deleteMany(data) {
				const { model, where } = data;
				const whereClause = convertWhereClause(model, where);
				const result = await db[getModelName(model)].deleteMany({
					where: whereClause,
				});
				return result ? (result.count as number) : 0;
			},
			options: config,
		} satisfies Adapter;
	};
