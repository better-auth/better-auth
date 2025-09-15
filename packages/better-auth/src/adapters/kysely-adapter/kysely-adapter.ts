import { createAdapter, type AdapterDebugLogs } from "../create-adapter";
import type { Where } from "../../types";
import type { KyselyDatabaseType } from "./types";
import type { InsertQueryBuilder, Kysely, UpdateQueryBuilder } from "kysely";

interface KyselyAdapterConfig {
	/**
	 * Database type.
	 */
	type?: KyselyDatabaseType;
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: AdapterDebugLogs;
	/**
	 * Use plural for table names.
	 *
	 * @default false
	 */
	usePlural?: boolean;
}

export const kyselyAdapter = (db: Kysely<any>, config?: KyselyAdapterConfig) =>
	createAdapter({
		config: {
			adapterId: "kysely",
			adapterName: "Kysely Adapter",
			usePlural: config?.usePlural,
			debugLogs: config?.debugLogs,
			supportsBooleans:
				config?.type === "sqlite" || config?.type === "mssql" || !config?.type
					? false
					: true,
			supportsDates:
				config?.type === "sqlite" || config?.type === "mssql" || !config?.type
					? false
					: true,
			supportsJSON: false,
		},
		adapter: ({ getFieldName, schema }) => {
			const withReturning = async (
				values: Record<string, any>,
				builder:
					| InsertQueryBuilder<any, any, any>
					| UpdateQueryBuilder<any, string, string, any>,
				model: string,
				where: Where[],
			) => {
				let res: any;
				if (config?.type === "mysql") {
					// This isn't good, but kysely doesn't support returning in mysql and it doesn't return the inserted id.
					// Change this if there is a better way.
					await builder.execute();
					const field = values.id
						? "id"
						: where.length > 0 && where[0].field
							? where[0].field
							: "id";

					if (!values.id && where.length === 0) {
						res = await db
							.selectFrom(model)
							.selectAll()
							.orderBy(getFieldName({ model, field }), "desc")
							.limit(1)
							.executeTakeFirst();
						return res;
					}

					const value = values[field] || where[0].value;
					res = await db
						.selectFrom(model)
						.selectAll()
						.orderBy(getFieldName({ model, field }), "desc")
						.where(getFieldName({ model, field }), "=", value)
						.limit(1)
						.executeTakeFirst();
					return res;
				}
				if (config?.type === "mssql") {
					res = await builder.outputAll("inserted").executeTakeFirst();
					return res;
				}
				res = await builder.returningAll().executeTakeFirst();
				return res;
			};
			function transformValueToDB(value: any, model: string, field: string) {
				if (field === "id") {
					return value;
				}
				const { type = "sqlite" } = config || {};
				let f = schema[model]?.fields[field];
				if (!f) {
					//@ts-expect-error - The model name can be a sanitized, thus using the custom model name, not one of the default ones.
					f = Object.values(schema).find((f) => f.modelName === model)!;
				}
				if (
					f.type === "boolean" &&
					(type === "sqlite" || type === "mssql") &&
					value !== null &&
					value !== undefined
				) {
					return value ? 1 : 0;
				}
				if (f.type === "date" && value && value instanceof Date) {
					return type === "sqlite" ? value.toISOString() : value;
				}
				return value;
			}

			function convertWhereClause(model: string, w?: Where[], joins?: any[]) {
				if (!w)
					return {
						and: null,
						or: null,
					};

				const conditions = {
					and: [] as any[],
					or: [] as any[],
				};

				w.forEach((condition) => {
					let {
						field: _field,
						value,
						operator = "=",
						connector = "AND",
					} = condition;
					let field = getFieldName({ model, field: _field });

					// Qualify field names when joins are present to avoid ambiguity
					if (joins && joins.length > 0) {
						field = `${model}.${field}`;
					}

					value = transformValueToDB(value, model, _field);
					const expr = (eb: any) => {
						if (operator.toLowerCase() === "in") {
							return eb(field, "in", Array.isArray(value) ? value : [value]);
						}

						if (operator.toLowerCase() === "not_in") {
							return eb(
								field,
								"not in",
								Array.isArray(value) ? value : [value],
							);
						}

						if (operator === "contains") {
							return eb(field, "like", `%${value}%`);
						}

						if (operator === "starts_with") {
							return eb(field, "like", `${value}%`);
						}

						if (operator === "ends_with") {
							return eb(field, "like", `%${value}`);
						}

						if (operator === "eq") {
							return eb(field, "=", value);
						}

						if (operator === "ne") {
							return eb(field, "<>", value);
						}

						if (operator === "gt") {
							return eb(field, ">", value);
						}

						if (operator === "gte") {
							return eb(field, ">=", value);
						}

						if (operator === "lt") {
							return eb(field, "<", value);
						}

						if (operator === "lte") {
							return eb(field, "<=", value);
						}

						return eb(field, operator, value);
					};

					if (connector === "OR") {
						conditions.or.push(expr);
					} else {
						conditions.and.push(expr);
					}
				});

				return {
					and: conditions.and.length ? conditions.and : null,
					or: conditions.or.length ? conditions.or : null,
				};
			}
			return {
				async create({ data, model }) {
					const builder = db.insertInto(model).values(data);

					return (await withReturning(data, builder, model, [])) as any;
				},
				async findOne({ model, where, select, joins }) {
					const { and, or } = convertWhereClause(model, where, joins);
					let query = db.selectFrom(model);

					// Handle joins
					if (joins && joins.length > 0) {
						for (const join of joins) {
							const joinTableRef = join.alias
								? `${join.table} as ${join.alias}`
								: join.table;
							const joinName = join.alias || join.table;
							switch (join.type) {
								case "inner":
									query = query.innerJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "left":
									query = query.leftJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "right":
									query = query.rightJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "full":
									query = query.fullJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
							}
						}

						// For joins, get table metadata to select columns explicitly
						// This avoids mixing selectAll() with additional select() calls which causes ambiguity
						try {
							const metadata = await db.introspection.getTables();
							const mainTable = metadata.find((t) => t.name === model);

							if (mainTable) {
								// Select all columns from main table with qualified names only (no aliases)
								// This prevents ambiguity as we don't duplicate column names in the result
								for (const column of mainTable.columns) {
									query = query.select(`${model}.${column.name}` as any);
								}
							} else {
								// Fallback to qualified selectAll if metadata not available
								query = query.selectAll(model as any);
							}
						} catch {
							// Fallback to qualified selectAll if introspection fails
							query = query.selectAll(model as any);
						}

						for (const join of joins) {
							const joinName = join.alias || join.table;
							if (join.select && join.select.length > 0) {
								for (const field of join.select) {
									query = query.select(
										`${joinName}.${field} as ${joinName}_${field}` as any,
									);
								}
							} else {
								// When no specific fields are specified, we default to selecting all fields
								// But to avoid ambiguity, we require join.select to be specified
								// This is a limitation to prevent SQL ambiguity errors
								console.warn(
									`JOIN on table '${joinName}' without specific field selection may cause column ambiguity. Please specify join.select.`,
								);
							}
						}
					} else {
						query = query.selectAll();
					}

					if (and) {
						query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
					}
					if (or) {
						query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
					}
					const res = await query.executeTakeFirst();
					if (!res) return null;
					return res as any;
				},
				async findMany({ model, where, limit, offset, sortBy, joins }) {
					const { and, or } = convertWhereClause(model, where, joins);
					let query = db.selectFrom(model);

					// Handle joins
					if (joins && joins.length > 0) {
						for (const join of joins) {
							const joinTableRef = join.alias
								? `${join.table} as ${join.alias}`
								: join.table;
							const joinName = join.alias || join.table;
							switch (join.type) {
								case "inner":
									query = query.innerJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "left":
									query = query.leftJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "right":
									query = query.rightJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "full":
									query = query.fullJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
							}
						}

						// For joins, get table metadata to select columns explicitly
						// This avoids mixing selectAll() with additional select() calls which causes ambiguity
						try {
							const metadata = await db.introspection.getTables();
							const mainTable = metadata.find((t) => t.name === model);

							if (mainTable) {
								// Select all columns from main table with qualified names only (no aliases)
								// This prevents ambiguity as we don't duplicate column names in the result
								for (const column of mainTable.columns) {
									query = query.select(`${model}.${column.name}` as any);
								}
							} else {
								// Fallback to qualified selectAll if metadata not available
								query = query.selectAll(model as any);
							}
						} catch {
							// Fallback to qualified selectAll if introspection fails
							query = query.selectAll(model as any);
						}

						for (const join of joins) {
							const joinName = join.alias || join.table;
							if (join.select && join.select.length > 0) {
								for (const field of join.select) {
									query = query.select(
										`${joinName}.${field} as ${joinName}_${field}` as any,
									);
								}
							} else {
								// When no specific fields are specified, we default to selecting all fields
								// But to avoid ambiguity, we require join.select to be specified
								// This is a limitation to prevent SQL ambiguity errors
								console.warn(
									`JOIN on table '${joinName}' without specific field selection may cause column ambiguity. Please specify join.select.`,
								);
							}
						}
					} else {
						query = query.selectAll();
					}

					if (and) {
						query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
					}
					if (or) {
						query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
					}
					if (config?.type === "mssql") {
						if (!offset) {
							query = query.top(limit || 100);
						}
					} else {
						query = query.limit(limit || 100);
					}
					if (sortBy) {
						query = query.orderBy(
							getFieldName({ model, field: sortBy.field }),
							sortBy.direction,
						);
					}
					if (offset) {
						if (config?.type === "mssql") {
							if (!sortBy) {
								query = query.orderBy(getFieldName({ model, field: "id" }));
							}
							query = query.offset(offset).fetch(limit || 100);
						} else {
							query = query.offset(offset);
						}
					}

					const res = await query.execute();
					if (!res) return [];
					return res as any;
				},
				async update({ model, where, update: values }) {
					const { and, or } = convertWhereClause(model, where);

					let query = db.updateTable(model).set(values as any);
					if (and) {
						query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
					}
					if (or) {
						query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
					}
					return await withReturning(values as any, query, model, where);
				},
				async updateMany({ model, where, update: values }) {
					const { and, or } = convertWhereClause(model, where);
					let query = db.updateTable(model).set(values as any);
					if (and) {
						query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
					}
					if (or) {
						query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
					}
					const res = await query.execute();
					return res.length;
				},
				async count({ model, where, joins }) {
					const { and, or } = convertWhereClause(model, where, joins);
					let query = db.selectFrom(model);

					// Handle joins
					if (joins && joins.length > 0) {
						for (const join of joins) {
							const joinTableRef = join.alias
								? `${join.table} as ${join.alias}`
								: join.table;
							switch (join.type) {
								case "inner":
									query = query.innerJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "left":
									query = query.leftJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "right":
									query = query.rightJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
								case "full":
									query = query.fullJoin(
										joinTableRef as any,
										join.on.left as any,
										join.on.right as any,
									);
									break;
							}
						}
						// When JOINing, qualify the id column to avoid ambiguity
						query = query.select(db.fn.count(`${model}.id`).as("count"));
					} else {
						// a temporal solution for counting other than "*" - see more - https://www.sqlite.org/quirks.html#double_quoted_string_literals_are_accepted
						query = query.select(db.fn.count("id").as("count"));
					}

					if (and) {
						query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
					}
					if (or) {
						query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
					}
					const res = await query.execute();
					return (res[0] as any).count as number;
				},
				async delete({ model, where }) {
					const { and, or } = convertWhereClause(model, where);
					let query = db.deleteFrom(model);
					if (and) {
						query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
					}

					if (or) {
						query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
					}
					await query.execute();
				},
				async deleteMany({ model, where }) {
					const { and, or } = convertWhereClause(model, where);
					let query = db.deleteFrom(model);
					if (and) {
						query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
					}
					if (or) {
						query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
					}
					return (await query.execute()).length;
				},
				options: config,
			};
		},
	});
