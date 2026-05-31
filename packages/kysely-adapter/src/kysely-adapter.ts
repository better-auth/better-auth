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
import { logger } from "@better-auth/core/env";
import type { InsertQueryBuilder, Kysely, UpdateQueryBuilder } from "kysely";
import { sql } from "kysely";
import {
	jsonArrayFrom as jsonArrayFromMssql,
	jsonObjectFrom as jsonObjectFromMssql,
} from "kysely/helpers/mssql";
import {
	jsonArrayFrom as jsonArrayFromMysql,
	jsonObjectFrom as jsonObjectFromMysql,
} from "kysely/helpers/mysql";
import {
	jsonArrayFrom as jsonArrayFromPostgres,
	jsonObjectFrom as jsonObjectFromPostgres,
} from "kysely/helpers/postgres";
import {
	jsonArrayFrom as jsonArrayFromSqlite,
	jsonObjectFrom as jsonObjectFromSqlite,
} from "kysely/helpers/sqlite";
import {
	insensitiveEq,
	insensitiveIlike,
	insensitiveIn,
	insensitiveNe,
	insensitiveNotIn,
} from "./query-builders";
import type { KyselyDatabaseType } from "./types";

interface KyselyAdapterConfig {
	/**
	 * Database type.
	 */
	type?: KyselyDatabaseType | undefined;
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption | undefined;
	/**
	 * Use plural for table names.
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

/**
 * Selects the dialect's JSON aggregation helpers. SQLite helpers are the default
 * for an unset type, matching the rest of the adapter's capability flags.
 */
function getJsonHelpers(type: KyselyDatabaseType | undefined) {
	switch (type) {
		case "postgres":
			return {
				array: jsonArrayFromPostgres,
				object: jsonObjectFromPostgres,
			};
		case "mysql":
			return {
				array: jsonArrayFromMysql,
				object: jsonObjectFromMysql,
			};
		case "mssql":
			return {
				array: jsonArrayFromMssql,
				object: jsonObjectFromMssql,
			};
		case "sqlite":
			return {
				array: jsonArrayFromSqlite,
				object: jsonObjectFromSqlite,
			};
		default:
			// `type` is unset. Fall back to SQLite's JSON syntax. The join path
			// warns so a non-SQLite database gets a real type configured.
			return {
				array: jsonArrayFromSqlite,
				object: jsonObjectFromSqlite,
			};
	}
}

export const kyselyAdapter = (
	db: Kysely<any>,
	config?: KyselyAdapterConfig | undefined,
) => {
	let lazyOptions: BetterAuthOptions | null = null;
	let mysqlNoIdWarned = false;
	let joinTypeWarned = false;
	const createCustomAdapter = (
		db: Kysely<any>,
		inTransaction = false,
	): AdapterFactoryCustomizeAdapterCreator => {
		return ({
			getFieldName,
			schema,
			getDefaultFieldName,
			getDefaultModelName,
			getFieldAttributes,
			getModelName,
			options,
		}) => {
			if (
				config?.type === "mysql" &&
				options.advanced?.database?.generateId === false &&
				!mysqlNoIdWarned
			) {
				mysqlNoIdWarned = true;
				logger.warn(
					"[Kysely Adapter] MySQL does not support INSERT...RETURNING. " +
						"With generateId set to false, the adapter uses best-effort fallback " +
						"strategies (unique columns, full-field match) to retrieve inserted rows. " +
						'For reliable behavior, use Better Auth\'s default ID generation, a custom generateId function, or generateId: "serial" for auto-increment.',
				);
			}
			const { array: jsonArrayFrom, object: jsonObjectFrom } = getJsonHelpers(
				config?.type,
			);

			// Builds one JSON-aggregating correlated subquery per joined model. Each
			// returns its rows pre-nested under the model's name, so there is no
			// flat-join row multiplication to regroup afterwards.
			const joinSelections = (eb: any, join: JoinConfig) => {
				if (config?.type === undefined && !joinTypeWarned) {
					joinTypeWarned = true;
					logger.warn(
						"[Kysely Adapter] No database type is configured, so joins fall back to SQLite JSON functions. " +
							'Set the adapter type to "postgres", "mysql", or "mssql" so the correct JSON syntax is emitted.',
					);
				}
				return Object.entries(join).map(([joinModel, joinAttr]) => {
					const [, joinModelName] = joinModel.includes(".")
						? joinModel.split(".")
						: [undefined, joinModel];
					const alias = `join_${joinModelName}`;
					const idColumn = getFieldName({ model: joinModel, field: "id" });

					const columns = new Set<string>([idColumn]);
					const fields = schema[getDefaultModelName(joinModel)]?.fields;
					if (fields) {
						for (const [field, fieldAttr] of Object.entries(fields)) {
							columns.add(fieldAttr.fieldName || field);
						}
					}

					const inner = eb
						.selectFrom(`${joinModel} as ${alias}`)
						.select([...columns].map((column) => `${alias}.${column}`))
						.whereRef(
							`${alias}.${joinAttr.on.to}`,
							"=",
							`primary.${joinAttr.on.from}`,
						);

					if (joinAttr.relation === "one-to-one") {
						return jsonObjectFrom(inner).as(getModelName(joinModel));
					}

					return jsonArrayFrom(
						inner.orderBy(`${alias}.${idColumn}`).limit(joinAttr.limit ?? 100),
					).as(getModelName(joinModel));
				});
			};

			// JSON aggregates come back as objects on some drivers and as JSON
			// strings on others such as SQLite. Parse the strings so the factory's
			// output transform receives nested objects.
			const parseJoinedRows = (rows: any[], join: JoinConfig) => {
				const joinKeys = Object.keys(join).map((joinModel) =>
					getModelName(joinModel),
				);
				for (const row of rows) {
					for (const key of joinKeys) {
						if (typeof row[key] === "string") {
							row[key] = JSON.parse(row[key]);
						}
					}
				}
				return rows;
			};

			const withReturning = async (
				values: Record<string, any>,
				builder:
					| InsertQueryBuilder<any, any, any>
					| UpdateQueryBuilder<any, string, string, any>,
				model: string,
				where: Where[],
			) => {
				if (config?.type === "mysql") {
					await builder.execute();

					// Updates: re-query by the where clause field
					if (where.length > 0) {
						const field = values.id
							? "id"
							: where[0]?.field
								? where[0].field
								: "id";
						const value =
							values[field] !== undefined ? values[field] : where[0]?.value;
						return await db
							.selectFrom(model)
							.selectAll()
							.where(
								getFieldName({ model, field }),
								value === null ? "is" : "=",
								value,
							)
							.limit(1)
							.executeTakeFirst();
					}

					// Inserts: cascading strategy inside a transaction
					const fetchInserted = async (trx: any) => {
						// 1. Known id from the data
						if (values.id) {
							return await trx
								.selectFrom(model)
								.selectAll()
								.where(getFieldName({ model, field: "id" }), "=", values.id)
								.limit(1)
								.executeTakeFirst();
						}

						// 2. Serial auto-increment: LAST_INSERT_ID()
						if (options.advanced?.database?.generateId === "serial") {
							const lastIdResult =
								await sql`SELECT LAST_INSERT_ID() as id`.execute(trx);
							const lastId = (lastIdResult.rows[0] as any)?.id;
							if (lastId) {
								return await trx
									.selectFrom(model)
									.selectAll()
									.where(getFieldName({ model, field: "id" }), "=", lastId)
									.limit(1)
									.executeTakeFirst();
							}
						}

						// 3. Unique column lookup via Better Auth schema
						const defaultModel = getDefaultModelName(model);
						const modelSchema = schema[defaultModel]?.fields;
						if (modelSchema) {
							for (const [fieldKey, fieldAttr] of Object.entries(modelSchema)) {
								if (!fieldAttr.unique) continue;
								const dbFieldName = getFieldName({
									model,
									field: fieldKey,
								});
								const val = values[dbFieldName];
								if (val === undefined || val === null) continue;
								const row = await trx
									.selectFrom(model)
									.selectAll()
									.where(dbFieldName, "=", val)
									.limit(1)
									.executeTakeFirst();
								if (row) return row;
							}
						}

						// 4. Full-field match (last resort) — LIMIT 2 to detect ambiguity
						let query = trx.selectFrom(model).selectAll();
						let hasConditions = false;
						for (const [key, val] of Object.entries(values)) {
							if (val === undefined) continue;
							query = query.where(key, val === null ? "is" : "=", val);
							hasConditions = true;
						}
						if (hasConditions) {
							const rows = await query.limit(2).execute();
							if (rows.length === 1) return rows[0];
						}

						logger.warn(
							`[Kysely Adapter] Unable to safely identify the inserted "${model}" row on MySQL. ` +
								'Enable Better Auth ID generation or use generateId: "serial" for reliable behavior.',
						);
						return null;
					};

					return inTransaction
						? fetchInserted(db)
						: db.transaction().execute(fetchInserted);
				}
				if (config?.type === "mssql") {
					return await builder.outputAll("inserted").executeTakeFirst();
				}
				return await builder.returningAll().executeTakeFirst();
			};
			function convertWhereClause(model: string, w?: Where[] | undefined) {
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
					const {
						field: _field,
						value: _value,
						operator = "eq",
						connector = "AND",
						mode = "sensitive",
					} = condition;
					const value: any = _value;
					const field: string | any = getFieldName({
						model,
						field: _field,
					});

					const isInsensitive =
						mode === "insensitive" &&
						(typeof value === "string" ||
							(Array.isArray(value) &&
								value.every((v) => typeof v === "string")));

					const expr = (eb: any) => {
						const f = `${model}.${field}`;
						if (operator.toLowerCase() === "in") {
							if (isInsensitive) {
								const arr = Array.isArray(value) ? value : [value];
								const { lhs, values } = insensitiveIn(f, arr);
								return eb(lhs, "in", values);
							}
							return eb(f, "in", Array.isArray(value) ? value : [value]);
						}

						if (operator.toLowerCase() === "not_in") {
							if (isInsensitive) {
								const arr = Array.isArray(value) ? value : [value];
								const { lhs, values } = insensitiveNotIn(f, arr);
								return eb(lhs, "not in", values);
							}
							return eb(f, "not in", Array.isArray(value) ? value : [value]);
						}

						if (operator === "contains") {
							if (isInsensitive && typeof value === "string") {
								return insensitiveIlike(f, `%${value}%`, config?.type);
							}
							return eb(f, "like", `%${value}%`);
						}

						if (operator === "starts_with") {
							if (isInsensitive && typeof value === "string") {
								return insensitiveIlike(f, `${value}%`, config?.type);
							}
							return eb(f, "like", `${value}%`);
						}

						if (operator === "ends_with") {
							if (isInsensitive && typeof value === "string") {
								return insensitiveIlike(f, `%${value}`, config?.type);
							}
							return eb(f, "like", `%${value}`);
						}

						if (operator === "eq") {
							if (value === null) {
								return eb(f, "is", null);
							}
							if (isInsensitive && typeof value === "string") {
								const { lhs, value: v } = insensitiveEq(f, value);
								return eb(lhs, "=", v);
							}
							return eb(f, "=", value);
						}

						if (operator === "ne") {
							if (value === null) {
								return eb(f, "is not", null);
							}
							if (isInsensitive && typeof value === "string") {
								const { lhs, value: v } = insensitiveNe(f, value);
								return eb(lhs, "<>", v);
							}
							return eb(f, "<>", value);
						}

						if (operator === "gt") {
							return eb(f, ">", value);
						}

						if (operator === "gte") {
							return eb(f, ">=", value);
						}

						if (operator === "lt") {
							return eb(f, "<", value);
						}

						if (operator === "lte") {
							return eb(f, "<=", value);
						}

						return eb(f, operator, value);
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
					const returned = await withReturning(data, builder, model, []);
					return returned;
				},
				async findOne({ model, where, select, join }) {
					const { and, or } = convertWhereClause(model, where);
					let query: any = db
						.selectFrom((eb) => {
							let b = eb.selectFrom(model);
							if (and) {
								b = b.where((eb: any) =>
									eb.and(and.map((expr: any) => expr(eb))),
								);
							}
							if (or) {
								b = b.where((eb: any) =>
									eb.or(or.map((expr: any) => expr(eb))),
								);
							}
							if (select?.length && select.length > 0) {
								b = b.select(
									select.map((field) => getFieldName({ model, field })),
								);
							} else {
								b = b.selectAll();
							}
							return b.as("primary");
						})
						.selectAll("primary");

					if (join) {
						query = query.select((eb: any) => joinSelections(eb, join));
					}

					const res = await query.execute();
					if (!res || !Array.isArray(res) || res.length === 0) return null;

					if (join) return parseJoinedRows(res, join)[0] as any;
					return res[0] as any;
				},
				async findMany({ model, where, limit, select, offset, sortBy, join }) {
					const { and, or } = convertWhereClause(model, where);
					let query: any = db
						.selectFrom((eb) => {
							let b = eb.selectFrom(model);

							if (config?.type === "mssql") {
								if (offset !== undefined) {
									if (!sortBy) {
										b = b.orderBy(getFieldName({ model, field: "id" }));
									}
									b = b.offset(offset).fetch(limit || 100);
								} else if (limit !== undefined) {
									b = b.top(limit);
								}
							} else {
								if (limit !== undefined) {
									b = b.limit(limit);
								}
								if (offset !== undefined) {
									b = b.offset(offset);
								}
							}

							if (sortBy?.field) {
								b = b.orderBy(
									`${getFieldName({ model, field: sortBy.field })}`,
									sortBy.direction,
								);
							}

							if (and) {
								b = b.where((eb: any) =>
									eb.and(and.map((expr: any) => expr(eb))),
								);
							}

							if (or) {
								b = b.where((eb: any) =>
									eb.or(or.map((expr: any) => expr(eb))),
								);
							}

							if (select?.length && select.length > 0) {
								b = b.select(
									select.map((field) => getFieldName({ model, field })),
								);
							} else {
								b = b.selectAll();
							}

							return b.as("primary");
						})
						.selectAll("primary");

					if (join) {
						query = query.select((eb: any) => joinSelections(eb, join));
					}

					if (sortBy?.field) {
						query = query.orderBy(
							`${getFieldName({ model, field: sortBy.field })}`,
							sortBy.direction,
						);
					}

					const res = await query.execute();

					if (!res) return [];
					if (join) return parseJoinedRows(res, join);
					return res;
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
					const res = (await query.executeTakeFirst()).numUpdatedRows;
					return res > Number.MAX_SAFE_INTEGER
						? Number.MAX_SAFE_INTEGER
						: Number(res);
				},
				async count({ model, where }) {
					const { and, or } = convertWhereClause(model, where);
					let query = db
						.selectFrom(model)
						// a temporal solution for counting other than "*" - see more - https://www.sqlite.org/quirks.html#double_quoted_string_literals_are_accepted
						.select(db.fn.count("id").as("count"));
					if (and) {
						query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
					}
					if (or) {
						query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
					}
					const res = await query.execute();
					if (typeof res[0]!.count === "number") {
						return res[0]!.count;
					}
					if (typeof res[0]!.count === "bigint") {
						return Number(res[0]!.count);
					}
					return parseInt(res[0]!.count);
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
					const res = (await query.executeTakeFirst()).numDeletedRows;
					return res > Number.MAX_SAFE_INTEGER
						? Number.MAX_SAFE_INTEGER
						: Number(res);
				},
				async consumeOne({ model, where }) {
					const { and, or } = convertWhereClause(model, where);
					const applyWhere = (query: any) => {
						if (and) {
							query = query.where((eb: any) =>
								eb.and(and.map((expr) => expr(eb))),
							);
						}
						if (or) {
							query = query.where((eb: any) =>
								eb.or(or.map((expr) => expr(eb))),
							);
						}
						return query;
					};
					const idField = getFieldName({ model, field: "id" });
					const deleteSelectedRow = async (db: any, row: any) => {
						const targetId = row[idField] ?? row.id;
						if (targetId === undefined || targetId === null) {
							return null;
						}
						const query: any = db
							.deleteFrom(model)
							.where(`${model}.${idField}`, "=", targetId);

						if (config?.type === "mysql") {
							const result = await query.executeTakeFirst();
							return Number(result.numDeletedRows) > 0 ? row : null;
						}

						if (config?.type === "mssql") {
							return (
								(await query.outputAll("deleted").executeTakeFirst()) ?? null
							);
						}

						return (await query.returningAll().executeTakeFirst()) ?? null;
					};
					const deleteWithReturning = async (query: any) => {
						if (config?.type === "mssql") {
							return (
								(await query.outputAll("deleted").executeTakeFirst()) ?? null
							);
						}
						return (await query.returningAll().executeTakeFirst()) ?? null;
					};

					if (config?.type === "mysql") {
						// MySQL does not support `DELETE ... RETURNING`. Hold the row
						// under `SELECT ... FOR UPDATE`, then delete inside the same
						// transaction. Concurrent claimants block until the lock
						// releases, at which point the row is gone and they observe
						// nothing.
						const claimFromTransaction = async (trx: any) => {
							const row = await applyWhere(
								trx.selectFrom(model).selectAll().forUpdate(),
							)
								.limit(1)
								.executeTakeFirst();
							if (!row) return null;
							return deleteSelectedRow(trx, row);
						};
						return inTransaction
							? claimFromTransaction(db)
							: db.transaction().execute(claimFromTransaction);
					}

					const targetIds = applyWhere(
						db.selectFrom(model).select(`${model}.${idField}`),
					).limit(1);
					const query = db
						.deleteFrom(model)
						.where(`${model}.${idField}`, "in", targetIds);
					return deleteWithReturning(query);
				},
				options: config,
			};
		};
	};
	let adapterOptions: AdapterFactoryOptions | null = null;
	adapterOptions = {
		config: {
			adapterId: "kysely",
			adapterName: "Kysely Adapter",
			usePlural: config?.usePlural,
			debugLogs: config?.debugLogs,
			supportsBooleans:
				config?.type === "sqlite" ||
				config?.type === "mssql" ||
				config?.type === "mysql" ||
				!config?.type
					? false
					: true,
			supportsDates:
				config?.type === "sqlite" || config?.type === "mssql" || !config?.type
					? false
					: true,
			supportsJSON:
				config?.type === "postgres"
					? true // even if there is JSON support, only pg supports passing direct json, all others must stringify
					: false,
			supportsArrays: false, // Even if field supports JSON, we must pass stringified arrays to the database.
			supportsUUIDs: config?.type === "postgres" ? true : false,
			transaction: config?.transaction
				? (cb) =>
						db.transaction().execute((trx) => {
							const adapter = createAdapterFactory({
								config: {
									...adapterOptions!.config,
									transaction: false,
								},
								adapter: createCustomAdapter(trx, true),
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
