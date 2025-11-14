import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBAdapter,
	DBAdapterDebugLogOption,
	Where,
} from "@better-auth/core/db/adapter";
import {
	type InsertQueryBuilder,
	type Kysely,
	type RawBuilder,
	type UpdateQueryBuilder,
} from "kysely";
import {
	type AdapterFactoryCustomizeAdapterCreator,
	type AdapterFactoryOptions,
	createAdapterFactory,
} from "../adapter-factory";
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

export const kyselyAdapter = (
	db: Kysely<any>,
	config?: KyselyAdapterConfig | undefined,
) => {
	let lazyOptions: BetterAuthOptions | null = null;
	const createCustomAdapter = (
		db: Kysely<any>,
	): AdapterFactoryCustomizeAdapterCreator => {
		return ({ getFieldName }) => {
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
						: where.length > 0 && where[0]?.field
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

					const value = values[field] || where[0]?.value;
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
					let {
						field: _field,
						value: _value,
						operator = "=",
						connector = "AND",
					} = condition;
					let value: any = _value;
					let field: string | RawBuilder<unknown> = getFieldName({
						model,
						field: _field,
					});

					const expr = (eb: any) => {
						if (operator.toLowerCase() === "is_null") {
							return eb(field, "is", null);
						}

						if (operator.toLowerCase() === "is_not_null") {
							return eb(field, "is not", null);
						}

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
					const returned = await withReturning(data, builder, model, []);
					return returned;
				},
				async findOne({ model, where, select }) {
					const { and, or } = convertWhereClause(model, where);
					let query = db.selectFrom(model).selectAll();
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
				async findMany({ model, where, limit, offset, sortBy }) {
					const { and, or } = convertWhereClause(model, where);
					let query = db.selectFrom(model);
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

					const res = await query.selectAll().execute();
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
					return (await query.execute()).length;
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
			supportsJSON: false,
			supportsUUIDs: config?.type === "postgres" ? true : false,
			transaction: config?.transaction
				? (cb) =>
						db.transaction().execute((trx) => {
							const adapter = createAdapterFactory({
								config: adapterOptions!.config,
								adapter: createCustomAdapter(trx),
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
