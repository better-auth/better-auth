import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	gte,
	inArray,
	notInArray,
	like,
	lt,
	lte,
	ne,
	or,
	sql,
	SQL,
} from "drizzle-orm";
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
} from "@better-auth/core/db/adapter";

export interface DB {
	[key: string]: any;
}

export interface DrizzleAdapterConfig {
	/**
	 * The schema object that defines the tables and fields
	 */
	schema?: Record<string, any>;
	/**
	 * The database provider
	 */
	provider: "pg" | "mysql" | "sqlite";
	/**
	 * If the table names in the schema are plural
	 * set this to true. For example, if the schema
	 * has an object with a key "users" instead of "user"
	 */
	usePlural?: boolean;
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption;
	/**
	 * By default snake case is used for table and field names
	 * when the CLI is used to generate the schema. If you want
	 * to use camel case, set this to true.
	 * @default false
	 */
	camelCase?: boolean;
	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions,
	 * set this to `false` and operations will be executed sequentially.
	 * @default false
	 */
	transaction?: boolean;
}

export const drizzleAdapter = (db: DB, config: DrizzleAdapterConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;
	const createCustomAdapter =
		(db: DB): AdapterFactoryCustomizeAdapterCreator =>
		({
			getFieldName,
			getFieldAttributes,
			getModelName,
			getDefaultModelName,
		}) => {
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
				where?: Where[],
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
			function nestJoinedResults(
				results: any[],
				baseModel: string,
				join: Record<string, any> | undefined,
			): any[] {
				// If no joins or no results, return as-is
				if (!join || !results.length) {
					return results;
				}

				const joinedModels = Object.keys(join);

				// Group results by base model and nest joined data as arrays
				const grouped = new Map<string, any>();

				for (const row of results) {
					const baseData = row[baseModel];
					const baseId = String(baseData.id);

					if (!grouped.has(baseId)) {
						const nested: Record<string, any> = { ...baseData };

						// Initialize joined arrays
						for (const joinedModel of joinedModels) {
							const fieldAttributes = getFieldAttributes({
								model: joinedModel,
								field: join[joinedModel].on.to,
							});
							nested[getDefaultModelName(joinedModel)] = fieldAttributes.unique
								? null
								: [];
						}

						grouped.set(baseId, nested);
					}

					const nestedEntry = grouped.get(baseId)!;

					// Add joined data to arrays
					for (const joinedModel of joinedModels) {
						// The Better-Auth CLI generates Drizzle field names with underscores instead of camel case.
						// The results from JOIN from Drizzle includes the field names not as the schema/variable field names,
						// rather the names defined in the DB. (which is the names with underscores)
						// we need to check both underscores as well as using `getModelName` to get the correct field name.
						let joinedData = row[getModelName(joinedModel)];
						if (!joinedData) {
							const underscoreModelName = joinedModel
								.replace(/([A-Z])/g, "_$1")
								.toLowerCase()
								.replace(/^_/, "");
							joinedData = row[underscoreModelName];
						}

						if (joinedData) {
							const defaultModelName = getDefaultModelName(joinedModel);
							if (Array.isArray(nestedEntry[defaultModelName])) {
								if (
									!nestedEntry[defaultModelName].some(
										(item) => item.id === joinedData.id,
									)
								) {
									nestedEntry[defaultModelName].push(joinedData);
								}
							} else {
								nestedEntry[defaultModelName] = joinedData;
							}
						}
					}
				}

				const result = Array.from(grouped.values());

				// For findOne, return single object; for findMany, return array
				// The adapter factory will handle unwrapping based on schema's unique constraint
				return result;
			}
			function checkMissingFields(
				schema: Record<string, any>,
				model: string,
				values: Record<string, any>,
			) {
				if (!schema) {
					throw new BetterAuthError(
						"Drizzle adapter failed to initialize. Schema not found. Please provide a schema object in the adapter options object.",
					);
				}
				for (const key in values) {
					if (!schema[key]) {
						throw new BetterAuthError(
							`The field "${key}" does not exist in the "${model}" schema. Please update your drizzle schema or re-generate using "npx @better-auth/cli generate".`,
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
					let query = db
						.select()
						.from(schemaModel)
						.where(...clause);
					if (join) {
						for (const [model, joinAttr] of Object.entries(join)) {
							const joinModel = getSchema(model);
							if (joinAttr.type === "inner") {
								query = query.innerJoin(
									joinModel,
									eq(schemaModel[joinAttr.on.from], joinModel[joinAttr.on.to]),
								);
							} else {
								query = query.leftJoin(
									joinModel,
									eq(schemaModel[joinAttr.on.from], joinModel[joinAttr.on.to]),
								);
							}
						}
					}
					const res = await query;
					if (!res.length) return null;
					const joinedResult = nestJoinedResults(res, model, join);
					return joinedResult[0];
				},
				async findMany({ model, where, sortBy, limit, offset, join }) {
					const schemaModel = getSchema(model);
					const clause = where ? convertWhereClause(where, model) : [];

					const sortFn = sortBy?.direction === "desc" ? desc : asc;
					const builder = db
						.select()
						.from(schemaModel)
						.limit(limit || 100)
						.offset(offset || 0);
					if (sortBy?.field) {
						builder.orderBy(
							sortFn(
								schemaModel[getFieldName({ model, field: sortBy?.field })],
							),
						);
					}
					return (await builder.where(...clause)) as any[];
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
					return await builder;
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
