import type { BetterAuthOptions } from "@better-auth/core";
import type {
	AdapterFactoryCustomizeAdapterCreator,
	AdapterFactoryOptions,
	DBAdapter,
	DBAdapterDebugLogOption,
	Where,
} from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import { logger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	gte,
	inArray,
	like,
	lt,
	lte,
	ne,
	notInArray,
	or,
	sql,
} from "drizzle-orm";

export interface DB {
	[key: string]: any;
}

export interface DrizzleAdapterConfig {
	/**
	 * The schema object that defines the tables and fields
	 */
	schema?: Record<string, any> | undefined;
	/**
	 * The database provider
	 */
	provider: "pg" | "mysql" | "sqlite";
	/**
	 * If the table names in the schema are plural
	 * set this to true. For example, if the schema
	 * has an object with a key "users" instead of "user"
	 */
	usePlural?: boolean | undefined;
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption | undefined;
	/**
	 * By default snake case is used for table and field names
	 * when the CLI is used to generate the schema. If you want
	 * to use camel case, set this to true.
	 * @default false
	 */
	camelCase?: boolean | undefined;
	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions,
	 * set this to `false` and operations will be executed sequentially.
	 * @default false
	 */
	transaction?: boolean | undefined;
}

export const drizzleAdapter = (db: DB, config: DrizzleAdapterConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;
	const createCustomAdapter =
		(db: DB): AdapterFactoryCustomizeAdapterCreator =>
		({ getFieldName, options }) => {
			function getSchema(model: string) {
				const schema = config.schema || db._.fullSchema;
				if (!schema) {
					throw new BetterAuthError(
						"Drizzle adapter failed to initialize. Schema not found. Please provide a schema object in the adapter options object.",
					);
				}
				const schemaModel = schema[model];
				if (!schemaModel) {
					throw new BetterAuthError(
						`[# Drizzle Adapter]: The model "${model}" was not found in the schema object. Please pass the schema directly to the adapter options.`,
					);
				}
				return schemaModel;
			}
			const withReturning = async (
				model: string,
				builder: any,
				data: Record<string, any>,
				where?: Where[] | undefined,
			) => {
				if (config.provider !== "mysql") {
					const c = await builder.returning();
					return c[0];
				}
				await builder.execute();
				const schemaModel = getSchema(model);
				const builderVal = builder.config?.values;
				if (where?.length) {
					// If we're updating a field that's in the where clause, use the new value
					const updatedWhere = where.map((w) => {
						// If this field was updated, use the new value for lookup
						if (data[w.field] !== undefined) {
							return { ...w, value: data[w.field] };
						}
						return w;
					});

					const clause = convertWhereClause(updatedWhere, model);
					const res = await db
						.select()
						.from(schemaModel)
						.where(...clause);
					return res[0];
				} else if (builderVal && builderVal[0]?.id?.value) {
					let tId = builderVal[0]?.id?.value;
					if (!tId) {
						//get last inserted id
						const lastInsertId = await db
							.select({ id: sql`LAST_INSERT_ID()` })
							.from(schemaModel)
							.orderBy(desc(schemaModel.id))
							.limit(1);
						tId = lastInsertId[0].id;
					}
					const res = await db
						.select()
						.from(schemaModel)
						.where(eq(schemaModel.id, tId))
						.limit(1)
						.execute();
					return res[0];
				} else if (data.id) {
					const res = await db
						.select()
						.from(schemaModel)
						.where(eq(schemaModel.id, data.id))
						.limit(1)
						.execute();
					return res[0];
				} else {
					// If the user doesn't have `id` as a field, then this will fail.
					// We expect that they defined `id` in all of their models.
					if (!("id" in schemaModel)) {
						throw new BetterAuthError(
							`The model "${model}" does not have an "id" field. Please use the "id" field as your primary key.`,
						);
					}
					const res = await db
						.select()
						.from(schemaModel)
						.orderBy(desc(schemaModel.id))
						.limit(1)
						.execute();
					return res[0];
				}
			};
			function convertWhereClause(where: Where[], model: string) {
				const schemaModel = getSchema(model);
				if (!where) return [];
				if (where.length === 1) {
					const w = where[0];
					if (!w) {
						return [];
					}
					const field = getFieldName({ model, field: w.field });
					if (!schemaModel[field]) {
						throw new BetterAuthError(
							`The field "${w.field}" does not exist in the schema for the model "${model}". Please update your schema.`,
						);
					}
					if (w.operator === "in") {
						if (!Array.isArray(w.value)) {
							throw new BetterAuthError(
								`The value for the field "${w.field}" must be an array when using the "in" operator.`,
							);
						}
						return [inArray(schemaModel[field], w.value)];
					}

					if (w.operator === "not_in") {
						if (!Array.isArray(w.value)) {
							throw new BetterAuthError(
								`The value for the field "${w.field}" must be an array when using the "not_in" operator.`,
							);
						}
						return [notInArray(schemaModel[field], w.value)];
					}

					if (w.operator === "contains") {
						return [like(schemaModel[field], `%${w.value}%`)];
					}

					if (w.operator === "starts_with") {
						return [like(schemaModel[field], `${w.value}%`)];
					}

					if (w.operator === "ends_with") {
						return [like(schemaModel[field], `%${w.value}`)];
					}

					if (w.operator === "lt") {
						return [lt(schemaModel[field], w.value)];
					}

					if (w.operator === "lte") {
						return [lte(schemaModel[field], w.value)];
					}

					if (w.operator === "ne") {
						return [ne(schemaModel[field], w.value)];
					}

					if (w.operator === "gt") {
						return [gt(schemaModel[field], w.value)];
					}

					if (w.operator === "gte") {
						return [gte(schemaModel[field], w.value)];
					}

					return [eq(schemaModel[field], w.value)];
				}
				const andGroup = where.filter(
					(w) => w.connector === "AND" || !w.connector,
				);
				const orGroup = where.filter((w) => w.connector === "OR");

				const andClause = and(
					...andGroup.map((w) => {
						const field = getFieldName({ model, field: w.field });
						if (w.operator === "in") {
							if (!Array.isArray(w.value)) {
								throw new BetterAuthError(
									`The value for the field "${w.field}" must be an array when using the "in" operator.`,
								);
							}
							return inArray(schemaModel[field], w.value);
						}
						if (w.operator === "not_in") {
							if (!Array.isArray(w.value)) {
								throw new BetterAuthError(
									`The value for the field "${w.field}" must be an array when using the "not_in" operator.`,
								);
							}
							return notInArray(schemaModel[field], w.value);
						}
						if (w.operator === "contains") {
							return like(schemaModel[field], `%${w.value}%`);
						}
						if (w.operator === "starts_with") {
							return like(schemaModel[field], `${w.value}%`);
						}
						if (w.operator === "ends_with") {
							return like(schemaModel[field], `%${w.value}`);
						}
						if (w.operator === "lt") {
							return lt(schemaModel[field], w.value);
						}
						if (w.operator === "lte") {
							return lte(schemaModel[field], w.value);
						}
						if (w.operator === "gt") {
							return gt(schemaModel[field], w.value);
						}
						if (w.operator === "gte") {
							return gte(schemaModel[field], w.value);
						}
						if (w.operator === "ne") {
							return ne(schemaModel[field], w.value);
						}
						return eq(schemaModel[field], w.value);
					}),
				);
				const orClause = or(
					...orGroup.map((w) => {
						const field = getFieldName({ model, field: w.field });
						if (w.operator === "in") {
							if (!Array.isArray(w.value)) {
								throw new BetterAuthError(
									`The value for the field "${w.field}" must be an array when using the "in" operator.`,
								);
							}
							return inArray(schemaModel[field], w.value);
						}
						if (w.operator === "not_in") {
							if (!Array.isArray(w.value)) {
								throw new BetterAuthError(
									`The value for the field "${w.field}" must be an array when using the "not_in" operator.`,
								);
							}
							return notInArray(schemaModel[field], w.value);
						}
						if (w.operator === "contains") {
							return like(schemaModel[field], `%${w.value}%`);
						}
						if (w.operator === "starts_with") {
							return like(schemaModel[field], `${w.value}%`);
						}
						if (w.operator === "ends_with") {
							return like(schemaModel[field], `%${w.value}`);
						}
						if (w.operator === "lt") {
							return lt(schemaModel[field], w.value);
						}
						if (w.operator === "lte") {
							return lte(schemaModel[field], w.value);
						}
						if (w.operator === "gt") {
							return gt(schemaModel[field], w.value);
						}
						if (w.operator === "gte") {
							return gte(schemaModel[field], w.value);
						}
						if (w.operator === "ne") {
							return ne(schemaModel[field], w.value);
						}
						return eq(schemaModel[field], w.value);
					}),
				);

				const clause: SQL<unknown>[] = [];

				if (andGroup.length) clause.push(andClause!);
				if (orGroup.length) clause.push(orClause!);
				return clause;
			}
			function checkMissingFields(
				schema: Record<string, any>,
				model: string,
				values: Record<string, any>,
			) {
				if (!schema) {
					throw new BetterAuthError(
						"Drizzle adapter failed to initialize. Drizzle Schema not found. Please provide a schema object in the adapter options object.",
					);
				}
				for (const key in values) {
					if (!schema[key]) {
						throw new BetterAuthError(
							`The field "${key}" does not exist in the "${model}" Drizzle schema. Please update your drizzle schema or re-generate using "npx @better-auth/cli@latest generate".`,
						);
					}
				}
			}

			return {
				async create({ model, data: values }) {
					const schemaModel = getSchema(model);
					checkMissingFields(schemaModel, model, values);
					const builder = db.insert(schemaModel).values(values);
					const returned = await withReturning(model, builder, values);
					return returned;
				},
				async findOne({ model, where, join }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model);

					if (options.experimental?.joins) {
						if (!db.query || !db.query[model]) {
							logger.error(
								`[# Drizzle Adapter]: The model "${model}" was not found in the query object. Please update your Drizzle schema to include relations or re-generate using "npx @better-auth/cli@latest generate".`,
							);
							logger.info("Falling back to regular query");
						} else {
							let includes:
								| Record<string, { limit: number } | boolean>
								| undefined;

							const pluralJoinResults: string[] = [];
							if (join) {
								includes = {};
								const joinEntries = Object.entries(join);
								for (const [model, joinAttr] of joinEntries) {
									const limit =
										joinAttr.limit ??
										options.advanced?.database?.defaultFindManyLimit ??
										100;
									const isUnique = joinAttr.relation === "one-to-one";
									const pluralSuffix = isUnique || config.usePlural ? "" : "s";
									includes[`${model}${pluralSuffix}`] = isUnique
										? true
										: { limit };
									if (!isUnique) {
										pluralJoinResults.push(`${model}${pluralSuffix}`);
									}
								}
							}
							let query = db.query[model].findFirst({
								where: clause[0],
								with: includes,
							});
							const res = await query;

							if (res) {
								for (const pluralJoinResult of pluralJoinResults) {
									let singularKey = !config.usePlural
										? pluralJoinResult.slice(0, -1)
										: pluralJoinResult;
									res[singularKey] = res[pluralJoinResult];
									if (pluralJoinResult !== singularKey) {
										delete res[pluralJoinResult];
									}
								}
							}
							return res;
						}
					}

					let query = db
						.select()
						.from(schemaModel)
						.where(...clause);

					const res = await query;

					if (!res.length) return null;
					return res[0];
				},
				async findMany({ model, where, sortBy, limit, offset, join }) {
					const schemaModel = getSchema(model);
					const clause = where ? convertWhereClause(where, model) : [];
					const sortFn = sortBy?.direction === "desc" ? desc : asc;

					if (options.experimental?.joins) {
						if (!db.query[model]) {
							logger.error(
								`[# Drizzle Adapter]: The model "${model}" was not found in the query object. Please update your Drizzle schema to include relations or re-generate using "npx @better-auth/cli@latest generate".`,
							);
							logger.info("Falling back to regular query");
						} else {
							let includes:
								| Record<string, { limit: number } | boolean>
								| undefined;

							const pluralJoinResults: string[] = [];
							if (join) {
								includes = {};
								const joinEntries = Object.entries(join);
								for (const [model, joinAttr] of joinEntries) {
									const isUnique = joinAttr.relation === "one-to-one";
									const limit =
										joinAttr.limit ??
										options.advanced?.database?.defaultFindManyLimit ??
										100;
									let pluralSuffix = isUnique || config.usePlural ? "" : "s";
									includes[`${model}${pluralSuffix}`] = isUnique
										? true
										: { limit };
									if (!isUnique)
										pluralJoinResults.push(`${model}${pluralSuffix}`);
								}
							}
							let orderBy: SQL<unknown>[] | undefined = undefined;
							if (sortBy?.field) {
								orderBy = [
									sortFn(
										schemaModel[getFieldName({ model, field: sortBy?.field })],
									),
								];
							}
							let query = db.query[model].findMany({
								where: clause[0],
								with: includes,
								limit: limit ?? 100,
								offset: offset ?? 0,
								orderBy,
							});
							let res = await query;
							if (res) {
								for (const item of res) {
									for (const pluralJoinResult of pluralJoinResults) {
										const singularKey = !config.usePlural
											? pluralJoinResult.slice(0, -1)
											: pluralJoinResult;
										if (singularKey === pluralJoinResult) continue;
										item[singularKey] = item[pluralJoinResult];
										delete item[pluralJoinResult];
									}
								}
							}
							return res;
						}
					}

					let builder = db.select().from(schemaModel);

					const effectiveLimit = limit;
					const effectiveOffset = offset;

					if (typeof effectiveLimit !== "undefined") {
						builder = builder.limit(effectiveLimit);
					}

					if (typeof effectiveOffset !== "undefined") {
						builder = builder.offset(effectiveOffset);
					}

					if (sortBy?.field) {
						builder = builder.orderBy(
							sortFn(
								schemaModel[getFieldName({ model, field: sortBy?.field })],
							),
						);
					}

					const res = await builder.where(...clause);
					return res;
				},
				async count({ model, where }) {
					const schemaModel = getSchema(model);
					const clause = where ? convertWhereClause(where, model) : [];
					const res = await db
						.select({ count: count() })
						.from(schemaModel)
						.where(...clause);
					return res[0].count;
				},
				async update({ model, where, update: values }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model);
					const builder = db
						.update(schemaModel)
						.set(values)
						.where(...clause);
					return await withReturning(model, builder, values as any, where);
				},
				async updateMany({ model, where, update: values }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model);
					const builder = db
						.update(schemaModel)
						.set(values)
						.where(...clause);
					return await builder;
				},
				async delete({ model, where }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model);
					const builder = db.delete(schemaModel).where(...clause);
					return await builder;
				},
				async deleteMany({ model, where }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model);
					const builder = db.delete(schemaModel).where(...clause);
					const res = await builder;
					let count = 0;
					if (res && "rowCount" in res) count = res.rowCount;
					else if (Array.isArray(res)) count = res.length;
					else if (
						res &&
						("affectedRows" in res || "rowsAffected" in res || "changes" in res)
					)
						count = res.affectedRows ?? res.rowsAffected ?? res.changes;
					if (typeof count !== "number") {
						logger.error(
							"[Drizzle Adapter] The result of the deleteMany operation is not a number. This is likely a bug in the adapter. Please report this issue to the Better Auth team.",
							{ res, model, where },
						);
					}
					return count;
				},
				options: config,
			};
		};
	let adapterOptions: AdapterFactoryOptions | null = null;
	adapterOptions = {
		config: {
			adapterId: "drizzle",
			adapterName: "Drizzle Adapter",
			usePlural: config.usePlural ?? false,
			debugLogs: config.debugLogs ?? false,
			supportsUUIDs: config.provider === "pg" ? true : false,
			supportsJSON: config.provider === "pg" ? true : false,
			transaction:
				(config.transaction ?? false)
					? (cb) =>
							db.transaction((tx: DB) => {
								const adapter = createAdapterFactory({
									config: adapterOptions!.config,
									adapter: createCustomAdapter(tx),
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
