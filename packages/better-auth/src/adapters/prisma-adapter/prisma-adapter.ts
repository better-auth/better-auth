import { getAuthTables } from "../../db";
import { BetterAuthError } from "../../error";
import type { Adapter, BetterAuthOptions, Where } from "../../types";
import { generateId } from "../../utils";
import { withApplyDefault } from "../utils";

export interface PrismaConfig {
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

	function operatorToPrismaOperator(
		operator: Exclude<Where["operator"], "eq" | undefined>,
	): string {
		switch (operator) {
			case "ne":
				return "not";
			// lt, lte, gt, gte, in, contains operators have same name
			case "lt":
			case "lte":
			case "gt":
			case "gte":
			case "in":
			case "contains":
				return operator;
			case "starts_with":
				return "startsWith";
			case "ends_with":
				return "endsWith";
			default:
				// throw an error if unknown operator is provided
				throw new BetterAuthError(
					`[# Prisma Adapter]: Unsupported operator: ${operator}`,
				);
		}
	}

	function getModelName(model: string) {
		return schema[model].modelName;
	}

	const useDatabaseGeneratedId = options?.advanced?.generateId === false;
	return {
		transformInput(
			data: Record<string, any>,
			model: string,
			action: "create" | "update",
		) {
			const transformedData: Record<string, any> =
				useDatabaseGeneratedId || action === "update"
					? {}
					: {
							id: options.advanced?.generateId
								? options.advanced.generateId({
										model,
									})
								: data.id || generateId(),
						};
			const fields = schema[model].fields;
			for (const field in fields) {
				const value = data[field];
				if (
					value === undefined &&
					(!fields[field].defaultValue || action === "update")
				) {
					continue;
				}
				transformedData[fields[field].fieldName || field] = withApplyDefault(
					value,
					fields[field],
					action,
				);
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
			if (!where || !where.length) return {};
			// Map each where condition to a prisma query condition
			const conditions = where.map((w) => ({
				condition: {
					[getField(model, w.field)]:
						w.operator === "eq" || !w.operator
							? w.value
							: {
									[operatorToPrismaOperator(w.operator)]:
										// If the operator is "in" and the value is not an array, wrap it in an array
										w.operator === "in" && !Array.isArray(w.value)
											? [w.value]
											: w.value,
								},
				},
				connector: w.connector,
			}));
			// If there is only one condition, return it as a single clause
			if (conditions.length === 1) {
				return conditions[0].condition;
			}
			// Separate the conditions into "AND" and "OR" connector clauses
			const andClause = conditions
				.filter((c) => c.connector === "AND" || !c.connector)
				.map((c) => c.condition);
			const orClause = conditions
				.filter((c) => c.connector === "OR")
				.map((c) => c.condition);

			return {
				...(andClause.length ? { AND: andClause } : {}),
				...(orClause.length ? { OR: orClause } : {}),
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
		function checkModelExistsOrThrow(model: string): void {
			if (!db[getModelName(model)]) {
				throw new BetterAuthError(
					`[# Prisma Adapter]: Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
				);
			}
		}
		return {
			id: "prisma",
			async create(data) {
				const { model, data: values, select } = data;
				const transformed = transformInput(values, model, "create");
				checkModelExistsOrThrow(model);
				const result = await db[getModelName(model)].create({
					data: transformed,
					select: convertSelect(select, model),
				});
				return transformOutput(result, model, select);
			},
			async findOne(data) {
				const { model, where, select } = data;
				const whereClause = convertWhereClause(model, where);
				checkModelExistsOrThrow(model);
				const result = await db[getModelName(model)].findFirst({
					where: whereClause,
					select: convertSelect(select, model),
				});
				return transformOutput(result, model, select);
			},
			async findMany(data) {
				const { model, where, limit, offset, sortBy } = data;
				const whereClause = convertWhereClause(model, where);
				checkModelExistsOrThrow(model);

				const result = (await db[getModelName(model)].findMany({
					where: whereClause,
					take: limit || 100,
					skip: offset || 0,
					...(sortBy?.field
						? {
								orderBy: {
									[getField(model, sortBy.field)]:
										sortBy.direction === "desc" ? "desc" : "asc",
								},
							}
						: {}),
				})) as any[];
				return result.map((r) => transformOutput(r, model));
			},
			async count(data) {
				const { model, where } = data;
				const whereClause = convertWhereClause(model, where);
				checkModelExistsOrThrow(model);
				const result = await db[getModelName(model)].count({
					where: whereClause,
				});
				return result;
			},
			async update(data) {
				const { model, where, update } = data;
				checkModelExistsOrThrow(model);
				const whereClause = convertWhereClause(model, where);
				const transformed = transformInput(update, model, "update");
				const result = await db[getModelName(model)].update({
					where: whereClause,
					data: transformed,
				});
				return transformOutput(result, model);
			},
			async updateMany(data) {
				const { model, where, update } = data;
				checkModelExistsOrThrow(model);
				const whereClause = convertWhereClause(model, where);
				const transformed = transformInput(update, model, "update");
				const result = await db[getModelName(model)].updateMany({
					where: whereClause,
					data: transformed,
				});
				return result ? (result.count as number) : 0;
			},
			async delete(data) {
				const { model, where } = data;
				checkModelExistsOrThrow(model);
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
				checkModelExistsOrThrow(model);
				const whereClause = convertWhereClause(model, where);
				const result = await db[getModelName(model)].deleteMany({
					where: whereClause,
				});
				return result ? (result.count as number) : 0;
			},
			options: config,
		} satisfies Adapter;
	};
