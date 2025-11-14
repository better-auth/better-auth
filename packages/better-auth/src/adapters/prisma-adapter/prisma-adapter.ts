import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBAdapter,
	DBAdapterDebugLogOption,
	Where,
} from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import {
	type AdapterFactoryCustomizeAdapterCreator,
	type AdapterFactoryOptions,
	createAdapterFactory,
} from "../adapter-factory";

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
	debugLogs?: DBAdapterDebugLogOption | undefined;

	/**
	 * Use plural table names
	 *
	 * @default false
	 */
	usePlural?: boolean | undefined;

	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions,
	 * set this to `false` and operations will be executed sequentially.
	 * @default false
	 */
	transaction?: boolean | undefined;
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
		updateMany: (data: any) => Promise<any>;
		delete: (data: any) => Promise<any>;
		[key: string]: any;
	};
};

export const prismaAdapter = (prisma: PrismaClient, config: PrismaConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;
	const createCustomAdapter =
		(prisma: PrismaClient): AdapterFactoryCustomizeAdapterCreator =>
		({ getFieldName }) => {
			const db = prisma as PrismaClientInternal;

			const convertSelect = (
				select?: string[] | undefined,
				model?: string | undefined,
			) => {
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
			const convertWhereClause = (
				model: string,
				where?: Where[] | undefined,
			) => {
				if (!where || !where.length) return {};
				const buildSingleCondition = (w: Where) => {
					const fieldName = getFieldName({ model, field: w.field });
					// Special handling for Prisma null semantics, for non-nullable fields this is a tautology. Skip condition.
					if (w.operator === "ne" && w.value === null) {
						return {};
					}
					if (
						(w.operator === "in" || w.operator === "not_in") &&
						Array.isArray(w.value)
					) {
						const filtered = w.value.filter((v) => v != null);
						if (filtered.length === 0) {
							if (w.operator === "in") {
								return {
									AND: [
										{ [fieldName]: { equals: "__never__" } },
										{ [fieldName]: { not: "__never__" } },
									],
								};
							} else {
								return {};
							}
						}
						const prismaOp = operatorToPrismaOperator(w.operator);
						return { [fieldName]: { [prismaOp]: filtered } };
					}
					if (w.operator === "eq" || !w.operator) {
						return { [fieldName]: w.value };
					}
					if (w.operator === "is_null") {
						return { [fieldName]: null };
					}
					if (w.operator === "is_not_null") {
						return { [fieldName]: { not: null } };
					}
					return {
						[fieldName]: {
							[operatorToPrismaOperator(w.operator)]: w.value,
						},
					};
				};
				if (where.length === 1) {
					const w = where[0]!;
					if (!w) {
						return;
					}
					return buildSingleCondition(w);
				}
				const and = where.filter((w) => w.connector === "AND" || !w.connector);
				const or = where.filter((w) => w.connector === "OR");
				const andClause = and.map((w) => buildSingleCondition(w));
				const orClause = or.map((w) => buildSingleCondition(w));

				return {
					...(andClause.length ? { AND: andClause } : {}),
					...(orClause.length ? { OR: orClause } : {}),
				};
			};

			return {
				async create({ model, data: values, select }) {
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					return await db[model]!.create({
						data: values,
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
					return await db[model]!.findFirst({
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

					return (await db[model]!.findMany({
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
					return await db[model]!.count({
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
					return await db[model]!.update({
						where: whereClause,
						data: update,
					});
				},
				async updateMany({ model, where, update }) {
					const whereClause = convertWhereClause(model, where);
					const result = await db[model]!.updateMany({
						where: whereClause,
						data: update,
					});
					return result ? (result.count as number) : 0;
				},
				async delete({ model, where }) {
					const whereClause = convertWhereClause(model, where);
					try {
						await db[model]!.delete({
							where: whereClause,
						});
					} catch (e: any) {
						// If the record doesn't exist, we don't want to throw an error
						if (e?.meta?.cause === "Record to delete does not exist.") return;
						// otherwise if it's an unknown error, we want to just log it for debugging.
						console.log(e);
					}
				},
				async deleteMany({ model, where }) {
					const whereClause = convertWhereClause(model, where);
					const result = await db[model]!.deleteMany({
						where: whereClause,
					});
					return result ? (result.count as number) : 0;
				},
				options: config,
			};
		};

	let adapterOptions: AdapterFactoryOptions | null = null;
	adapterOptions = {
		config: {
			adapterId: "prisma",
			adapterName: "Prisma Adapter",
			usePlural: config.usePlural ?? false,
			debugLogs: config.debugLogs ?? false,
			supportsUUIDs: config.provider === "postgresql" ? true : false,
			transaction:
				(config.transaction ?? false)
					? (cb) =>
							(prisma as PrismaClientInternal).$transaction((tx) => {
								const adapter = createAdapterFactory({
									config: adapterOptions!.config,
									adapter: createCustomAdapter(tx),
								})(lazyOptions!);
								return cb(adapter);
							})
					: false,
		},
		adapter: createCustomAdapter(prisma),
	};

	const adapter = createAdapterFactory(adapterOptions);
	return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
		lazyOptions = options;
		return adapter(options);
	};
};
