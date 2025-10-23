import { BetterAuthError } from "@better-auth/core/error";
import type { BetterAuthOptions } from "@better-auth/core";
import {
	createAdapterFactory,
	type AdapterFactoryOptions,
	type AdapterFactoryCustomizeAdapterCreator,
} from "../adapter-factory";
import type {
	DBAdapterDebugLogOption,
	DBAdapter,
	Where,
	Join,
} from "@better-auth/core/db/adapter";

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
	debugLogs?: DBAdapterDebugLogOption;

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
	 * @default false
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
		updateMany: (data: any) => Promise<any>;
		delete: (data: any) => Promise<any>;
		[key: string]: any;
	};
};

export const prismaAdapter = (prisma: PrismaClient, config: PrismaConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;
	const createCustomAdapter =
		(prisma: PrismaClient): AdapterFactoryCustomizeAdapterCreator =>
		({ getFieldName, getModelName }) => {
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
				if (!where || !where.length) return {};
				if (where.length === 1) {
					const w = where[0]!;
					if (!w) {
						return;
					}
					return {
						[getFieldName({ model, field: w.field })]:
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
						[getFieldName({ model, field: w.field })]:
							w.operator === "eq" || !w.operator
								? w.value
								: {
										[operatorToPrismaOperator(w.operator)]: w.value,
									},
					};
				});
				const orClause = or.map((w) => {
					return {
						[getFieldName({ model, field: w.field })]:
							w.operator === "eq" || !w.operator
								? w.value
								: {
										[operatorToPrismaOperator(w.operator)]: w.value,
									},
					};
				});

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
				async findOne({ model, where, select, join: _join }) {
					// this is just "Join" type because we disabled join transformation in adapter config
					const join = _join as unknown as Join | undefined;

					const whereClause = convertWhereClause(model, where);
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}

					// transform join keys to use Prisma expected field names
					let include: Record<string, boolean> | undefined = undefined;
					let map = new Map<string, string>();
					if (join) {
						include = {};
						for (const [model, value] of Object.entries(join)) {
							const key = `${getModelName(model).toLowerCase()}s`;
							include[key] = value;
							map.set(key, getModelName(model));
						}
					}

					let result = await db[model]!.findFirst({
						where: whereClause,
						select: include ? undefined : convertSelect(select, model), // Can't use `include` and `select` together
						include,
					});

					// transform the resulting `include` items to use better-auth expected field names
					if (join && result) {
						for (const [includeKey, originalKey] of map.entries()) {
							if (includeKey in result) {
								result[originalKey] = result[includeKey];
								delete result[includeKey];
							}
						}
					}
					return result;
				},
				async findMany({ model, where, limit, offset, sortBy, join: _join }) {
					// this is just "Join" type because we disabled join transformation in adapter config
					const join = _join as unknown as Join | undefined;
					const whereClause = convertWhereClause(model, where);
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}

					// transform join keys to use Prisma expected field names
					let include: Record<string, boolean> | undefined = undefined;
					let map = new Map<string, string>();
					if (join) {
						include = {};
						for (const [model, value] of Object.entries(join)) {
							const key = `${getModelName(model).toLowerCase()}s`;
							include[key] = value;
							map.set(key, getModelName(model));
						}
					}

					const result = await db[model]!.findMany({
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
						include,
					});

					// transform the resulting `include` items to use better-auth expected field names
					if (join && Array.isArray(result)) {
						for (const item of result) {
							for (const [includeKey, originalKey] of map.entries()) {
								if (includeKey in item) {
									item[originalKey] = item[includeKey];
									delete item[includeKey];
								}
							}
						}
					}

					return result;
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
			disableTransformJoin: true,
		},
		adapter: createCustomAdapter(prisma),
	};

	const adapter = createAdapterFactory(adapterOptions);
	return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
		lazyOptions = options;
		return adapter(options);
	};
};
