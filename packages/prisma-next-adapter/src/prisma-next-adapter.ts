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

/**
 * @experimental Prisma Next is in Early Access. APIs may change.
 */
export interface PrismaNextConfig {
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption | undefined;

	/**
	 * Use plural model names (e.g. "users" instead of "user")
	 *
	 * @default false
	 */
	usePlural?: boolean | undefined;

	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * @default false
	 */
	transaction?: boolean | undefined;
}

/**
 * Internal type for the Prisma Next ORM collection (fluent query builder).
 * Duck-typed to avoid hard dependency on generated contract types.
 */
interface PrismaNextCollection {
	where: (filter: Record<string, unknown>) => PrismaNextCollection;
	find: () => Promise<Record<string, unknown> | null>;
	all: () => Promise<Record<string, unknown>[]>;
	create: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
	update: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
	updateAll: (
		data: Record<string, unknown>,
	) => Promise<Record<string, unknown>[]>;
	updateCount: (data: Record<string, unknown>) => Promise<number>;
	delete: () => Promise<Record<string, unknown>>;
	deleteAll: () => Promise<Record<string, unknown>[]>;
	deleteCount: () => Promise<number>;
	select: (...fields: string[]) => PrismaNextCollection;
	include: (
		relation: string,
		refinement?: (collection: PrismaNextCollection) => PrismaNextCollection,
	) => PrismaNextCollection;
	orderBy: (
		spec:
			| Record<string, "asc" | "desc">
			| ((accessor: any) => any)
			| Array<(accessor: any) => any>,
	) => PrismaNextCollection;
	skip: (n: number) => PrismaNextCollection;
	take: (n: number) => PrismaNextCollection;
	aggregate: (
		fn: (a: any) => Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
	[key: string]: any;
}

/**
 * Internal type for the Prisma Next DB client.
 * Prisma Next exposes `db.orm` with model collections, and `db.transaction()`.
 */
interface PrismaNextClientInternal {
	orm: {
		[model: string]: PrismaNextCollection;
	};
	transaction: <R>(
		callback: (tx: PrismaNextClientInternal) => R | Promise<R>,
	) => Promise<R>;
}

/**
 * Prisma Next client type accepted by the adapter.
 * Users pass their Prisma Next `db` instance.
 */
export interface PrismaNextClient {
	orm: Record<string, unknown>;
	transaction: (callback: (tx: any) => any) => Promise<any>;
}

/**
 * Convert better-auth Where[] clauses into a flat filter object
 * suitable for Prisma Next's `.where()` shorthand.
 *
 * Prisma Next's shorthand object filter supports equality checks
 * directly: `{ field: value }`. For operators, we build nested
 * objects matching Prisma Next's filter shape.
 */
function convertWhere(where: Where[] | undefined): Record<string, unknown> {
	if (!where || where.length === 0) return {};

	const andConditions: Record<string, unknown>[] = [];
	const orConditions: Record<string, unknown>[] = [];

	for (const w of where) {
		const condition = buildCondition(w);
		if (w.connector === "OR") {
			orConditions.push(condition);
		} else {
			andConditions.push(condition);
		}
	}

	if (andConditions.length === 1 && orConditions.length === 0) {
		return andConditions[0]!;
	}

	const result: Record<string, unknown> = {};
	if (andConditions.length > 0) {
		result.AND = andConditions;
	}
	if (orConditions.length > 0) {
		result.OR = orConditions;
	}
	return result;
}

function buildCondition(w: Where): Record<string, unknown> {
	const field = w.field;
	const operator = w.operator ?? "eq";
	const value = w.value;
	const mode = w.mode ?? "sensitive";
	const isInsensitive = mode === "insensitive" && typeof value === "string";

	switch (operator) {
		case "eq":
			if (isInsensitive) {
				return { [field]: { equals: value, mode: "insensitive" } };
			}
			return { [field]: value };
		case "ne":
			if (value === null) {
				return { [field]: { not: null } };
			}
			if (isInsensitive) {
				return { [field]: { not: { equals: value }, mode: "insensitive" } };
			}
			return { [field]: { not: value } };
		case "gt":
			return { [field]: { gt: value } };
		case "gte":
			return { [field]: { gte: value } };
		case "lt":
			return { [field]: { lt: value } };
		case "lte":
			return { [field]: { lte: value } };
		case "in":
			if (Array.isArray(value)) {
				const filtered = value.filter((v) => v != null);
				if (filtered.length === 0) {
					return {
						AND: [
							{ [field]: { equals: "__never__" } },
							{ [field]: { not: "__never__" } },
						],
					};
				}
				if (isInsensitive) {
					return { [field]: { in: filtered, mode: "insensitive" } };
				}
				return { [field]: { in: filtered } };
			}
			return { [field]: { in: value } };
		case "not_in":
			if (Array.isArray(value)) {
				const filtered = value.filter((v) => v != null);
				if (filtered.length === 0) {
					return {};
				}
				return { [field]: { notIn: filtered } };
			}
			return { [field]: { notIn: value } };
		case "contains":
			if (isInsensitive) {
				return { [field]: { contains: value, mode: "insensitive" } };
			}
			return { [field]: { contains: value } };
		case "starts_with":
			if (isInsensitive) {
				return { [field]: { startsWith: value, mode: "insensitive" } };
			}
			return { [field]: { startsWith: value } };
		case "ends_with":
			if (isInsensitive) {
				return { [field]: { endsWith: value, mode: "insensitive" } };
			}
			return { [field]: { endsWith: value } };
		default:
			return { [field]: value };
	}
}

/**
 * @experimental Prisma Next is in Early Access (not production-ready).
 *
 * Creates a Better Auth database adapter for Prisma Next.
 * Currently supports PostgreSQL only (matching Prisma Next's support).
 *
 * @param db - The Prisma Next database client (with `.orm` and `.transaction()`)
 * @param config - Adapter configuration
 *
 * @example
 * ```typescript
 * import postgres from '@prisma-next/postgres/runtime';
 * import { prismaNextAdapter } from '@better-auth/prisma-next-adapter';
 *
 * const db = postgres({ contractJson, url: process.env.DATABASE_URL });
 *
 * const auth = betterAuth({
 *   database: prismaNextAdapter(db, {}),
 * });
 * ```
 */
export const prismaNextAdapter = (db: PrismaNextClient, config: PrismaNextConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;

	const createCustomAdapter =
		(client: PrismaNextClient): AdapterFactoryCustomizeAdapterCreator =>
		({ getFieldName, getModelName, getDefaultModelName, schema }) => {
			const orm = client as PrismaNextClientInternal;

			const getCollection = (model: string): PrismaNextCollection => {
				const collection = orm.orm[model];
				if (!collection) {
					throw new BetterAuthError(
						`Model "${model}" does not exist on the Prisma Next ORM client. ` +
							`Make sure your contract includes this model and you have emitted it.`,
					);
				}
				return collection;
			};

			const getJoinKeyName = (
				baseModel: string,
				joinedModel: string,
			): string => {
				try {
					const defaultBaseModelName = getDefaultModelName(baseModel);
					const defaultJoinedModelName = getDefaultModelName(joinedModel);
					const key = getModelName(joinedModel).toLowerCase();

					const foreignKeys = Object.entries(
						schema[defaultJoinedModelName]?.fields || {},
					).filter(
						([_field, fieldAttributes]: any) =>
							fieldAttributes.references &&
							getDefaultModelName(fieldAttributes.references.model) ===
								defaultBaseModelName,
					);

					if (foreignKeys.length > 0) {
						const [_foreignKey, foreignKeyAttributes] = foreignKeys[0] as any;
						const isUnique = foreignKeyAttributes?.unique === true;
						return isUnique || config.usePlural === true ? key : `${key}s`;
					}

					const baseToJoined = Object.entries(
						schema[defaultBaseModelName]?.fields || {},
					).filter(
						([_field, fieldAttributes]: any) =>
							fieldAttributes.references &&
							getDefaultModelName(fieldAttributes.references.model) ===
								defaultJoinedModelName,
					);

					if (baseToJoined.length > 0) {
						return key;
					}
				} catch {
					// Fallback to pluralizing
				}
				return `${getModelName(joinedModel).toLowerCase()}s`;
			};

			const applyWhere = (
				collection: PrismaNextCollection,
				where: Where[] | undefined,
			): PrismaNextCollection => {
				const filter = convertWhere(where);
				if (Object.keys(filter).length === 0) return collection;
				return collection.where(filter);
			};

			const applySelect = (
				collection: PrismaNextCollection,
				select: string[] | undefined,
				model: string,
			): PrismaNextCollection => {
				if (!select || select.length === 0) return collection;
				const fields = select.map((field) => getFieldName({ model, field }));
				return collection.select(...fields);
			};

			const applyJoin = (
				collection: PrismaNextCollection,
				model: string,
				join: JoinConfig | undefined,
			): { collection: PrismaNextCollection; map: Map<string, string> } => {
				const map = new Map<string, string>();
				if (!join) return { collection, map };

				let result = collection;
				for (const [joinModel, joinAttr] of Object.entries(join)) {
					const attr = joinAttr as {
						on: { from: string; to: string };
						limit?: number;
						relation?: "one-to-one" | "one-to-many" | "many-to-many";
					};
					const key = getJoinKeyName(model, joinModel);
					map.set(key, getModelName(joinModel));

					if (attr.relation === "one-to-one") {
						result = result.include(key);
					} else if (attr.limit) {
						const lim = attr.limit;
						result = result.include(key, (c: PrismaNextCollection) =>
							c.take(lim),
						);
					} else {
						result = result.include(key);
					}
				}

				return { collection: result, map };
			};

			const transformJoinResult = (
				result: Record<string, unknown>,
				map: Map<string, string>,
			): Record<string, unknown> => {
				for (const [includeKey, originalKey] of map.entries()) {
					if (includeKey === originalKey) continue;
					if (includeKey in result) {
						result[originalKey] = result[includeKey];
						delete result[includeKey];
					}
				}
				return result;
			};

			return {
				async create({ model, data, select }) {
					let collection = getCollection(model);
					const result = await collection.create(data as Record<string, unknown>);
					if (select && select.length > 0) {
						const filtered: Record<string, unknown> = {};
						for (const field of select) {
							const fieldName = getFieldName({ model, field });
							if (fieldName in result) {
								filtered[fieldName] = result[fieldName];
							}
						}
						return filtered as any;
					}
					return result as any;
				},

				async findOne({ model, where, select, join }) {
					let collection = getCollection(model);
					collection = applyWhere(collection, where);

					const { collection: withJoin, map } = applyJoin(
						collection,
						model,
						join,
					);
					collection = withJoin;

					if (!join) {
						collection = applySelect(collection, select, model);
					}

					const result = await collection.find();
					if (!result) return null;

					if (join) {
						transformJoinResult(result, map);
					}

					return result as any;
				},

				async findMany({ model, where, limit, select, offset, sortBy, join }) {
					let collection = getCollection(model);
					collection = applyWhere(collection, where);

					const { collection: withJoin, map } = applyJoin(
						collection,
						model,
						join,
					);
					collection = withJoin;

					if (!join) {
						collection = applySelect(collection, select, model);
					}

					if (sortBy?.field) {
						const fieldName = getFieldName({ model, field: sortBy.field });
						collection = collection.orderBy({
							[fieldName]: sortBy.direction === "desc" ? "desc" : "asc",
						});
					}

					if (offset) {
						collection = collection.skip(offset);
					}

					collection = collection.take(limit || 100);

					const results = await collection.all();

					if (join && Array.isArray(results)) {
						for (const item of results) {
							transformJoinResult(item, map);
						}
					}

					return results as any;
				},

				async count({ model, where }) {
					let collection = getCollection(model);
					collection = applyWhere(collection, where);
					const result = await collection.aggregate((a: any) => ({
						count: a.count(),
					}));
					return (result as any).count as number;
				},

				async update({ model, where, update }) {
					let collection = getCollection(model);
					collection = applyWhere(collection, where);

					try {
						const result = await collection.update(
							update as Record<string, unknown>,
						);
						return result as any;
					} catch (e: any) {
						if (isPrismaNextNotFoundError(e)) return null;
						throw e;
					}
				},

				async updateMany({ model, where, update }) {
					let collection = getCollection(model);
					collection = applyWhere(collection, where);

					const count = await collection.updateCount(
						update as Record<string, unknown>,
					);
					return typeof count === "number" ? count : 0;
				},

				async delete({ model, where }) {
					let collection = getCollection(model);
					collection = applyWhere(collection, where);

					try {
						await collection.delete();
					} catch (e: any) {
						if (isPrismaNextNotFoundError(e)) return;
						throw e;
					}
				},

				async deleteMany({ model, where }) {
					let collection = getCollection(model);
					collection = applyWhere(collection, where);

					const count = await collection.deleteCount();
					return typeof count === "number" ? count : 0;
				},

				async consumeOne({ model, where }) {
					let collection = getCollection(model);
					collection = applyWhere(collection, where);

					try {
						const result = await collection.delete();
						return (result as any) ?? null;
					} catch (e: any) {
						if (isPrismaNextNotFoundError(e)) return null;
						throw e;
					}
				},

				async incrementOne({ model, where, increment, set }) {
					const collection = getCollection(model);
					const data: Record<string, unknown> = { ...(set ?? {}) };
					for (const [field, delta] of Object.entries(increment)) {
						data[field] = { increment: delta };
					}

					let query = applyWhere(collection, where);
					try {
						const result = await query.update(data);
						return (result as any) ?? null;
					} catch (e: any) {
						if (isPrismaNextNotFoundError(e)) return null;
						throw e;
					}
				},

				options: config,
			};
		};

	let adapterOptions: AdapterFactoryOptions | null = null;
	adapterOptions = {
		config: {
			adapterId: "prisma-next",
			adapterName: "Prisma Next Adapter",
			usePlural: config.usePlural ?? false,
			debugLogs: config.debugLogs ?? false,
			supportsUUIDs: true,
			supportsArrays: true,
			transaction:
				(config.transaction ?? false)
					? <R>(cb: (trx: any) => Promise<R>): Promise<R> =>
							(db as PrismaNextClientInternal).transaction((tx) => {
								const adapter = createAdapterFactory({
									config: {
										...adapterOptions!.config,
										transaction: false,
									},
									adapter: createCustomAdapter(tx as PrismaNextClient),
								})(lazyOptions!);
								return cb(adapter);
							})
					: false,
		},
		adapter: createCustomAdapter(db),
	};

	const adapter = createAdapterFactory(adapterOptions);
	return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
		lazyOptions = options;
		return adapter(options);
	};
};

function isPrismaNextNotFoundError(e: any): boolean {
	return (
		e?.code === "P2025" ||
		e?.code === "NOT_FOUND" ||
		e?.message?.includes("Record to delete does not exist") ||
		e?.message?.includes("No record found")
	);
}
