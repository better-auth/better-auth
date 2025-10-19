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
import type { Adapter, BetterAuthOptions, Join, Where } from "@better-auth/core";
import {
	createAdapterFactory,
	type AdapterFactoryOptions,
	type AdapterFactoryCustomizeAdapterCreator,
} from "../adapter-factory";
import {
	drizzle as pgDrizzle,
	type NodePgQueryResultHKT,
} from "drizzle-orm/node-postgres";
import {
	drizzle as mysqlDrizzle,
	type MySql2PreparedQueryHKT,
	type MySql2QueryResultHKT,
} from "drizzle-orm/mysql2";
import { drizzle as sqliteDrizzle } from "drizzle-orm/libsql";
import {
	PgInsertBase,
	pgTable,
	text as pgText,
	PgUpdateBase,
	type PgTableWithColumns,
} from "drizzle-orm/pg-core";
import {
	MySqlInsertBase,
	mysqlTable,
	MySqlUpdateBase,
	varchar as mysqlVarchar,
	type MySqlTableWithColumns,
} from "drizzle-orm/mysql-core";
import {
	SQLiteInsertBase,
	sqliteTable,
	text as sqliteText,
	SQLiteUpdateBase,
	type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type {
	DBAdapterDebugLogOption,
	DBAdapter,
	Where,
} from "@better-auth/core/db/adapter";

export interface DB {
	[key: string]: any;
}

const pguser = pgTable("user", { id: pgText("id") });
const pgsession = pgTable("session", { id: pgText("id") });
type PgDB = ReturnType<
	typeof pgDrizzle<{ pguser: typeof pguser; pgsession: typeof pgsession }>
>;

const mysqluser = mysqlTable("user", {
	id: mysqlVarchar("id", { length: 255 }),
});
const mysqlsession = mysqlTable("session", {
	id: mysqlVarchar("id", { length: 255 }),
});
type MysqlDB = ReturnType<
	typeof mysqlDrizzle<{
		mysqluser: typeof mysqluser;
		mysqlsession: typeof mysqlsession;
	}>
>;

const sqliteuser = sqliteTable("user", { id: sqliteText("id") });
const sqliSession = sqliteTable("session", { id: sqliteText("id") });
type SqliteDB = ReturnType<
	typeof sqliteDrizzle<{
		sqliteuser: typeof sqliteuser;
		sqliSession: typeof sqliSession;
	}>
>;

type PgBuilder = PgInsertBase<PgTableWithColumns<any>, NodePgQueryResultHKT>;
type MySqlBuilder = MySqlInsertBase<
	MySqlTableWithColumns<any>,
	MySql2QueryResultHKT,
	MySql2PreparedQueryHKT
>;
type SQLiteBuilder = SQLiteInsertBase<
	SQLiteTableWithColumns<any>,
	"async",
	any
>;

type PgUpdateBaseType = Omit<
	PgUpdateBase<
		PgTableWithColumns<any>,
		NodePgQueryResultHKT,
		undefined,
		undefined,
		Record<any, "not-null">,
		[],
		false,
		"where" | "leftJoin" | "rightJoin" | "innerJoin" | "fullJoin"
	>,
	"where" | "leftJoin" | "rightJoin" | "innerJoin" | "fullJoin"
>;

type MysqlBaseType = Omit<
	MySqlUpdateBase<
		MySqlTableWithColumns<any>,
		MySql2QueryResultHKT,
		MySql2PreparedQueryHKT,
		false,
		"where"
	>,
	"where"
>;

type SQLiteUpdateBaseType = Omit<
	SQLiteUpdateBase<
		SQLiteTableWithColumns<any>,
		"async",
		any,
		undefined,
		undefined,
		false,
		"where" | "leftJoin" | "rightJoin" | "innerJoin" | "fullJoin"
	>,
	"where" | "leftJoin" | "rightJoin" | "innerJoin" | "fullJoin"
>;

type AnySchema<Provider extends DrizzleAdapterConfig["provider"]> = Record<
	string,
	Provider extends "pg"
		? PgTableWithColumns<any>
		: Provider extends "mysql"
			? MySqlTableWithColumns<any>
			: Provider extends "sqlite"
				? SQLiteTableWithColumns<any>
				: never
>;

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

export const drizzleAdapter = (_db: DB, config: DrizzleAdapterConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;
	const createCustomAdapter =
		(db: DB): AdapterFactoryCustomizeAdapterCreator =>
		({ getFieldName, debugLog, getModelName }) => {
			function getSchema<Provider extends DrizzleAdapterConfig["provider"]>(
				model: string,
			) {
				const schema = (config.schema || _db._.fullSchema) as
					| AnySchema<Provider>
					| undefined;
				if (!schema) {
					throw new BetterAuthError(
						"Drizzle adapter failed to initialize. Schema not found. Please provide a schema object in the adapter options object.",
					);
				}
				const schemaModel = schema[model];
				if (!schemaModel) {
					const err = new Error();
					const stack = err.stack
						?.split("\n")
						.filter((_, i) => i !== 1)
						.join("\n")
						.replace(
							"Error:",
							`The model "${model}" was not found in the schema object. Please pass the drizzle schema directly to the adapter options in your auth config.`,
						);
					console.log(stack);
					throw new BetterAuthError(
						`[# Drizzle Adapter]: The model "${model}" was not found in the schema object. Please pass the drizzle schema directly to the adapter options in your auth config.`,
					);
				}
				return schemaModel;
			}

			const getColumns = (
				select: string[] | undefined,
				schemaModel: ReturnType<typeof getSchema>,
			) => {
				if (!select?.length) return null;
				return Object.fromEntries(select.map((v) => [v, schemaModel[v]]));
			};

			const withReturning = async <
				Provider extends DrizzleAdapterConfig["provider"] = "pg",
			>({
				builder: builder_,
				data,
				model,
				select,
				where,
			}: {
				model: string;
				builder: Provider extends "pg"
					? PgBuilder | PgUpdateBaseType
					: Provider extends "mysql"
						? MySqlBuilder | MysqlBaseType
						: Provider extends "sqlite"
							? SQLiteBuilder | SQLiteUpdateBaseType
							: never;
				data: Record<string, any>;
				where?: Where[];
				select?: string[];
			}): Promise<any> => {
				const provider = config.provider as Provider;
				if (provider !== "mysql") {
					const builder = builder_ as PgBuilder | SQLiteBuilder;
					const c = await builder.returning();
					return c[0];
				}
				const builder = builder_ as SQLiteBuilder;
				await builder.execute();
				const schemaModel = getSchema<"mysql">(model);
				//@ts-expect-error - config is private
				const builderVal = builder.config?.values;
				const db = _db as MysqlDB;
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
					const columns = getColumns(select, schemaModel);
					const builder = columns ? db.select(columns) : db.select();
					const res = await builder.from(schemaModel).where(clause[0]);
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
					const columns = getColumns(select, schemaModel);
					const builder = columns ? db.select(columns) : db.select();
					const res = await builder
						.from(schemaModel)
						.where(eq(schemaModel.id, tId))
						.limit(1)
						.execute();
					return res[0];
				} else if (data.id) {
					const columns = getColumns(select, schemaModel);
					const builder = columns ? db.select(columns) : db.select();
					const res = await builder
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
					const columns = getColumns(select, schemaModel);
					const builder = columns ? db.select(columns) : db.select();
					const res = await builder
						.from(schemaModel)
						.orderBy(desc(schemaModel.id))
						.limit(1)
						.execute();
					return res[0];
				}
			};

			function convertWhereClause(where: Where[], model: string) {
				const schemaModel = getSchema(model);
				if (!where.length) return [];
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

				const clause: SQL[] = [];
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

			const build = <Provider extends "mysql" | "pg" | "sqlite">({
				model,
				provider,
				select,
				where,
				limit = 1,
				orderBy,
				join,
			}: {
				provider: Provider;
				select?: string[];
				model: string;
				where: Where[];
				limit?: number;
				orderBy?: SQL;
				join?: Join;
			}) => {
				const clause = convertWhereClause(where, model);
				if (provider === "pg") {
					const db = _db as PgDB;
					const schemaModel = getSchema<"pg">(getModelName(model));
					const columns = getColumns(select, schemaModel);
					const selected = columns ? db.select(columns) : db.select();
					const from = selected.from(schemaModel);
					const base = (() => {
						if (!join) return from;
						let base = from as ReturnType<typeof from.leftJoin>;
						for (const model in join) {
							const joinSchemaModel = getSchema<"pg">(getModelName(model));
							const { on, type } = join[model];
							const statement = eq(
								schemaModel[getFieldName({ model, field: on[0] })],
								joinSchemaModel[getFieldName({ model, field: on[1] })],
							);
							if (type === "full") {
								base = base.fullJoin(joinSchemaModel, statement);
							} else if (type === "inner") {
								base = base.innerJoin(joinSchemaModel, statement);
							} else if (type === "left") {
								base = base.leftJoin(joinSchemaModel, statement);
							} else if (type === "right") {
								base = base.rightJoin(joinSchemaModel, statement);
							}
						}
						return base;
					})();
					const builder = base.where(clause[0]).limit(limit);
					if (orderBy) return builder.orderBy(orderBy);
					return builder;
				} else if (provider === "mysql") {
					const db = _db as MysqlDB;
					const schemaModel = getSchema<"mysql">(getModelName(model));
					const columns = getColumns(select, schemaModel);
					const selected = columns ? db.select(columns) : db.select();
					const from = selected.from(schemaModel);
					const base = (() => {
						if (!join) return from;
						let base = from as ReturnType<typeof from.leftJoin>;
						for (const model in join) {
							const joinSchemaModel = getSchema<"mysql">(getModelName(model));
							const { on, type } = join[model];
							const statement = eq(
								schemaModel[getFieldName({ model, field: on[0] })],
								joinSchemaModel[getFieldName({ model, field: on[1] })],
							);
							if (type === "full") {
								base = base.fullJoin(joinSchemaModel, statement);
							} else if (type === "inner") {
								base = base.innerJoin(joinSchemaModel, statement);
							} else if (type === "left") {
								base = base.leftJoin(joinSchemaModel, statement);
							} else if (type === "right") {
								base = base.rightJoin(joinSchemaModel, statement);
							}
						}
						return base;
					})();
					const builder = base.where(clause[0]).limit(limit);
					if (orderBy) return builder.orderBy(orderBy);
					return builder;
				} else {
					const db = _db as SqliteDB;
					const schemaModel = getSchema<"sqlite">(getModelName(model));
					const columns = getColumns(select, schemaModel);
					const selected = columns ? db.select(columns) : db.select();
					const from = selected.from(schemaModel);
					const base = (() => {
						if (!join) return from;
						let base = from as ReturnType<typeof from.leftJoin>;
						for (const model in join) {
							const joinSchemaModel = getSchema<"sqlite">(getModelName(model));
							const { on, type } = join[model];
							const statement = eq(
								schemaModel[getFieldName({ model, field: on[0] })],
								joinSchemaModel[getFieldName({ model, field: on[1] })],
							);
							if (type === "full") {
								base = base.fullJoin(joinSchemaModel, statement);
							} else if (type === "inner") {
								base = base.innerJoin(joinSchemaModel, statement);
							} else if (type === "left") {
								base = base.leftJoin(joinSchemaModel, statement);
							} else if (type === "right") {
								base = base.rightJoin(joinSchemaModel, statement);
							}
						}
						return base;
					})();
					const builder = base.where(clause[0]).limit(limit);
					if (orderBy) return builder.orderBy(orderBy);
					return builder;
				}
			};

			return {
				async create({ model, data: values, select }) {
					const provider = config.provider;
					if (provider === "pg") {
						const db = _db as PgDB;
						const schemaModel = getSchema<typeof provider>(model);
						checkMissingFields(schemaModel, model, values);
						const builder = db.insert(schemaModel).values(values);
						const returned = await withReturning<"pg">({
							model,
							builder,
							data: values,
							select,
						});
						return returned;
					} else if (provider === "mysql") {
						const db = _db as MysqlDB;
						const schemaModel = getSchema<typeof provider>(model);
						checkMissingFields(schemaModel, model, values);
						const builder = db.insert(schemaModel).values(values);
						const returned = await withReturning<"mysql">({
							model,
							builder,
							data: values,
							select,
						});
						return returned;
					} else if (provider === "sqlite") {
						const db = _db as SqliteDB;
						const schemaModel = getSchema<typeof provider>(model);
						checkMissingFields(schemaModel, model, values);
						const builder = db.insert(schemaModel).values(values);
						const returned = await withReturning<"sqlite">({
							model,
							builder,
							data: values,
							select,
						});
						return returned;
					} else {
						debugLog("Invalid database provider", { provider });
						throw new BetterAuthError("Invalid provider");
					}
				},
				async findOne({ model, where, select, join }) {
					const provider = config.provider;
					const res = await build({ model, provider, select, where, join });
					if (!res.length) return null;
					return res[0] as any;
				},
				async findMany({ model, where, sortBy, limit, offset }) {
					const schemaModel = getSchema(model);
					const sortFn = sortBy?.direction === "desc" ? desc : asc;
					const sortCol = sortBy?.field
						? getFieldName({ model, field: sortBy?.field || "" })
						: undefined;
					const builder = build({
						model,
						provider: config.provider,
						where: where ?? [],
						limit: limit ?? 100,
						orderBy: sortCol ? sortFn(schemaModel[sortCol]) : undefined,
					});
					const res = await builder.offset(offset ?? 0);
					return res as any[];
				},
				async count({ model, where }) {
					const clause = where ? convertWhereClause(where, model) : [];
					const provider = config.provider;
					if (provider === "pg") {
						const db = _db as PgDB;
						const schemaModel = getSchema<"pg">(model);
						const res = await db
							.select({ count: count() })
							.from(schemaModel)
							.where(clause[0]);
						return res[0].count;
					} else if (provider === "mysql") {
						const db = _db as MysqlDB;
						const schemaModel = getSchema<typeof provider>(model);
						const res = await db
							.select({ count: count() })
							.from(schemaModel)
							.where(clause[0]);
						return res[0].count;
					} else if (provider === "sqlite") {
						const db = _db as SqliteDB;
						const schemaModel = getSchema<typeof provider>(model);
						const res = await db
							.select({ count: count() })
							.from(schemaModel)
							.where(clause[0]);
						return res[0].count;
					} else {
						debugLog("Invalid database provider", { provider });
						throw new BetterAuthError("Invalid provider");
					}
				},
				async update({ model, where, update }) {
					const provider = config.provider;
					const clause = convertWhereClause(where, model);
					const values = update as Record<string, any>;
					if (provider === "pg") {
						const db = _db as PgDB;
						const schemaModel = getSchema<"pg">(model);
						const builder = db.update(schemaModel).set(values).where(clause[0]);
						return await withReturning<"pg">({
							model,
							builder,
							data: values,
							where,
						});
					} else if (provider === "mysql") {
						const db = _db as MysqlDB;
						const schemaModel = getSchema<"mysql">(model);
						const builder = db.update(schemaModel).set(values).where(clause[0]);
						return await withReturning<"mysql">({
							model,
							builder,
							data: values,
							where,
						});
					} else if (provider === "sqlite") {
						const db = _db as SqliteDB;
						const schemaModel = getSchema<"sqlite">(model);
						const builder = db.update(schemaModel).set(values).where(clause[0]);
						return await withReturning<"sqlite">({
							model,
							builder,
							data: values,
							where,
						});
					} else {
						debugLog("Invalid database provider", { provider });
						throw new BetterAuthError("Invalid provider");
					}
				},
				async updateMany({ model, where, update: values }) {
					const clause = convertWhereClause(where, model);
					const provider = config.provider;
					if (provider === "pg") {
						const db = _db as PgDB;
						const schemaModel = getSchema<"pg">(model);
						const builder = db.update(schemaModel).set(values).where(clause[0]);
						return (await builder) as any;
					} else if (provider === "mysql") {
						const db = _db as MysqlDB;
						const schemaModel = getSchema<"mysql">(model);
						const builder = db.update(schemaModel).set(values).where(clause[0]);
						return (await builder) as any;
					} else if (provider === "sqlite") {
						const db = _db as SqliteDB;
						const schemaModel = getSchema<"sqlite">(model);
						const builder = db.update(schemaModel).set(values).where(clause[0]);
						return (await builder) as any;
					} else {
						debugLog("Invalid database provider", { provider });
						throw new BetterAuthError("Invalid provider");
					}
				},
				async delete({ model, where }) {
					const provider = config.provider;
					if (provider === "pg") {
						const db = _db as PgDB;
						const schemaModel = getSchema<"pg">(model);
						const clause = convertWhereClause(where, model);
						await db.delete(schemaModel).where(clause[0]);
					} else if (provider === "mysql") {
						const db = _db as MysqlDB;
						const schemaModel = getSchema<"mysql">(model);
						const clause = convertWhereClause(where, model);
						await db.delete(schemaModel).where(clause[0]);
					} else if (provider === "sqlite") {
						const db = _db as SqliteDB;
						const schemaModel = getSchema<"sqlite">(model);
						const clause = convertWhereClause(where, model);
						await db.delete(schemaModel).where(clause[0]);
					} else {
						debugLog("Invalid database provider", { provider });
						throw new BetterAuthError("Invalid provider");
					}
				},
				async deleteMany({ model, where }) {
					const provider = config.provider;
					if (provider === "pg") {
						const db = _db as PgDB;
						const schemaModel = getSchema<"pg">(model);
						const clause = convertWhereClause(where, model);
						const builder = db.delete(schemaModel).where(clause[0]);
						return (await builder) as any;
					} else if (provider === "mysql") {
						const db = _db as MysqlDB;
						const schemaModel = getSchema<"mysql">(model);
						const clause = convertWhereClause(where, model);
						const builder = db.delete(schemaModel).where(clause[0]);
						return (await builder) as any;
					} else if (provider === "sqlite") {
						const db = _db as SqliteDB;
						const schemaModel = getSchema<"sqlite">(model);
						const clause = convertWhereClause(where, model);
						const builder = db.delete(schemaModel).where(clause[0]);
						return (await builder) as any;
					} else {
						debugLog("Invalid database provider", { provider });
						throw new BetterAuthError("Invalid provider");
					}
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
							_db.transaction((tx: DB) => {
								const adapter = createAdapterFactory({
									config: adapterOptions!.config,
									adapter: createCustomAdapter(tx),
								})(lazyOptions!);
								return cb(adapter);
							})
					: false,
		},
		adapter: createCustomAdapter(_db),
	};
	const adapter = createAdapterFactory(adapterOptions);
	return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
		lazyOptions = options;
		return adapter(options);
	};
};
