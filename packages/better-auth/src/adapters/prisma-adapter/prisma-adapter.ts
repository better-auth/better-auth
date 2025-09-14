import { BetterAuthError } from "../../error";
import type { Adapter, BetterAuthOptions, Where } from "../../types";
import {
	createAdapter,
	type AdapterDebugLogs,
	type CreateAdapterOptions,
	type CreateCustomAdapter,
} from "../create-adapter";

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

	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: AdapterDebugLogs;

	/**
	 * Use plural table names
	 *
	 * @default false
	 */
	usePlural?: boolean;

	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions,
	 * set this to `false` and operations will be executed sequentially.
	 * @default true
	 */
	transaction?: boolean;
}

interface PrismaClient {}

type PrismaClientInternal = {
	$transaction: (
		callback: (db: PrismaClient) => Promise<any> | any,
	) => Promise<any>;
} & {
	[model: string]: {
		create: (data: any) => Promise<any>;
		findFirst: (data: any) => Promise<any>;
		findMany: (data: any) => Promise<any>;
		update: (data: any) => Promise<any>;
		delete: (data: any) => Promise<any>;
		[key: string]: any;
	};
};

export const prismaAdapter = (prisma: PrismaClient, config: PrismaConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;
	const createCustomAdapter =
		(prisma: PrismaClient): CreateCustomAdapter =>
		({ getFieldName }) => {
			const db = prisma as PrismaClientInternal;

			const convertSelect = (select?: string[], model?: string) => {
				if (!select || !model) return undefined;
				return select.reduce((prev, cur) => {
					return {
						...prev,
						[getFieldName({ model, field: cur })]: true,
					};
				}, {});
			};
			function operatorToPrismaOperator(operator: string) {
				switch (operator) {
					case "starts_with":
						return "startsWith";
					case "ends_with":
						return "endsWith";
					case "ne":
						return "not";
					case "not_in":
						return "notIn";
					default:
						return operator;
				}
			}
			const convertWhereClause = (model: string, where?: Where[]) => {
				if (!where) return {};

				const convertValue = (field: string, value: any) => {
					// Convert ID values to numbers when useNumberId is enabled
					if (field === "id" && lazyOptions?.advanced?.database?.useNumberId) {
						if (Array.isArray(value)) {
							return value.map((v) => Number(v));
						}
						return Number(value);
					}
					// Convert userId and other foreign key references to numbers when useNumberId is enabled
					if (
						(field === "userId" || field.endsWith("Id")) &&
						lazyOptions?.advanced?.database?.useNumberId
					) {
						if (Array.isArray(value)) {
							return value.map((v) => Number(v));
						}
						return Number(value);
					}
					return value;
				};

				if (where.length === 1) {
					const w = where[0];
					if (!w) {
						return;
					}
					const fieldName = getFieldName({ model, field: w.field });
					const convertedValue = convertValue(w.field, w.value);
					return {
						[fieldName]:
							w.operator === "eq" || !w.operator
								? convertedValue
								: {
										[operatorToPrismaOperator(w.operator)]: convertedValue,
									},
					};
				}
				const and = where.filter((w) => w.connector === "AND" || !w.connector);
				const or = where.filter((w) => w.connector === "OR");
				const andClause = and.map((w) => {
					const fieldName = getFieldName({ model, field: w.field });
					const convertedValue = convertValue(w.field, w.value);
					return {
						[fieldName]:
							w.operator === "eq" || !w.operator
								? convertedValue
								: {
										[operatorToPrismaOperator(w.operator)]: convertedValue,
									},
					};
				});
				const orClause = or.map((w) => {
					const fieldName = getFieldName({ model, field: w.field });
					const convertedValue = convertValue(w.field, w.value);
					return {
						[fieldName]:
							w.operator === "eq" || !w.operator
								? convertedValue
								: {
										[operatorToPrismaOperator(w.operator)]: convertedValue,
									},
					};
				});

				return {
					...(andClause.length ? { AND: andClause } : {}),
					...(orClause.length ? { OR: orClause } : {}),
				};
			};

			const convertDataValues = (data: any) => {
				if (!lazyOptions?.advanced?.database?.useNumberId) return data;

				const converted = { ...data };
				for (const key in converted) {
					// Convert foreign key IDs to numbers when useNumberId is enabled
					if (
						(key === "userId" || key.endsWith("Id")) &&
						converted[key] !== null &&
						converted[key] !== undefined
					) {
						converted[key] = Number(converted[key]);
					}
				}
				return converted;
			};

			return {
				async create({ model, data: values, select }) {
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					const convertedData = convertDataValues(values);
					return await db[model].create({
						data: convertedData,
						select: convertSelect(select, model),
					});
				},
				async findOne({ model, where, select }) {
					const whereClause = convertWhereClause(model, where);
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					return await db[model].findFirst({
						where: whereClause,
						select: convertSelect(select, model),
					});
				},
				async findMany({ model, where, limit, offset, sortBy }) {
					const whereClause = convertWhereClause(model, where);
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}

					return (await db[model].findMany({
						where: whereClause,
						take: limit || 100,
						skip: offset || 0,
						...(sortBy?.field
							? {
									orderBy: {
										[getFieldName({ model, field: sortBy.field })]:
											sortBy.direction === "desc" ? "desc" : "asc",
									},
								}
							: {}),
					})) as any[];
				},
				async count({ model, where }) {
					const whereClause = convertWhereClause(model, where);
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					return await db[model].count({
						where: whereClause,
					});
				},
				async update({ model, where, update }) {
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					const whereClause = convertWhereClause(model, where);
					const convertedData = convertDataValues(update);
					return await db[model].update({
						where: whereClause,
						data: convertedData,
					});
				},
				async updateMany({ model, where, update }) {
					const whereClause = convertWhereClause(model, where);
					const convertedData = convertDataValues(update);
					const result = await db[model].updateMany({
						where: whereClause,
						data: convertedData,
					});
					return result ? (result.count as number) : 0;
				},
				async delete({ model, where }) {
					const whereClause = convertWhereClause(model, where);
					try {
						await db[model].delete({
							where: whereClause,
						});
					} catch (e) {
						// If the record doesn't exist, we don't want to throw an error
					}
				},
				async deleteMany({ model, where }) {
					const whereClause = convertWhereClause(model, where);
					const result = await db[model].deleteMany({
						where: whereClause,
					});
					return result ? (result.count as number) : 0;
				},
				options: config,
			};
		};

	let adapterOptions: CreateAdapterOptions | null = null;
	adapterOptions = {
		config: {
			adapterId: "prisma",
			adapterName: "Prisma Adapter",
			usePlural: config.usePlural ?? false,
			debugLogs: config.debugLogs ?? false,
			transaction:
				(config.transaction ?? true)
					? (cb) =>
							(prisma as PrismaClientInternal).$transaction((tx) => {
								const adapter = createAdapter({
									config: adapterOptions!.config,
									adapter: createCustomAdapter(tx),
								})(lazyOptions!);
								return cb(adapter);
							})
					: false,
		},
		adapter: createCustomAdapter(prisma),
	};

	const adapter = createAdapter(adapterOptions);
	return (options: BetterAuthOptions): Adapter => {
		lazyOptions = options;
		return adapter(options);
	};
};
