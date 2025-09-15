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
import { BetterAuthError } from "../../error";
import type { Where, Join } from "../../types";
import { createAdapter, type AdapterDebugLogs } from "../create-adapter";

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
	debugLogs?: AdapterDebugLogs;
	/**
	 * By default snake case is used for table and field names
	 * when the CLI is used to generate the schema. If you want
	 * to use camel case, set this to true.
	 * @default false
	 */
	camelCase?: boolean;
}

export const drizzleAdapter = (db: DB, config: DrizzleAdapterConfig) =>
	createAdapter({
		config: {
			adapterId: "drizzle",
			adapterName: "Drizzle Adapter",
			usePlural: config.usePlural ?? false,
			debugLogs: config.debugLogs ?? false,
		},
		adapter: ({ getFieldName, debugLog }) => {
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
					const clause = convertWhereClause(where, model);
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
			function convertWhereClause(
				where: Where[],
				model: string,
				joins?: Join[],
			) {
				const schemaModel = getSchema(model);
				if (!where) return [];

				// Helper function to resolve field references
				const resolveField = (fieldRef: string) => {
					if (fieldRef.includes(".")) {
						const [tableName, fieldName] = fieldRef.split(".");
						if (tableName === model) {
							return schemaModel[getFieldName({ model, field: fieldName })];
						}
						// Find the join for this table
						const join = joins?.find((j) => (j.alias || j.table) === tableName);
						if (join) {
							const joinSchema = getSchema(join.table);
							return joinSchema[
								getFieldName({ model: join.table, field: fieldName })
							];
						}
						// Fallback to main table
						return schemaModel[getFieldName({ model, field: fieldName })];
					} else {
						// Simple field name, use main table
						return schemaModel[getFieldName({ model, field: fieldRef })];
					}
				};

				if (where.length === 1) {
					const w = where[0];
					if (!w) {
						return [];
					}
					const field = resolveField(w.field);
					if (!field) {
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
						return [inArray(field, w.value)];
					}

					if (w.operator === "not_in") {
						if (!Array.isArray(w.value)) {
							throw new BetterAuthError(
								`The value for the field "${w.field}" must be an array when using the "not_in" operator.`,
							);
						}
						return [notInArray(field, w.value)];
					}

					if (w.operator === "contains") {
						return [like(field, `%${w.value}%`)];
					}

					if (w.operator === "starts_with") {
						return [like(field, `${w.value}%`)];
					}

					if (w.operator === "ends_with") {
						return [like(field, `%${w.value}`)];
					}

					if (w.operator === "lt") {
						return [lt(field, w.value)];
					}

					if (w.operator === "lte") {
						return [lte(field, w.value)];
					}

					if (w.operator === "ne") {
						return [ne(field, w.value)];
					}

					if (w.operator === "gt") {
						return [gt(field, w.value)];
					}

					if (w.operator === "gte") {
						return [gte(field, w.value)];
					}

					return [eq(field, w.value)];
				}
				const andGroup = where.filter(
					(w) => w.connector === "AND" || !w.connector,
				);
				const orGroup = where.filter((w) => w.connector === "OR");

				const andClause = and(
					...andGroup.map((w) => {
						const field = resolveField(w.field);
						if (w.operator === "in") {
							if (!Array.isArray(w.value)) {
								throw new BetterAuthError(
									`The value for the field "${w.field}" must be an array when using the "in" operator.`,
								);
							}
							return inArray(field, w.value);
						}
						if (w.operator === "not_in") {
							if (!Array.isArray(w.value)) {
								throw new BetterAuthError(
									`The value for the field "${w.field}" must be an array when using the "not_in" operator.`,
								);
							}
							return notInArray(field, w.value);
						}
						return eq(field, w.value);
					}),
				);
				const orClause = or(
					...orGroup.map((w) => {
						const field = resolveField(w.field);
						return eq(field, w.value);
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
				async findOne({ model, where, select, joins }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model, joins);
					let query = db.select().from(schemaModel);

					// Handle joins
					if (joins && joins.length > 0) {
						for (const join of joins) {
							const joinSchema = getSchema(join.table);
							const joinName = join.alias || join.table;

							// Parse join conditions
							const leftParts = join.on.left.split(".");
							const rightParts = join.on.right.split(".");

							let leftField: any, rightField: any;
							if (leftParts.length === 2) {
								// table.field format
								const [leftTable, field] = leftParts;
								leftField =
									leftTable === model
										? schemaModel[field]
										: leftTable === joinName
											? joinSchema[field]
											: schemaModel[field];
							} else {
								// just field name, assume main table
								leftField = schemaModel[leftParts[0]];
							}

							if (rightParts.length === 2) {
								// table.field format
								const [rightTable, field] = rightParts;
								rightField =
									rightTable === model
										? schemaModel[field]
										: rightTable === joinName
											? joinSchema[field]
											: joinSchema[field];
							} else {
								// just field name, assume joined table
								rightField = joinSchema[rightParts[0]];
							}

							switch (join.type) {
								case "inner":
									query = query.innerJoin(
										joinSchema,
										eq(leftField, rightField),
									);
									break;
								case "left":
									query = query.leftJoin(joinSchema, eq(leftField, rightField));
									break;
								case "right":
									query = query.rightJoin(
										joinSchema,
										eq(leftField, rightField),
									);
									break;
								case "full":
									query = query.fullJoin(joinSchema, eq(leftField, rightField));
									break;
							}
						}
					}

					const res = await query.where(...clause);
					if (!res.length) return null;
					return res[0];
				},
				async findMany({ model, where, sortBy, limit, offset, joins }) {
					const schemaModel = getSchema(model);
					const clause = where ? convertWhereClause(where, model, joins) : [];

					const sortFn = sortBy?.direction === "desc" ? desc : asc;
					let query = db.select().from(schemaModel);

					// Handle joins
					if (joins && joins.length > 0) {
						for (const join of joins) {
							const joinSchema = getSchema(join.table);
							const joinName = join.alias || join.table;

							// Parse join conditions
							const leftParts = join.on.left.split(".");
							const rightParts = join.on.right.split(".");

							let leftField: any, rightField: any;
							if (leftParts.length === 2) {
								// table.field format
								const [leftTable, field] = leftParts;
								leftField =
									leftTable === model
										? schemaModel[field]
										: leftTable === joinName
											? joinSchema[field]
											: schemaModel[field];
							} else {
								// just field name, assume main table
								leftField = schemaModel[leftParts[0]];
							}

							if (rightParts.length === 2) {
								// table.field format
								const [rightTable, field] = rightParts;
								rightField =
									rightTable === model
										? schemaModel[field]
										: rightTable === joinName
											? joinSchema[field]
											: joinSchema[field];
							} else {
								// just field name, assume joined table
								rightField = joinSchema[rightParts[0]];
							}

							switch (join.type) {
								case "inner":
									query = query.innerJoin(
										joinSchema,
										eq(leftField, rightField),
									);
									break;
								case "left":
									query = query.leftJoin(joinSchema, eq(leftField, rightField));
									break;
								case "right":
									query = query.rightJoin(
										joinSchema,
										eq(leftField, rightField),
									);
									break;
								case "full":
									query = query.fullJoin(joinSchema, eq(leftField, rightField));
									break;
							}
						}
					}

					query = query.limit(limit || 100).offset(offset || 0);

					if (sortBy?.field) {
						query = query.orderBy(
							sortFn(
								schemaModel[getFieldName({ model, field: sortBy?.field })],
							),
						);
					}
					return (await query.where(...clause)) as any[];
				},
				async count({ model, where, joins }) {
					const schemaModel = getSchema(model);
					const clause = where ? convertWhereClause(where, model, joins) : [];
					let query = db.select({ count: count() }).from(schemaModel);

					// Handle joins
					if (joins && joins.length > 0) {
						for (const join of joins) {
							const joinSchema = getSchema(join.table);
							const joinName = join.alias || join.table;

							// Parse join conditions
							const leftParts = join.on.left.split(".");
							const rightParts = join.on.right.split(".");

							let leftField: any, rightField: any;
							if (leftParts.length === 2) {
								// table.field format
								const [leftTable, field] = leftParts;
								leftField =
									leftTable === model
										? schemaModel[field]
										: leftTable === joinName
											? joinSchema[field]
											: schemaModel[field];
							} else {
								// just field name, assume main table
								leftField = schemaModel[leftParts[0]];
							}

							if (rightParts.length === 2) {
								// table.field format
								const [rightTable, field] = rightParts;
								rightField =
									rightTable === model
										? schemaModel[field]
										: rightTable === joinName
											? joinSchema[field]
											: joinSchema[field];
							} else {
								// just field name, assume joined table
								rightField = joinSchema[rightParts[0]];
							}

							switch (join.type) {
								case "inner":
									query = query.innerJoin(
										joinSchema,
										eq(leftField, rightField),
									);
									break;
								case "left":
									query = query.leftJoin(joinSchema, eq(leftField, rightField));
									break;
								case "right":
									query = query.rightJoin(
										joinSchema,
										eq(leftField, rightField),
									);
									break;
								case "full":
									query = query.fullJoin(joinSchema, eq(leftField, rightField));
									break;
							}
						}
					}

					const res = await query.where(...clause);
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
		},
	});
