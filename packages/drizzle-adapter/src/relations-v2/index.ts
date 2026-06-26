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
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import {
	escapedLike,
	insensitiveEq,
	insensitiveInArray,
	insensitiveNe,
	insensitiveNotInArray,
} from "../query-builders";

export interface DB {
	[key: string]: any;
}

function escapeLikePattern(
	value: string | number | boolean | string[] | number[] | Date | null,
): string {
	if (value == null) return "";
	// Escape the backslash first so the `\` added for `%` and `_` is not
	// re-escaped, and a literal backslash in the input stays literal under the
	// `ESCAPE '\'` clause.
	return String(value)
		.replace(/\\/g, "\\\\")
		.replace(/%/g, "\\%")
		.replace(/_/g, "\\_");
}

/**
 * Derive the number of affected rows from a Drizzle write result.
 *
 * Drizzle's drivers report affected rows under different shapes: node-postgres
 * exposes `rowCount`, postgres-js returns an Array subclass with the count on
 * `.count`, mysql2 reports `affectedRows`/`rowsAffected` (sometimes as the first
 * element of a result-header array), and better-sqlite3 uses `changes`. The
 * adapter contract requires `updateMany`/`deleteMany` to return a finite number.
 * The factory throws otherwise.
 *
 * @see https://github.com/porsager/postgres#result-array
 */
function getAffectedRowCount(
	result: unknown,
	operation: "updateMany" | "deleteMany" | "consumeOne",
	context: { model: string; where: Where[] },
): number {
	let count: unknown = 0;
	if (result && typeof result === "object" && "rowCount" in result) {
		count = (result as { rowCount: unknown }).rowCount;
	} else if (
		result &&
		typeof result === "object" &&
		typeof (result as { count?: unknown }).count === "number"
	) {
		// postgres-js returns an Array subclass whose affected-row count lives on
		// `.count`. A non-returning UPDATE/DELETE has length 0, so this must be
		// read before the Array branch short-circuits to `result.length`.
		count = (result as { count: number }).count;
	} else if (Array.isArray(result)) {
		count =
			result.length > 0 && hasDriverRowCount(result[0])
				? readDriverRowCount(result[0])
				: result.length;
	} else if (hasDriverRowCount(result)) {
		count = readDriverRowCount(result);
	}
	if (typeof count !== "number" || !Number.isFinite(count)) {
		logger.error(
			`[Drizzle Adapter] The result of the ${operation} operation is not a finite number. This is likely a bug in the adapter. Please report this issue to the Better Auth team.`,
			{ result, ...context },
		);
		throw new BetterAuthError(
			`Drizzle adapter ${operation} returned an invalid affected row count`,
		);
	}
	return count;
}

function hasDriverRowCount(result: unknown): boolean {
	return (
		!!result &&
		typeof result === "object" &&
		("affectedRows" in result ||
			"rowsAffected" in result ||
			"changes" in result)
	);
}

function readDriverRowCount(result: unknown): unknown {
	const r = result as {
		affectedRows?: unknown;
		rowsAffected?: unknown;
		changes?: unknown;
	};
	return r.affectedRows ?? r.rowsAffected ?? r.changes;
}

/**
 * Maps a single Where entry to a drizzle SQL expression.
 * Shared by convertWhereClause across single / AND / OR branches.
 */
