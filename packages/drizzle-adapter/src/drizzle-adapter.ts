import type { BetterAuthOptions } from "@better-auth/core";
import type {
	AdapterFactoryCustomizeAdapterCreator,
	AdapterFactoryOptions,
	DBAdapter,
	DBAdapterDebugLogOption,
	MigrationDatabaseConnection,
	MigrationDatabaseDialect,
	MigrationDatabaseQuery,
	MigrationDatabaseQueryResult,
	Where,
} from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import { logger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	Column,
	count,
	desc,
	eq,
	getTableName,
	gt,
	gte,
	inArray,
	is,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import {
	buildRelationKeysByModel,
	getOneToOneRelationKey,
} from "./join-relation-key";
import {
	insensitiveEq,
	insensitiveIlike,
	insensitiveInArray,
	insensitiveNe,
	insensitiveNotInArray,
} from "./query-builders";

export interface DB {
	[key: string]: any;
}

/**
 * Derive the number of affected rows from a Drizzle write result.
 *
 * Drizzle returns the raw per-driver result for a non-returning write, so the
 * count lives under a different field per driver: node-postgres / neon expose
 * `rowCount`, postgres-js / bun-sql carry `count` on an Array subclass, mysql2
 * reports `affectedRows` (in a result-header array), planetscale and other
 * serverless drivers use `rowsAffected`, better-sqlite3 uses `changes`, and
 * Cloudflare D1 nests the count under `meta.changes`. This normalizes them so
 * write methods that depend on affected rows honor the adapter contract instead
 * of leaking the raw driver result.
 */
function getAffectedRowCount(
	result: unknown,
	operation: "updateMany" | "deleteMany" | "consumeOne",
	context: { model: string; where: Where[] },
): number {
	let count: unknown = 0;
	if (result && typeof result === "object" && "rowCount" in result) {
		// node-postgres / neon expose `rowCount`.
		count = (result as { rowCount: unknown }).rowCount;
	} else if (
		result &&
		typeof result === "object" &&
		typeof (result as { count?: unknown }).count === "number"
	) {
		// postgres-js / bun-sql return an Array subclass carrying `count`.
		// A non-returning write has length 0, so read this before the Array
		// branch falls back to `result.length`.
		count = (result as { count: number }).count;
	} else if (Array.isArray(result)) {
		// mysql2 returns a `[ResultSetHeader]` tuple.
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

function readDriverRowCount(result: unknown): unknown {
	if (!result || typeof result !== "object") return undefined;
	const driverResult = result as Record<string, unknown>;
	if ("rowCount" in driverResult) return driverResult.rowCount;
	if ("count" in driverResult) return driverResult.count;
	if ("affectedRows" in driverResult) return driverResult.affectedRows;
	if ("rowsAffected" in driverResult) return driverResult.rowsAffected;
	if ("changes" in driverResult) return driverResult.changes;

	// Cloudflare D1 nests the affected-row count under `meta.changes`.
	// @see https://developers.cloudflare.com/d1/worker-api/return-object/
	if ("meta" in driverResult) {
		const meta = driverResult.meta;
		if (meta && typeof meta === "object" && "changes" in meta) {
			return meta.changes;
		}
	}

	return undefined;
}

function hasDriverRowCount(result: unknown): boolean {
	return readDriverRowCount(result) !== undefined;
}

function isDriverResultHeader(result: unknown): boolean {
	if (!result || typeof result !== "object") return false;
	const driverResult = result as Record<string, unknown>;
	return (
		"affectedRows" in driverResult ||
		"rowsAffected" in driverResult ||
		"changes" in driverResult ||
		("meta" in driverResult &&
			driverResult.meta !== null &&
			typeof driverResult.meta === "object" &&
			"changes" in driverResult.meta)
	);
}

function getMigrationRows(result: unknown): readonly Record<string, unknown>[] {
	if (Array.isArray(result)) {
		if (result.length > 0 && isDriverResultHeader(result[0])) return [];
		if (Array.isArray(result[0])) {
			return result[0].filter(
				(row): row is Record<string, unknown> =>
					typeof row === "object" && row !== null,
			);
		}
		return result.filter(
			(row): row is Record<string, unknown> =>
				typeof row === "object" && row !== null,
		);
	}
	if (!result || typeof result !== "object") return [];
	if ("rows" in result && Array.isArray(result.rows)) {
		return result.rows.filter(
			(row): row is Record<string, unknown> =>
				typeof row === "object" && row !== null,
		);
	}
	if ("results" in result && Array.isArray(result.results)) {
		return result.results.filter(
			(row): row is Record<string, unknown> =>
				typeof row === "object" && row !== null,
		);
	}
	return [];
}

interface MigrationParameterMarker {
	length: number;
	offset: number;
	parameterIndex: number;
}

function findMigrationParameterMarkers(
	query: string,
	dialect: MigrationDatabaseDialect,
): MigrationParameterMarker[] {
	const markers: MigrationParameterMarker[] = [];
	let offset = 0;
	let positionalParameter = 0;
	while (offset < query.length) {
		const character = query[offset];
		const nextCharacter = query[offset + 1];

		if (character === "-" && nextCharacter === "-") {
			offset = query.indexOf("\n", offset + 2);
			if (offset === -1) break;
			continue;
		}
		if (dialect === "mysql" && character === "#") {
			offset = query.indexOf("\n", offset + 1);
			if (offset === -1) break;
			continue;
		}
		if (character === "/" && nextCharacter === "*") {
			let depth = 1;
			offset += 2;
			while (offset < query.length && depth > 0) {
				if (query[offset] === "/" && query[offset + 1] === "*") {
					depth += 1;
					offset += 2;
					continue;
				}
				if (query[offset] === "*" && query[offset + 1] === "/") {
					depth -= 1;
					offset += 2;
					continue;
				}
				offset += 1;
			}
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			const quote = character;
			offset += 1;
			while (offset < query.length) {
				if (dialect === "mysql" && query[offset] === "\\") {
					offset += 2;
					continue;
				}
				if (query[offset] !== quote) {
					offset += 1;
					continue;
				}
				if (query[offset + 1] === quote) {
					offset += 2;
					continue;
				}
				offset += 1;
				break;
			}
			continue;
		}
		if (character === "[") {
			offset += 1;
			while (offset < query.length) {
				if (query[offset] !== "]") {
					offset += 1;
					continue;
				}
				if (query[offset + 1] === "]") {
					offset += 2;
					continue;
				}
				offset += 1;
				break;
			}
			continue;
		}
		if (dialect === "postgres" && character === "$") {
			const dollarQuote = query
				.slice(offset)
				.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
			if (dollarQuote) {
				const closingOffset = query.indexOf(
					dollarQuote,
					offset + dollarQuote.length,
				);
				offset =
					closingOffset === -1
						? query.length
						: closingOffset + dollarQuote.length;
				continue;
			}
			const parameterMarker = query.slice(offset).match(/^\$(\d+)/);
			if (parameterMarker) {
				markers.push({
					length: parameterMarker[0].length,
					offset,
					parameterIndex: Number.parseInt(parameterMarker[1] ?? "", 10) - 1,
				});
				offset += parameterMarker[0].length;
				continue;
			}
		}
		if (dialect !== "postgres" && character === "?") {
			markers.push({ length: 1, offset, parameterIndex: positionalParameter });
			positionalParameter += 1;
		}
		offset += 1;
	}
	return markers;
}

function buildMigrationStatement(
	query: MigrationDatabaseQuery,
	dialect: MigrationDatabaseDialect,
): SQL {
	if (query.parameters.length === 0) return sql.raw(query.sql);
	const markers = findMigrationParameterMarkers(query.sql, dialect);
	const chunks: SQL[] = [];
	let sqlOffset = 0;
	for (const marker of markers) {
		chunks.push(sql.raw(query.sql.slice(sqlOffset, marker.offset)));
		const parameterIndex = marker.parameterIndex;
		if (
			!Number.isInteger(parameterIndex) ||
			parameterIndex < 0 ||
			parameterIndex >= query.parameters.length
		) {
			throw new BetterAuthError(
				"Drizzle migration query has an invalid parameter marker.",
			);
		}
		chunks.push(sql`${query.parameters[parameterIndex]}`);
		sqlOffset = marker.offset + marker.length;
	}
	chunks.push(sql.raw(query.sql.slice(sqlOffset)));
	if (
		(dialect === "postgres"
			? new Set(markers.map(({ parameterIndex }) => parameterIndex)).size
			: markers.length) !== query.parameters.length
	) {
		throw new BetterAuthError(
			"Drizzle migration query parameter count does not match its SQL markers.",
		);
	}
	return sql.join(chunks, sql.raw(""));
}

function getMigrationQueryResult(
	driverResult: unknown,
	isRead: boolean,
): MigrationDatabaseQueryResult {
	if (isRead) return { rows: getMigrationRows(driverResult) };
	const affectedRows =
		Array.isArray(driverResult) && driverResult.length > 0
			? (readDriverRowCount(driverResult[0]) ??
				readDriverRowCount(driverResult))
			: readDriverRowCount(driverResult);
	return {
		rows: getMigrationRows(driverResult),
		...(typeof affectedRows === "number" && Number.isFinite(affectedRows)
			? { numAffectedRows: BigInt(affectedRows) }
			: {}),
	};
}

function isDrizzleMigrationRead(query: MigrationDatabaseQuery): boolean {
	const sql = query.sql.trimStart();
	if (/^(?:select|with|explain)\b/i.test(sql)) return true;
	return /^pragma\b/i.test(sql) && !/^pragma\b[^;]*=/i.test(sql);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null &&
		(typeof value === "object" || typeof value === "function") &&
		"then" in value &&
		typeof value.then === "function"
	);
}

function createDrizzleMigrationConnection(
	db: DB,
	dialect: MigrationDatabaseDialect,
	drizzleSchema: Record<string, unknown> | undefined,
	inTransaction = false,
	supportsTransactions = true,
): MigrationDatabaseConnection {
	const connection: MigrationDatabaseConnection = {
		dialect,
		async resolvePhysicalSchema(schema) {
			if (!drizzleSchema) {
				throw new BetterAuthError(
					"Drizzle migration schema resolution requires a schema object.",
				);
			}
			return Object.fromEntries(
				Object.entries(schema).map(([schemaKey, table]) => {
					const drizzleTable =
						drizzleSchema[schemaKey] ?? drizzleSchema[table.modelName];
					if (!drizzleTable || typeof drizzleTable !== "object") {
						throw new BetterAuthError(
							`Drizzle migration schema could not resolve model "${table.modelName}".`,
						);
					}
					const fields = Object.fromEntries(
						Object.entries(table.fields).map(([fieldKey, field]) => {
							const drizzleFieldName = field.fieldName || fieldKey;
							const drizzleTableFields = drizzleTable as Record<
								string,
								unknown
							>;
							const column =
								drizzleTableFields[fieldKey] ??
								drizzleTableFields[drizzleFieldName];
							if (!is(column, Column)) {
								throw new BetterAuthError(
									`Drizzle migration schema could not resolve field "${drizzleFieldName}" on model "${table.modelName}".`,
								);
							}
							return [
								fieldKey,
								{
									...field,
									fieldName: column.name,
								},
							];
						}),
					);
					return [
						schemaKey,
						{
							...table,
							modelName: getTableName(drizzleTable as never),
							fields,
						},
					];
				}),
			);
		},
		async execute(query) {
			const statement = buildMigrationStatement(query, dialect);
			const isRead = isDrizzleMigrationRead(query);
			const driverResult =
				dialect === "sqlite"
					? isRead
						? await db.all(statement)
						: await db.run(statement)
					: await db.execute(statement);
			return getMigrationQueryResult(driverResult, isRead);
		},
	};
	if (inTransaction || !supportsTransactions) return connection;
	connection.transaction = async (callback) => {
		if (dialect === "sqlite") {
			const probe = db.run(sql.raw("SELECT 1"));
			if (isPromiseLike(probe)) {
				await probe;
				if (typeof db.transaction !== "function") {
					throw new BetterAuthError(
						"Drizzle migration transactions for asynchronous SQLite drivers require a native transaction-scoped database.",
					);
				}
				return db.transaction((transactionDatabase: DB) =>
					callback(
						createDrizzleMigrationConnection(
							transactionDatabase,
							dialect,
							drizzleSchema,
							true,
							true,
						),
					),
				);
			}
			await connection.execute({
				parameters: [],
				sql: "BEGIN IMMEDIATE",
			});
			try {
				const result = await callback(
					createDrizzleMigrationConnection(
						db,
						dialect,
						drizzleSchema,
						true,
						true,
					),
				);
				await connection.execute({ parameters: [], sql: "COMMIT" });
				return result;
			} catch (error) {
				await connection.execute({ parameters: [], sql: "ROLLBACK" });
				throw error;
			}
		}
		if (typeof db.transaction !== "function") {
			throw new BetterAuthError(
				`Drizzle does not expose transactions for the ${dialect} migration connection.`,
			);
		}
		return db.transaction((transactionDatabase: DB) =>
			callback(
				createDrizzleMigrationConnection(
					transactionDatabase,
					dialect,
					drizzleSchema,
					true,
					true,
				),
			),
		);
	};
	return connection;
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
	/**
	 * Database schema namespace, used during the Better Auth CLI to generate the schema.
	 *
	 * Only applies to PostgreSQL. It will generate something like this:
	 *
	 * ```ts
	 * export const authSchema = pgSchema("auth");
	 *
	 * export const user = authSchema.table("user", {...});
	 * export const session = authSchema.table("session", {...});
	 * ```
	 *
	 * @example "auth"
	 * @default undefined
	 */
	schemaName?: string | undefined;
}

export const drizzleAdapter = (db: DB, config: DrizzleAdapterConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;
	let mysqlNoIdWarned = false;
	const relationKeysByModel = buildRelationKeysByModel(db._?.schema);
	const createCustomAdapter =
		(db: DB, inTransaction = false): AdapterFactoryCustomizeAdapterCreator =>
		({
			getFieldName,
			getDefaultFieldName,
			getDefaultModelName,
			options,
			schema: baSchema,
		}) => {
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
					const updatedWhere = where.map((w) => {
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
							const dbFieldName = getFieldName({
								model,
								field: fieldKey,
							});
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
			function convertWhereClause(where: Where[], model: string) {
				const schemaModel = getSchema(model);
				const resolveFieldName = (where: Where) => {
					const field = getFieldName({ model, field: where.field });
					if (!is(schemaModel[field], Column)) {
						throw new BetterAuthError(
							`The field "${where.field}" does not exist in the schema for the model "${model}". Please update your schema.`,
						);
					}
					return field;
				};
				if (!where) return [];
				if (where.length === 1) {
					const w = where[0];
					if (!w) {
						return [];
					}
					const field = resolveFieldName(w);
					const mode = w.mode ?? "sensitive";
					const isInsensitive =
						mode === "insensitive" &&
						(typeof w.value === "string" ||
							(Array.isArray(w.value) &&
								w.value.every((v) => typeof v === "string")));

					if (w.operator === "in") {
						if (!Array.isArray(w.value)) {
							throw new BetterAuthError(
								`The value for the field "${w.field}" must be an array when using the "in" operator.`,
							);
						}
						if (isInsensitive) {
							return [
								insensitiveInArray(schemaModel[field], w.value as string[]),
							];
						}
						return [inArray(schemaModel[field], w.value)];
					}
					if (w.operator === "not_in") {
						if (!Array.isArray(w.value)) {
							throw new BetterAuthError(
								`The value for the field "${w.field}" must be an array when using the "not_in" operator.`,
							);
						}
						if (isInsensitive) {
							return [
								insensitiveNotInArray(schemaModel[field], w.value as string[]),
							];
						}
						return [notInArray(schemaModel[field], w.value)];
					}
					if (w.operator === "contains") {
						if (isInsensitive && typeof w.value === "string") {
							return [
								insensitiveIlike(
									schemaModel[field],
									`%${w.value}%`,
									config.provider,
								),
							];
						}
						return [like(schemaModel[field], `%${w.value}%`)];
					}
					if (w.operator === "starts_with") {
						if (isInsensitive && typeof w.value === "string") {
							return [
								insensitiveIlike(
									schemaModel[field],
									`${w.value}%`,
									config.provider,
								),
							];
						}
						return [like(schemaModel[field], `${w.value}%`)];
					}
					if (w.operator === "ends_with") {
						if (isInsensitive && typeof w.value === "string") {
							return [
								insensitiveIlike(
									schemaModel[field],
									`%${w.value}`,
									config.provider,
								),
							];
						}
						return [like(schemaModel[field], `%${w.value}`)];
					}

					if (w.operator === "lt") {
						return [lt(schemaModel[field], w.value)];
					}

					if (w.operator === "lte") {
						return [lte(schemaModel[field], w.value)];
					}

					if (w.operator === "ne") {
						if (w.value === null) {
							return [isNotNull(schemaModel[field])];
						}
						if (isInsensitive && typeof w.value === "string") {
							return [insensitiveNe(schemaModel[field], w.value)];
						}
						return [ne(schemaModel[field], w.value)];
					}

					if (w.operator === "gt") {
						return [gt(schemaModel[field], w.value)];
					}

					if (w.operator === "gte") {
						return [gte(schemaModel[field], w.value)];
					}

					// eq operator

					if (w.value === null) {
						return [isNull(schemaModel[field])];
					}
					if (isInsensitive && typeof w.value === "string") {
						return [insensitiveEq(schemaModel[field], w.value)];
					}
					return [eq(schemaModel[field], w.value)];
				}
				const andGroup = where.filter(
					(w) => w.connector === "AND" || !w.connector,
				);
				const orGroup = where.filter((w) => w.connector === "OR");

				const andClause = and(
					...andGroup.map((w) => {
						const field = resolveFieldName(w);
						const mode = w.mode ?? "sensitive";
						const isInsensitive =
							mode === "insensitive" &&
							(typeof w.value === "string" ||
								(Array.isArray(w.value) &&
									w.value.every((v) => typeof v === "string")));

						if (w.operator === "in") {
							if (!Array.isArray(w.value)) {
								throw new BetterAuthError(
									`The value for the field "${w.field}" must be an array when using the "in" operator.`,
								);
							}
							if (isInsensitive) {
								return insensitiveInArray(
									schemaModel[field],
									w.value as string[],
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
							if (isInsensitive) {
								return insensitiveNotInArray(
									schemaModel[field],
									w.value as string[],
								);
							}
							return notInArray(schemaModel[field], w.value);
						}
						if (w.operator === "contains") {
							if (isInsensitive && typeof w.value === "string") {
								return insensitiveIlike(
									schemaModel[field],
									`%${w.value}%`,
									config.provider,
								);
							}
							return like(schemaModel[field], `%${w.value}%`);
						}
						if (w.operator === "starts_with") {
							if (isInsensitive && typeof w.value === "string") {
								return insensitiveIlike(
									schemaModel[field],
									`${w.value}%`,
									config.provider,
								);
							}
							return like(schemaModel[field], `${w.value}%`);
						}
						if (w.operator === "ends_with") {
							if (isInsensitive && typeof w.value === "string") {
								return insensitiveIlike(
									schemaModel[field],
									`%${w.value}`,
									config.provider,
								);
							}
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
							if (w.value === null) {
								return isNotNull(schemaModel[field]);
							}
							if (isInsensitive && typeof w.value === "string") {
								return insensitiveNe(schemaModel[field], w.value);
							}
							return ne(schemaModel[field], w.value);
						}

						// eq operator

						if (w.value === null) {
							return isNull(schemaModel[field]);
						}

						if (isInsensitive && typeof w.value === "string") {
							return insensitiveEq(schemaModel[field], w.value);
						}

						return eq(schemaModel[field], w.value);
					}),
				);
				const orClause = or(
					...orGroup.map((w) => {
						const field = resolveFieldName(w);
						const mode = w.mode ?? "sensitive";
						const isInsensitive =
							mode === "insensitive" &&
							(typeof w.value === "string" ||
								(Array.isArray(w.value) &&
									w.value.every((v) => typeof v === "string")));

						if (w.operator === "in") {
							if (!Array.isArray(w.value)) {
								throw new BetterAuthError(
									`The value for the field "${w.field}" must be an array when using the "in" operator.`,
								);
							}
							if (isInsensitive) {
								return insensitiveInArray(
									schemaModel[field],
									w.value as string[],
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
							if (isInsensitive) {
								return insensitiveNotInArray(
									schemaModel[field],
									w.value as string[],
								);
							}
							return notInArray(schemaModel[field], w.value);
						}
						if (w.operator === "contains") {
							if (isInsensitive && typeof w.value === "string") {
								return insensitiveIlike(
									schemaModel[field],
									`%${w.value}%`,
									config.provider,
								);
							}
							return like(schemaModel[field], `%${w.value}%`);
						}
						if (w.operator === "starts_with") {
							if (isInsensitive && typeof w.value === "string") {
								return insensitiveIlike(
									schemaModel[field],
									`${w.value}%`,
									config.provider,
								);
							}
							return like(schemaModel[field], `${w.value}%`);
						}
						if (w.operator === "ends_with") {
							if (isInsensitive && typeof w.value === "string") {
								return insensitiveIlike(
									schemaModel[field],
									`%${w.value}`,
									config.provider,
								);
							}
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
							if (w.value === null) {
								return isNotNull(schemaModel[field]);
							}
							if (isInsensitive && typeof w.value === "string") {
								return insensitiveNe(schemaModel[field], w.value);
							}
							return ne(schemaModel[field], w.value);
						}

						// eq operator

						if (w.value === null) {
							return isNull(schemaModel[field]);
						}

						if (isInsensitive && typeof w.value === "string") {
							return insensitiveEq(schemaModel[field], w.value);
						}
						return eq(schemaModel[field], w.value);
					}),
				);

				if (andGroup.length && orGroup.length) {
					return [and(andClause!, orClause!)!];
				}
				if (andGroup.length) return [andClause!];
				if (orGroup.length) return [orClause!];
				return [];
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
					let fieldName: string;
					try {
						fieldName = getFieldName({ model, field: key });
					} catch {
						fieldName = key;
					}
					if (!schema[fieldName]) {
						throw new BetterAuthError(
							`The field "${key}" does not exist in the "${model}" Drizzle schema. Please update your drizzle schema or re-generate using "npx auth@latest generate".`,
						);
					}
				}
			}

			/**
			 * Resolve the db.query key for a model.
			 *
			 * When `usePlural` is false (default), Better Auth uses singular model
			 * names like "user", but Drizzle's db.query is keyed by the schema
			 * export names (often plural like "users"). This function:
			 *
			 * 1. Tries the model name directly (works when schema keys match)
			 * 2. If usePlural is set, tries appending "s"
			 * 3. Falls back to scanning config.schema to find which db.query key
			 *    corresponds to the same table object
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
						const fullSchema = db._.fullSchema;
						if (fullSchema) {
							for (const key of Object.keys(db.query)) {
								if (fullSchema[key] === targetTable) {
									return key;
								}
							}
						}
					}
				}

				return null;
			}

			function getJoinRelationKey(
				baseModel: string,
				joinModel: string,
				relationKeys: ReadonlySet<string> | undefined,
				isUnique: boolean,
			) {
				if (isUnique) {
					return getOneToOneRelationKey({
						baseModel,
						joinModel,
						relationKeys,
						schema: baSchema,
						getDefaultModelName,
					});
				}
				// Preserve the legacy Relations v1 generator rule: append "s" when usePlural is disabled.
				return config.usePlural ? joinModel : `${joinModel}s`;
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

					if (join) {
						const queryModel = getQueryModel(model);
						if (!db.query || !queryModel) {
							logger.error(
								`[# Drizzle Adapter]: The model "${model}" was not found in the query object. Please update your Drizzle schema to include relations or re-generate using "npx auth@latest generate".`,
							);
							logger.info("Falling back to regular query");
						} else {
							let includes:
								| Record<string, { limit: number } | boolean>
								| undefined;

							const renamedJoinResults: { key: string; target: string }[] = [];
							const relationKeys = relationKeysByModel.get(queryModel);
							includes = {};
							const joinEntries = Object.entries(join);
							for (const [joinModel, joinAttr] of joinEntries) {
								const limit =
									joinAttr.limit ??
									options.advanced?.database?.defaultFindManyLimit ??
									100;
								const isUnique = joinAttr.relation === "one-to-one";
								const relationKey = getJoinRelationKey(
									model,
									joinModel,
									relationKeys,
									isUnique,
								);
								includes[relationKey] = isUnique ? true : { limit };
								if (relationKey !== joinModel) {
									renamedJoinResults.push({
										key: relationKey,
										target: joinModel,
									});
								}
							}
							const query = db.query[queryModel].findFirst({
								where: clause[0],
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
								for (const { key, target } of renamedJoinResults) {
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

					if (join) {
						const queryModel = getQueryModel(model);
						if (!db.query || !queryModel) {
							logger.error(
								`[# Drizzle Adapter]: The model "${model}" was not found in the query object. Please update your Drizzle schema to include relations or re-generate using "npx auth@latest generate".`,
							);
							logger.info("Falling back to regular query");
						} else {
							let includes:
								| Record<string, { limit: number } | boolean>
								| undefined;

							const renamedJoinResults: { key: string; target: string }[] = [];
							const relationKeys = relationKeysByModel.get(queryModel);
							includes = {};
							const joinEntries = Object.entries(join);
							for (const [joinModel, joinAttr] of joinEntries) {
								const isUnique = joinAttr.relation === "one-to-one";
								const limit =
									joinAttr.limit ??
									options.advanced?.database?.defaultFindManyLimit ??
									100;
								const relationKey = getJoinRelationKey(
									model,
									joinModel,
									relationKeys,
									isUnique,
								);
								includes[relationKey] = isUnique ? true : { limit };
								if (relationKey !== joinModel) {
									renamedJoinResults.push({
										key: relationKey,
										target: joinModel,
									});
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
							const query = db.query[queryModel].findMany({
								where: clause[0],
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
									for (const { key, target } of renamedJoinResults) {
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
						// MySQL has no DELETE ... RETURNING. Hold the row under
						// SELECT ... FOR UPDATE inside a transaction so concurrent
						// claimants block until the row is gone.
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
							const count = getAffectedRowCount(delRes, "consumeOne", {
								model,
								where,
							});
							return count > 0 ? (target as any) : null;
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

					// Build `field = field + delta` for each increment plus the absolute
					// `set` assignments. The where clause selects and guards the row, but
					// the mutation is pinned to a single id so a non-unique guard cannot
					// touch more than one row (single-row contract, like consumeOne).
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
						// MySQL has no UPDATE ... RETURNING. Hold the guarded row under
						// SELECT ... FOR UPDATE inside a transaction so concurrent updates
						// serialize, then read the mutated row back by id.
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
					// Pin the update to one selected id so a non-unique guard mutates at
					// most one row, mirroring consumeOne's single-row selection.
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
				options: config,
			};
		};
	let adapterOptions: AdapterFactoryOptions | null = null;
	adapterOptions = {
		config: {
			adapterId: "drizzle",
			adapterName: "Drizzle Adapter",
			migrationConnection: createDrizzleMigrationConnection(
				db,
				config.provider === "pg" ? "postgres" : config.provider,
				config.schema || db._?.fullSchema,
				false,
				config.transaction === true,
			),
			usePlural: config.usePlural ?? false,
			debugLogs: config.debugLogs ?? false,
			supportsUUIDs: config.provider === "pg" ? true : false,
			supportsJSON:
				config.provider === "pg" // even though mysql also supports it, mysql requires to pass stringified json anyway.
					? true
					: false,
			supportsArrays: config.provider === "pg" ? true : false,
			customTransformOutput: ({ data, fieldAttributes }) => {
				// not all providers support dates
				// one such example case is https://github.com/better-auth/better-auth/issues/7819
				if (fieldAttributes.type === "date") {
					if (data === null || data === undefined) {
						return data;
					}
					return new Date(data);
				}
				return data;
			},
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
