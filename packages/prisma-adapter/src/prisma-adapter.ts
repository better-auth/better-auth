import type { BetterAuthOptions } from "@better-auth/core";
import type {
	AdapterFactoryCustomizeAdapterCreator,
	AdapterFactoryOptions,
	DBAdapter,
	DBAdapterDebugLogOption,
	JoinConfig,
	Where,
} from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";

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
		({
			getFieldName,
			getModelName,
			getFieldAttributes,
			getDefaultModelName,
			schema,
		}) => {
			const db = prisma as PrismaClientInternal;

			const convertSelect = (
				select: string[] | undefined,
				model: string,
				join?: JoinConfig | undefined,
			) => {
				if (!select && !join) return undefined;

				let result: Record<string, Record<string, any> | boolean> = {};

				if (select) {
					for (const field of select) {
						result[getFieldName({ model, field })] = true;
					}
				}

				if (join) {
					// when joining that has a limit, we need to use Prisma's `select` syntax to append the limit to the field
					// because of such, it also means we need to select all base-model fields as well
					// should check if `select` is not provided, because then we should select all base-model fields
					if (!select) {
						const fields = schema[getDefaultModelName(model)]?.fields || {};
						fields.id = { type: "string" }; // make sure there is at least an id field
						for (const field of Object.keys(fields)) {
							result[getFieldName({ model, field })] = true;
						}
					}

					for (const [joinModel, joinAttr] of Object.entries(join)) {
						const key = getJoinKeyName(model, getModelName(joinModel), schema);
						if (joinAttr.relation === "one-to-one") {
							result[key] = true;
						} else {
							result[key] = { take: joinAttr.limit };
						}
					}
				}

				return result;
			};

			/**
			 * Build the join key name based on whether the foreign field is unique or not.
			 * If unique, use singular. Otherwise, pluralize (add 's').
			 */
			const getJoinKeyName = (
				baseModel: string,
				joinedModel: string,
				schema: any,
			): string => {
				try {
					const defaultBaseModelName = getDefaultModelName(baseModel);
					const defaultJoinedModelName = getDefaultModelName(joinedModel);
					const key = getModelName(joinedModel).toLowerCase();

					// First, check if the joined model has FKs to the base model (forward join)
					let foreignKeys = Object.entries(
						schema[defaultJoinedModelName]?.fields || {},
					).filter(
						([_field, fieldAttributes]: any) =>
							fieldAttributes.references &&
							getDefaultModelName(fieldAttributes.references.model) ===
								defaultBaseModelName,
					);

					if (foreignKeys.length > 0) {
						// Forward join: joined model has FK to base model
						// This is typically a one-to-many relationship (plural)
						// Unless the FK is unique, then it's one-to-one (singular)
						const [_foreignKey, foreignKeyAttributes] = foreignKeys[0] as any;
						// Only check if field is explicitly marked as unique
						const isUnique = foreignKeyAttributes?.unique === true;
						return isUnique || config.usePlural === true ? key : `${key}s`;
					}

					// Check backwards: does the base model have FKs to the joined model?
					foreignKeys = Object.entries(
						schema[defaultBaseModelName]?.fields || {},
					).filter(
						([_field, fieldAttributes]: any) =>
							fieldAttributes.references &&
							getDefaultModelName(fieldAttributes.references.model) ===
								defaultJoinedModelName,
					);

					if (foreignKeys.length > 0) {
						return key;
					}
				} catch {
					// Fallback to pluralizing if we can't determine uniqueness
				}
				return `${getModelName(joinedModel).toLowerCase()}s`;
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
					const result = await db[model]!.create({
						data: values,
						select: convertSelect(select, model),
					});
					return result;
				},
				async findOne({ model, where, select, join }) {
					// this is just "JoinOption" type because we disabled join transformation in adapter config
					const whereClause = convertWhereClause(model, where);
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}

					// transform join keys to use Prisma expected field names
					let map = new Map<string, string>();
					for (const joinModel of Object.keys(join ?? {})) {
						const key = getJoinKeyName(model, joinModel, schema);
						map.set(key, getModelName(joinModel));
					}

					const selects = convertSelect(select, model, join);

					let result = (
						await db[model]!.findMany({
							where: whereClause,
							select: selects,
							take: 1,
						})
					)[0];

					// transform the resulting `include` items to use better-auth expected field names
					if (join && result) {
						for (const [includeKey, originalKey] of map.entries()) {
							if (includeKey === originalKey) continue;
							if (includeKey in result) {
								result[originalKey] = result[includeKey];
								delete result[includeKey];
							}
						}
					}
					return result;
				},
				async findMany({ model, where, limit, offset, sortBy, join }) {
					// this is just "JoinOption" type because we disabled join transformation in adapter config
					const whereClause = convertWhereClause(model, where);
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					// transform join keys to use Prisma expected field names
					let map = new Map<string, string>();
					if (join) {
						for (const [joinModel, value] of Object.entries(join)) {
							const key = getJoinKeyName(model, joinModel, schema);
							map.set(key, getModelName(joinModel));
						}
					}

					const selects = convertSelect(undefined, model, join);

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
						select: selects,
					});

					// transform the resulting join items to use better-auth expected field names
					if (join && Array.isArray(result)) {
						for (const item of result) {
							for (const [includeKey, originalKey] of map.entries()) {
								if (includeKey === originalKey) continue;
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
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					const whereClause = convertWhereClause(model, where);
					const result = await db[model]!.updateMany({
						where: whereClause,
						data: update,
					});
					return result ? (result.count as number) : 0;
				},
				async delete({ model, where }) {
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
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
