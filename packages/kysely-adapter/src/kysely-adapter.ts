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
import { capitalizeFirstLetter } from "@better-auth/core/utils/string";
import type {
	InsertQueryBuilder,
	Kysely,
	RawBuilder,
	UpdateQueryBuilder,
} from "kysely";
import { sql } from "kysely";
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
	 *
	 * For `"mysql"`, this adapter depends on the driver returning
	 * "rows matched" counts from `UPDATE`/`DELETE` operations (in
	 * mysql2: `affectedRows`, exposed by Kysely as `numUpdatedRows`).
	 * By default, `mysql2` enables this via the `FOUND_ROWS` client
	 * flag.
	 *
	 * Do not disable this flag. If you remove it (e.g. with
	 * `flags: '-FOUND_ROWS'` in your pool config), MySQL will report
	 * "rows changed" semantics: an idempotent `UPDATE` (where the new
	 * value equals the old value) will show zero affected rows, causing
	 * adapter methods like `update`, `incrementOne`, or `updateMany` to
	 * return `null` or `0` even if a row matched the predicate.
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

export const kyselyAdapter = (
	db: Kysely<any>,
	config?: KyselyAdapterConfig | undefined,
) => {
	let lazyOptions: BetterAuthOptions | null = null;
	let mysqlNoIdWarned = false;
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
			const selectAllJoins = (join: JoinConfig | undefined) => {
				// Use selectAll which will handle column naming appropriately
				const allSelects: RawBuilder<unknown>[] = [];
				const allSelectsStr: {
					joinModel: string;
					joinModelRef: string;
					fieldName: string;
				}[] = [];
				if (join) {
					for (const [joinModel, _] of Object.entries(join)) {
						const fields = schema[getDefaultModelName(joinModel)]?.fields;
						const [_joinModelSchema, joinModelName] = joinModel.includes(".")
							? joinModel.split(".")
							: [undefined, joinModel];

						if (!fields) continue;
						fields.id = { type: "string" }; // make sure there is at least an id field
						for (const [field, fieldAttr] of Object.entries(fields)) {
							allSelects.push(
								sql`${sql.ref(`join_${joinModelName}`)}.${sql.ref(fieldAttr.fieldName || field)} as ${sql.ref(`_joined_${joinModelName}_${fieldAttr.fieldName || field}`)}`,
							);
							allSelectsStr.push({
								joinModel: joinModel,
								joinModelRef: joinModelName,
								fieldName: fieldAttr.fieldName || field,
							});
						}
					}
				}
				return { allSelectsStr, allSelects };
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
					// MySQL has no `UPDATE ... RETURNING`. Execute the update
					// first, then re-select only after the row count confirms
					// that the predicate matched. This keeps guarded updates
					// from reporting success after zero rows matched.
					//
					// The gate assumes "rows matched" semantics in
					// `numUpdatedRows` (mysql2 default via `CLIENT_FOUND_ROWS`).
					// See `KyselyAdapterConfig.type` JSDoc. Disabling that
					// flag swaps to "rows changed" and surfaces idempotent
					// updates as null.
					if (where.length > 0) {
						type Builder = UpdateQueryBuilder<any, string, string, any>;
						const updateResult = await (builder as Builder).executeTakeFirst();
						if (
							!updateResult ||
							Number(updateResult.numUpdatedRows ?? 0) === 0
						) {
							return null;
						}

						// The row count proves a match, not which row to return.
						// Prefer a safe id equality from the update or guard
						// before falling back to the first predicate.
						//
						// `incrementOne` remains the portable primitive for
						// race-safe guarded state transitions.
						const idEqualityWhere = where.find(
							(w) =>
								w.field === "id" &&
								(w.operator === undefined || w.operator === "eq") &&
								w.connector !== "OR" &&
								w.value !== undefined &&
								w.value !== null,
						);
						let reselectField: string;
						let reselectValue: Where["value"];
						if (values.id !== undefined && values.id !== null) {
							reselectField = "id";
							reselectValue = values.id;
						} else if (idEqualityWhere) {
							reselectField = "id";
							reselectValue = idEqualityWhere.value;
						} else if (where[0]?.field) {
							reselectField = where[0].field;
							reselectValue =
								values[reselectField] !== undefined
									? values[reselectField]
									: where[0].value;
						} else {
							return null;
						}

						return await db
							.selectFrom(model)
							.selectAll()
							.where(
								getFieldName({ model, field: reselectField }),
								reselectValue === null ? "is" : "=",
								reselectValue,
							)
							.limit(1)
							.executeTakeFirst();
					}

					await builder.execute();
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

			function processJoinedResults(
				rows: any[],
				joinConfig: JoinConfig | undefined,
				allSelectsStr: {
					joinModel: string;
					joinModelRef: string;
					fieldName: string;
				}[],
			) {
				if (!joinConfig || !rows.length) {
					return rows;
				}

				// Group rows by main model ID
				const groupedByMainId = new Map<string, any>();

				for (const currentRow of rows) {
					// Separate main model columns from joined columns
					const mainModelFields: Record<string, any> = {};
					const joinedModelFields: Record<string, Record<string, any>> = {};

					// Initialize joined model fields map
					for (const [joinModel] of Object.entries(joinConfig)) {
						joinedModelFields[getModelName(joinModel)] = {};
					}

					// Distribute all columns - collect complete objects per model
					for (const [key, value] of Object.entries(currentRow)) {
						const keyStr = String(key);
						let assigned = false;

						// Check if this is a joined column
						for (const {
							joinModel,
							fieldName,
							joinModelRef,
						} of allSelectsStr) {
							if (
								keyStr === `_joined_${joinModelRef}_${fieldName}` ||
								// Edge case to catch capitalized results that derive from snake_case table names
								// If anyone can identify the cause behind this, please note it here.
								keyStr ===
									`_Joined${capitalizeFirstLetter(joinModelRef)}${capitalizeFirstLetter(fieldName)}`
							) {
								joinedModelFields[getModelName(joinModel)]![
									getFieldName({
										model: joinModel,
										field: fieldName,
									})
								] = value;
								assigned = true;
								break;
							}
						}

						if (!assigned) {
							mainModelFields[key] = value;
						}
					}

					const mainId = mainModelFields.id;
					if (!mainId) continue;

					// Initialize or get existing entry for this main model
					if (!groupedByMainId.has(mainId)) {
						const entry: Record<string, any> = { ...mainModelFields };

						// Initialize joined models based on uniqueness
						for (const [joinModel, joinAttr] of Object.entries(joinConfig)) {
							entry[getModelName(joinModel)] =
								joinAttr.relation === "one-to-one" ? null : [];
						}

						groupedByMainId.set(mainId, entry);
					}

					const entry = groupedByMainId.get(mainId)!;

					// Add joined records to the entry
					for (const [joinModel, joinAttr] of Object.entries(joinConfig)) {
						const isUnique = joinAttr.relation === "one-to-one";
						const limit = joinAttr.limit ?? 100;

						const joinedObj = joinedModelFields[getModelName(joinModel)];

						const hasData =
							joinedObj &&
							Object.keys(joinedObj).length > 0 &&
							Object.values(joinedObj).some(
								(value) => value !== null && value !== undefined,
							);

						if (isUnique) {
							entry[getModelName(joinModel)] = hasData ? joinedObj : null;
						} else {
							// For arrays, append if not already there (deduplicate by id) and respect limit
							const joinModelName = getModelName(joinModel);
							if (Array.isArray(entry[joinModelName]) && hasData) {
								// Check if we've reached the limit before processing
								if (entry[joinModelName].length >= limit) {
									continue;
								}

								// Get the id field name using getFieldName to ensure correct transformation
								const idFieldName = getFieldName({
									model: joinModel,
									field: "id",
								});
								const joinedId = joinedObj[idFieldName];

								// Only deduplicate if we have an id field
								if (joinedId) {
									const exists = entry[joinModelName].some(
										(item: any) => item[idFieldName] === joinedId,
									);
									if (!exists && entry[joinModelName].length < limit) {
										entry[joinModelName].push(joinedObj);
									}
								} else {
									// If no id field, still add the object if it has data and limit not reached
									if (entry[joinModelName].length < limit) {
										entry[joinModelName].push(joinedObj);
									}
								}
							}
						}
					}
				}

				const result = Array.from(groupedByMainId.values());

				// Apply final limit to non-unique join arrays as a safety measure
				for (const entry of result) {
					for (const [joinModel, joinAttr] of Object.entries(joinConfig)) {
						if (joinAttr.relation !== "one-to-one") {
							const joinModelName = getModelName(joinModel);
							if (Array.isArray(entry[joinModelName])) {
								const limit = joinAttr.limit ?? 100;
								if (entry[joinModelName].length > limit) {
									entry[joinModelName] = entry[joinModelName].slice(0, limit);
								}
							}
						}
					}
				}

				return result;
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
						for (const [joinModel, joinAttr] of Object.entries(join)) {
							const [_joinModelSchema, joinModelName] = joinModel.includes(".")
								? joinModel.split(".")
								: [undefined, joinModel];

							query = query.leftJoin(
								`${joinModel} as join_${joinModelName}`,
								(join: any) =>
									join.onRef(
										`join_${joinModelName}.${joinAttr.on.to}`,
										"=",
										`primary.${joinAttr.on.from}`,
									),
							);
						}
					}

					const { allSelectsStr, allSelects } = selectAllJoins(join);
					query = query.select(allSelects);

					const res = await query.execute();
					if (!res || !Array.isArray(res) || res.length === 0) return null;

					// Get the first row from the result array
					const row = res[0];

					if (join) {
						const processedRows = processJoinedResults(
							res,
							join,
							allSelectsStr,
						);

						return processedRows[0] as any;
					}

					return row as any;
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
						for (const [joinModel, joinAttr] of Object.entries(join)) {
							// it's possible users provide a schema name in the model name (`<schema>.<model>`)
							const [_joinModelSchema, joinModelName] = joinModel.includes(".")
								? joinModel.split(".")
								: [undefined, joinModel];

							query = query.leftJoin(
								`${joinModel} as join_${joinModelName}`,
								(join: any) =>
									join.onRef(
										`join_${joinModelName}.${joinAttr.on.to}`,
										"=",
										`primary.${joinAttr.on.from}`,
									),
							);
						}
					}

					const { allSelectsStr, allSelects } = selectAllJoins(join);

					query = query.select(allSelects);

					if (sortBy?.field) {
						query = query.orderBy(
							`${getFieldName({ model, field: sortBy.field })}`,
							sortBy.direction,
						);
					}

					const res = await query.execute();

					if (!res) return [];
					if (join) return processJoinedResults(res, join, allSelectsStr);
					return res;
				},
				async update({ model, where, update: values }) {
					// `update` is the single-row variant; an empty `where`
					// would otherwise compile to `UPDATE table SET ...` with
					// no predicate and mutate every row in the table. Treat
					// it as an invalid call and return null on every dialect.
					// Use `updateMany` if a bulk update is actually intended.
					if (where.length === 0) {
						return null;
					}
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

					const selectIds = applyWhere(
						db.selectFrom(model).select(`${model}.${idField}`),
					);
					// SQL Server has no `LIMIT`; a `top(1)` subquery is the
					// server-correct single-row form. Every other dialect uses
					// `limit(1)`.
					const targetIds =
						config?.type === "mssql" ? selectIds.top(1) : selectIds.limit(1);
					const query = db
						.deleteFrom(model)
						.where(`${model}.${idField}`, "in", targetIds);
					return deleteWithReturning(query);
				},
				async incrementOne({ model, where, increment, set }) {
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
					// Each increment field becomes a self-referential assignment
					// (`field = field + delta`) so the database, not the
					// application, performs the arithmetic atomically. Absolute
					// `set` assignments are applied in the same statement.
					const assignments: Record<string, any> = { ...(set ?? {}) };
					for (const [field, delta] of Object.entries(increment)) {
						assignments[field] = sql`${sql.ref(field)} + ${delta}`;
					}
					const idField = getFieldName({ model, field: "id" });

					if (config?.type === "mysql") {
						// MySQL does not support `UPDATE ... RETURNING`. Hold the
						// target row under `SELECT ... FOR UPDATE`, apply the guarded
						// update inside the same transaction, then read the row back.
						// Concurrent claimants block on the lock; a racer that
						// invalidated the guard observes zero updated rows.
						const incrementInTransaction = async (trx: any) => {
							const target = await applyWhere(
								trx.selectFrom(model).select(`${model}.${idField}`).forUpdate(),
							)
								.limit(1)
								.executeTakeFirst();
							if (!target) return null;
							const targetId = target[idField] ?? target.id;
							if (targetId === undefined || targetId === null) return null;
							const updated = await applyWhere(
								trx.updateTable(model).set(assignments),
							)
								.where(`${model}.${idField}`, "=", targetId)
								.executeTakeFirst();
							if (Number(updated.numUpdatedRows) === 0) return null;
							return (
								(await trx
									.selectFrom(model)
									.selectAll()
									.where(`${model}.${idField}`, "=", targetId)
									.limit(1)
									.executeTakeFirst()) ?? null
							);
						};
						return inTransaction
							? incrementInTransaction(db)
							: db.transaction().execute(incrementInTransaction);
					}

					// Scope the update to a single matching row by targeting
					// `id IN (SELECT id WHERE guard LIMIT 1)`, mirroring consumeOne. A
					// bare guarded UPDATE would mutate every matching row, violating the
					// single-row contract when the guard is non-unique.
					const selectIds = applyWhere(
						db.selectFrom(model).select(`${model}.${idField}`),
					);
					// SQL Server has no `LIMIT`; a `top(1)` subquery is the
					// server-correct single-row form. Every other dialect uses
					// `limit(1)`.
					const targetIds =
						config?.type === "mssql" ? selectIds.top(1) : selectIds.limit(1);
					const updateQuery = db
						.updateTable(model)
						.set(assignments)
						.where(`${model}.${idField}`, "in", targetIds);
					if (config?.type === "mssql") {
						return (
							(await updateQuery.outputAll("inserted").executeTakeFirst()) ??
							null
						);
					}
					return (await updateQuery.returningAll().executeTakeFirst()) ?? null;
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