function applyWhereOperator(
	column: any,
	w: Where,
	fieldLabel: string,
	provider: "pg" | "mysql" | "sqlite",
): SQL<unknown> {
	const mode = w.mode ?? "sensitive";
	const isInsensitive =
		mode === "insensitive" &&
		(typeof w.value === "string" ||
			(Array.isArray(w.value) && w.value.every((v) => typeof v === "string")));

	if (w.operator === "in") {
		if (!Array.isArray(w.value)) {
			throw new BetterAuthError(
				`The value for the field "${fieldLabel}" must be an array when using the "in" operator.`,
			);
		}
		if (isInsensitive) {
			return insensitiveInArray(column, w.value as string[]);
		}
		return inArray(column, w.value);
	}
	if (w.operator === "not_in") {
		if (!Array.isArray(w.value)) {
			throw new BetterAuthError(
				`The value for the field "${fieldLabel}" must be an array when using the "not_in" operator.`,
			);
		}
		if (isInsensitive) {
			return insensitiveNotInArray(column, w.value as string[]);
		}
		return notInArray(column, w.value);
	}
	const likeMode =
		isInsensitive && typeof w.value === "string" ? "insensitive" : "sensitive";
	if (w.operator === "contains") {
		return escapedLike(
			column,
			`%${escapeLikePattern(w.value)}%`,
			provider,
			likeMode,
		);
	}
	if (w.operator === "starts_with") {
		return escapedLike(
			column,
			`${escapeLikePattern(w.value)}%`,
			provider,
			likeMode,
		);
	}
	if (w.operator === "ends_with") {
		return escapedLike(
			column,
			`%${escapeLikePattern(w.value)}`,
			provider,
			likeMode,
		);
	}
	if (w.operator === "lt") {
		return lt(column, w.value);
	}
	if (w.operator === "lte") {
		return lte(column, w.value);
	}
	if (w.operator === "ne") {
		if (w.value === null) {
			return isNotNull(column);
		}
		if (isInsensitive && typeof w.value === "string") {
			return insensitiveNe(column, w.value);
		}
		return ne(column, w.value);
	}
	if (w.operator === "gt") {
		return gt(column, w.value);
	}
	if (w.operator === "gte") {
		return gte(column, w.value);
	}
	// eq operator (default)
	if (w.value === null) {
		return isNull(column);
	}
	if (isInsensitive && typeof w.value === "string") {
		return insensitiveEq(column, w.value);
	}
	return eq(column, w.value);
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
	let mysqlNoIdWarned = false;
	const createCustomAdapter =
		(db: DB, inTransaction = false): AdapterFactoryCustomizeAdapterCreator =>
		({ getFieldName, getDefaultModelName, options, schema: baSchema }) => {
			if (
				config.provider === "mysql" &&
				options.advanced?.database?.generateId === false &&
				!mysqlNoIdWarned
			) {
				mysqlNoIdWarned = true;
				logger.warn(
					"[Drizzle Adapter] MySQL does not support INSERT...RETURNING. " +
						"With generateId set to false, the adapter uses best-effort fallback " +
						"strategies (unique columns, full-field match) to retrieve inserted rows. " +
						'For reliable behavior, use Better Auth\'s default ID generation, a custom generateId function, or generateId: "serial" for auto-increment.',
				);
			}

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

			/**
			 * Resolve the `db.query` key for a model.
			 *
			 * `db.query` is keyed by the Drizzle schema export names, which are
			 * often plural ("users") even when Better Auth uses singular model
			 * names. Try the model directly, then the `usePlural` variant, then
			 * scan the schema for the key pointing at the same table.
			 */
			function getQueryModel(model: string): string | null {
				if (!db.query) return null;
				if (db.query[model]) return model;

				if (config.usePlural) {
					const plural = `${model}s`;
					if (db.query[plural]) return plural;
				}

				if (config.schema) {
					const targetTable = config.schema[model];
					if (targetTable) {
						// `db.query` is keyed by the relations export names, so map each
						// key back to its table to find the one for this model.
						// `db._.relations` is the relations-v2 internal and
						// `db._.fullSchema` the v1 RQB one, so check both to survive the
						// drizzle-orm beta to 1.0 transition.
						const relations = db._?.relations;
						const fullSchema = db._?.fullSchema;
						for (const key of Object.keys(db.query)) {
							const table = relations?.[key]?.table ?? fullSchema?.[key];
							if (table === targetTable) {
								return key;
							}
						}
					}
				}

				return null;
			}
			/**
			 * Mirror the schema generator's relation-key naming. One-to-one keeps
			 * the singular model name. One-to-many is pluralized unless the model
			 * already ends in "s" or `usePlural` keeps the schema keys as-is.
			 */
			function getJoinRelationKey(model: string, isUnique: boolean) {
				if (isUnique || config.usePlural || model.endsWith("s")) return model;
				return `${model}s`;
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
				}

				const fetchInserted = async (tx: DB) => {
					// 1. Known id from the Drizzle builder internals
					const builderId = builderVal?.[0]?.id?.value;
					if (builderId) {
						const res = await tx
							.select()
							.from(schemaModel)
							.where(eq(schemaModel.id, builderId))
							.limit(1)
							.execute();
						return res[0] ?? null;
					}

					// 2. Known id from the data object
					if (data.id) {
						const res = await tx
							.select()
							.from(schemaModel)
							.where(eq(schemaModel.id, data.id))
							.limit(1)
							.execute();
						return res[0] ?? null;
					}

					// 3. Serial auto-increment: LAST_INSERT_ID() is connection-scoped
					if (
						options.advanced?.database?.generateId === "serial" &&
						schemaModel.id
					) {
						const lastInsertId = await tx
							.select({ id: sql`LAST_INSERT_ID()` })
							.from(schemaModel)
							.limit(1)
							.execute();
						const lastId = lastInsertId[0]?.id;
						if (lastId) {
							const res = await tx
								.select()
								.from(schemaModel)
								.where(eq(schemaModel.id, lastId))
								.limit(1)
								.execute();
							return res[0] ?? null;
						}
					}

					// 4. Unique column lookup via Better Auth schema
					const modelSchema = baSchema[getDefaultModelName(model)]?.fields;
					if (modelSchema) {
						for (const [fieldKey, fieldAttr] of Object.entries(modelSchema)) {
							if (!fieldAttr.unique) continue;
							const dbFieldName = getFieldName({ model, field: fieldKey });
							const val = data[dbFieldName];
							if (val === undefined || val === null) continue;
							if (!schemaModel[dbFieldName]) continue;
							const res = await tx
								.select()
								.from(schemaModel)
								.where(eq(schemaModel[dbFieldName], val))
								.limit(1)
								.execute();
							if (res[0]) return res[0];
						}
					}

					// 5. Full-field match (last resort) — LIMIT 2 to detect ambiguity
					const conditions: SQL<unknown>[] = [];
					for (const [key, val] of Object.entries(data)) {
						if (val === undefined || !schemaModel[key]) continue;
						conditions.push(
							val === null
								? isNull(schemaModel[key])
								: eq(schemaModel[key], val),
						);
					}
					if (conditions.length > 0) {
						const combined = and(...conditions);
						if (combined) {
							const res = await tx
								.select()
								.from(schemaModel)
								.where(combined)
								.limit(2)
								.execute();
							if (res.length === 1) return res[0];
						}
					}

					logger.warn(
						`[Drizzle Adapter] Unable to safely identify the inserted "${model}" row on MySQL. ` +
							'Enable Better Auth ID generation or use generateId: "serial" for reliable behavior.',
					);
					return null;
				};

				return inTransaction
					? fetchInserted(db)
					: db.transaction(fetchInserted);
			};
			function resolveColumn(model: string, w: Where) {
				const schemaModel = getSchema(model);
				const field = getFieldName({ model, field: w.field });
				if (!schemaModel[field]) {
					throw new BetterAuthError(
						`The field "${w.field}" does not exist in the schema for the model "${model}". Please update your schema.`,
					);
				}
				return { column: schemaModel[field], field };
			}

			function convertWhereClause(where: Where[], model: string) {
				if (!where) return [];
				if (where.length === 1) {
					const w = where[0];
					if (!w) {
						return [];
					}
					const { column } = resolveColumn(model, w);
					return [applyWhereOperator(column, w, w.field, config.provider)];
				}
				const andGroup = where.filter(
					(w) => w.connector === "AND" || !w.connector,
				);
				const orGroup = where.filter((w) => w.connector === "OR");

				const andClause = and(
					...andGroup.map((w) => {
						const { column } = resolveColumn(model, w);
						return applyWhereOperator(column, w, w.field, config.provider);
					}),
				);
				const orClause = or(
					...orGroup.map((w) => {
						const { column } = resolveColumn(model, w);
						return applyWhereOperator(column, w, w.field, config.provider);
					}),
				);

				// `.where()` takes one condition, so combine both groups with `and()`
				// instead of passing two (Drizzle keeps only the first).
				const combined = and(andClause, orClause);
				return combined ? [combined] : [];
			}

			function convertNewWhereClause(where: Where[], model: string) {
				const schemaModel = getSchema(model);
				if (!where || where.length === 0) {
					return {};
				}

				// The object filter cannot express an ESCAPE clause (LIKE) or portable
				// case-insensitive matching, so those conditions go through `RAW`.
				// applyWhereOperator builds the same SQL as the non-relational path,
				// and the callback form lets Drizzle supply the aliased column.
				const rawCondition = (w: Where, field: string) => ({
					RAW: (table: Record<string, any>) =>
						applyWhereOperator(table[field], w, w.field, config.provider),
				});

				const convertWhereToColumn = (w: Where) => {
					const field = getFieldName({ model, field: w.field });
					if (!schemaModel[field]) {
						throw new BetterAuthError(
							`The field "${w.field}" does not exist in the schema for the model "${model}". Please update your schema.`,
						);
					}

					const columnObj: Record<string, any> = {};
					let raw: ReturnType<typeof rawCondition> | undefined;

					const isInsensitive =
						w.mode === "insensitive" &&
						(typeof w.value === "string" ||
							(Array.isArray(w.value) &&
								w.value.every((v) => typeof v === "string")));
					const isLikeOperator =
						w.operator === "contains" ||
						w.operator === "starts_with" ||
						w.operator === "ends_with";

					if (isLikeOperator || isInsensitive) {
						raw = rawCondition(w, field);
					} else if (w.operator === "in") {
						if (!Array.isArray(w.value)) {
							throw new BetterAuthError(
								`The value for the field "${w.field}" must be an array when using the "in" operator.`,
							);
						}
						columnObj.in = w.value;
					} else if (w.operator === "not_in") {
						if (!Array.isArray(w.value)) {
							throw new BetterAuthError(
								`The value for the field "${w.field}" must be an array when using the "not_in" operator.`,
							);
						}
						columnObj.notIn = w.value;
					} else if (w.operator === "lt") {
						columnObj.lt = w.value;
					} else if (w.operator === "lte") {
						columnObj.lte = w.value;
					} else if (w.operator === "ne") {
						if (w.value === null) {
							columnObj.isNotNull = true;
						} else {
							columnObj.ne = w.value;
						}
					} else if (w.operator === "gt") {
						columnObj.gt = w.value;
					} else if (w.operator === "gte") {
						columnObj.gte = w.value;
					} else if (w.value === null) {
						columnObj.isNull = true;
					} else {
						columnObj.eq = w.value;
					}

					return { field, columnObj, raw };
				};

				if (where.length === 1) {
					const w = where[0];
					if (!w) {
						return {};
					}
					const { field, columnObj, raw } = convertWhereToColumn(w);
					return raw ?? { [field]: columnObj };
				}

				const andGroup = where.filter(
					(w) => w.connector === "AND" || !w.connector,
				);
				const orGroup = where.filter((w) => w.connector === "OR");

				const result: Record<string, any> = {};

				if (andGroup.length > 0) {
					const fieldMap: Record<string, any[]> = {};
					// RAW LIKE conditions are ANDed as siblings.
					const rawConditions: any[] = [];

					for (const w of andGroup) {
						const { field, columnObj, raw } = convertWhereToColumn(w);
						if (raw) {
							rawConditions.push(raw);
							continue;
						}
						if (!fieldMap[field]) {
							fieldMap[field] = [];
						}
						fieldMap[field].push(columnObj);
					}

					// Build field conditions - multiple fields are implicitly ANDed
					for (const [field, conditions] of Object.entries(fieldMap)) {
						if (conditions.length === 1) {
							result[field] = conditions[0];
						} else {
							// Multiple conditions for same field - use AND array
							result[field] = {
								AND: conditions,
							};
						}
					}

					if (rawConditions.length > 0) {
						result.AND = rawConditions;
					}
				}

				if (orGroup.length > 0) {
					const orConditions: any[] = [];

					for (const w of orGroup) {
						const { field, columnObj, raw } = convertWhereToColumn(w);
						orConditions.push(raw ?? { [field]: columnObj });
					}

					if (orConditions.length > 0) {
						result.OR = orConditions;
					}
				}

				return result;
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
				async findOne({ model, where, select, join }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model);

					if (options.experimental?.joins) {
						const queryModel = getQueryModel(model);
						if (!db.query || !queryModel) {
							logger.error(
								`[# Drizzle Adapter]: The model "${model}" was not found in the query object. Please update your Drizzle schema to include relations or re-generate using "npx @better-auth/cli@latest generate".`,
							);
							logger.info("Falling back to regular query");
						} else {
							let includes:
								| Record<string, { limit: number } | boolean>
								| undefined;

							const pluralJoinResults: { key: string; target: string }[] = [];
							if (join) {
								includes = {};
								const joinEntries = Object.entries(join);
								for (const [model, joinAttr] of joinEntries) {
									const limit =
										joinAttr.limit ??
										options.advanced?.database?.defaultFindManyLimit ??
										100;
									const isUnique = joinAttr.relation === "one-to-one";
									const relationKey = getJoinRelationKey(model, isUnique);
									includes[relationKey] = isUnique ? true : { limit };
									if (!isUnique) {
										pluralJoinResults.push({ key: relationKey, target: model });
									}
								}
							}
							const clause = convertNewWhereClause(where, model);
							const query = db.query[queryModel].findFirst({
								where: clause,
								columns:
									select?.length && select.length > 0
										? select.reduce(
												(acc, field) => {
													acc[getFieldName({ model, field })] = true;
													return acc;
												},
												{} as Record<string, boolean>,
											)
										: undefined,
								with: includes,
							});
							const res = await query;

							if (res) {
								for (const { key, target } of pluralJoinResults) {
									if (key === target) continue;
									res[target] = res[key];
									delete res[key];
								}
							}
							return res;
						}
					}

					const query = db
						.select(
							select?.length && select.length > 0
								? select.reduce((acc, field) => {
										const fieldName = getFieldName({ model, field });
										return {
											...acc,
											[fieldName]: schemaModel[fieldName],
										};
									}, {})
								: undefined,
						)
						.from(schemaModel)
						.where(...clause);

					const res = await query;

					if (!res.length) return null;
					return res[0];
				},
				async findMany({ model, where, sortBy, limit, select, offset, join }) {
					const schemaModel = getSchema(model);
					const clause = where ? convertWhereClause(where, model) : [];
					const sortFn = sortBy?.direction === "desc" ? desc : asc;

					if (options.experimental?.joins) {
						const queryModel = getQueryModel(model);
						if (!db.query || !queryModel) {
							logger.error(
								`[# Drizzle Adapter]: The model "${model}" was not found in the query object. Please update your Drizzle schema to include relations or re-generate using "npx @better-auth/cli@latest generate".`,
							);
							logger.info("Falling back to regular query");
						} else {
							let includes:
								| Record<string, { limit: number; offset?: number } | boolean>
								| undefined;

							const pluralJoinResults: { key: string; target: string }[] = [];
							if (join) {
								includes = {};
								const joinEntries = Object.entries(join);
								for (const [model, joinAttr] of joinEntries) {
									const isUnique = joinAttr.relation === "one-to-one";
									const limit =
										joinAttr.limit ??
										options.advanced?.database?.defaultFindManyLimit ??
										100;
									const relationKey = getJoinRelationKey(model, isUnique);
									includes[relationKey] = isUnique ? true : { limit };
									if (!isUnique)
										pluralJoinResults.push({ key: relationKey, target: model });
								}
							}
							let orderBy: Record<string, "asc" | "desc"> | undefined =
								undefined;
							if (sortBy?.field) {
								const fieldName = getFieldName({ model, field: sortBy.field });
								orderBy = {
									[fieldName]: sortBy.direction === "desc" ? "desc" : "asc",
								};
							}

							const query = db.query[queryModel].findMany({
								where: where ? convertNewWhereClause(where, model) : undefined,
								with: includes,
								columns:
									select?.length && select.length > 0
										? select.reduce(
												(acc, field) => {
													acc[getFieldName({ model, field })] = true;
													return acc;
												},
												{} as Record<string, boolean>,
											)
										: undefined,
								limit: limit ?? 100,
								offset: offset ?? 0,
								orderBy,
							});
							const res = await query;
							if (res) {
								for (const item of res) {
									for (const { key, target } of pluralJoinResults) {
										if (key === target) continue;
										item[target] = item[key];
										delete item[key];
									}
								}
							}
							return res;
						}
					}

					let builder = db
						.select(
							select?.length && select.length > 0
								? select.reduce((acc, field) => {
										const fieldName = getFieldName({ model, field });
										return {
											...acc,
											[fieldName]: schemaModel[fieldName],
										};
									}, {})
								: undefined,
						)
						.from(schemaModel);

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
					const res = await builder;
					return getAffectedRowCount(res, "updateMany", { model, where });
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
					return getAffectedRowCount(res, "deleteMany", { model, where });
				},
				async consumeOne({ model, where }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model);
					const idField = getFieldName({ model, field: "id" });
					const idColumn = schemaModel[idField];

					if (config.provider === "mysql") {
						const claimFromTransaction = async (tx: DB) => {
							const rows = await tx
								.select()
								.from(schemaModel)
								.where(...clause)
								.for("update")
								.limit(1);
							const target = rows[0];
							if (!target) return null;
							const targetId = target[idField] ?? (target as any).id;
							if (targetId === undefined || targetId === null || !idColumn) {
								return null;
							}
							const delRes = await tx
								.delete(schemaModel)
								.where(eq(idColumn, targetId))
								.execute();
							// mysql2's `.execute()` resolves with `[OkPacket, FieldPacket[]]`,
							// while postgres-js exposes `rowCount` and better-sqlite3 uses
							// `changes`. Read the driver-specific affected-row count through
							// the shared helper so all three providers behave the same.
							const delCount = getAffectedRowCount(delRes, "consumeOne", {
								model,
								where,
							});
							return delCount > 0 ? (target as any) : null;
						};
						return inTransaction
							? claimFromTransaction(db)
							: db.transaction(claimFromTransaction);
					}

					if (!idColumn) {
						return null;
					}
					const targetIds = db
						.select({ id: idColumn })
						.from(schemaModel)
						.where(...clause)
						.limit(1);
					const deleted = await db
						.delete(schemaModel)
						.where(inArray(idColumn, targetIds))
						.returning();
					return (deleted[0] as any) ?? null;
				},
				async incrementOne({ model, where, increment, set }) {
					const schemaModel = getSchema(model);
					const clause = convertWhereClause(where, model);
					const idField = getFieldName({ model, field: "id" });
					const idColumn = schemaModel[idField];

					const assignments: Record<string, unknown> = {};
					for (const [field, delta] of Object.entries(increment)) {
						const columnName = getFieldName({ model, field });
						const column = schemaModel[columnName];
						if (!column) {
							throw new BetterAuthError(
								`The field "${field}" does not exist in the schema for the model "${model}". Please update your schema.`,
							);
						}
						assignments[columnName] = sql`${column} + ${sql.param(delta)}`;
					}
					if (set) {
						for (const [field, value] of Object.entries(set)) {
							const columnName = getFieldName({ model, field });
							if (!schemaModel[columnName]) {
								throw new BetterAuthError(
									`The field "${field}" does not exist in the schema for the model "${model}". Please update your schema.`,
								);
							}
							assignments[columnName] = value;
						}
					}

					if (config.provider === "mysql") {
						const mutateInTransaction = async (tx: DB) => {
							const rows = await tx
								.select()
								.from(schemaModel)
								.where(...clause)
								.for("update")
								.limit(1);
							const target = rows[0];
							if (!target) return null;
							const targetId = target[idField] ?? (target as any).id;
							if (targetId === undefined || targetId === null || !idColumn) {
								return null;
							}
							await tx
								.update(schemaModel)
								.set(assignments)
								.where(eq(idColumn, targetId))
								.execute();
							const updated = await tx
								.select()
								.from(schemaModel)
								.where(eq(idColumn, targetId))
								.limit(1)
								.execute();
							return (updated[0] as any) ?? null;
						};
						return inTransaction
							? mutateInTransaction(db)
							: db.transaction(mutateInTransaction);
					}

					if (!idColumn) {
						return null;
					}
					const targetIds = db
						.select({ id: idColumn })
						.from(schemaModel)
						.where(...clause)
						.limit(1);
					const updated = await db
						.update(schemaModel)
						.set(assignments)
						.where(inArray(idColumn, targetIds))
						.returning();
					return (updated[0] as any) ?? null;
				},
				async createSchema(props) {
					const { generateDrizzleSchema } = await import(
						"./generate-drizzle-schema"
					);
					return await generateDrizzleSchema({
						adapterConfig: config,
						options: options,
						provider: config.provider,
						camelCase: config.camelCase,
						file: props.file,
						tables: props.tables,
					});
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
			// All providers generate schemas where Drizzle handles JSON serialization:
			//   - PostgreSQL: native `jsonb` column.
			//   - MySQL: `json()` column (Drizzle stringifies the driver value).
			//   - SQLite: `text(..., { mode: "json" })` column (Drizzle stringifies).
			// If Better Auth also pre-stringified, the value would be JSON-encoded twice.
			supportsJSON: true,
			// For SQLite and MySQL, the generated schema uses JSON-mode columns
			// (`text({ mode: "json" })` / `json()`) which means Drizzle handles
			// serialization. So we don't need to pre-stringify arrays (which would
			// cause double-stringification). For PostgreSQL, native arrays are used.
			// See: https://github.com/better-auth/better-auth/issues/7440
			supportsArrays: true,
			transaction:
				(config.transaction ?? false)
					? (cb) =>
							db.transaction((tx: DB) => {
								const adapter = createAdapterFactory({
									config: {
										...adapterOptions!.config,
										transaction: false,
									},
									adapter: createCustomAdapter(tx, true),
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
