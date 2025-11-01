import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBAdapter,
	DBAdapterDebugLogOption,
	JoinConfig,
	Where,
} from "@better-auth/core/db/adapter";
import {
	type InsertQueryBuilder,
	type Kysely,
	type RawBuilder,
	sql,
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
	/**
	 * Whether to enable experimental features.
	 */
	experimental?: {
		/**
		 * Whether to enable joins.
		 *
		 * @default false
		 */
		joins?: boolean;
	};
}

export const kyselyAdapter = (
	db: Kysely<any>,
	config?: KyselyAdapterConfig | undefined,
) => {
	let lazyOptions: BetterAuthOptions | null = null;
	const createCustomAdapter = (
		db: Kysely<any>,
	): AdapterFactoryCustomizeAdapterCreator => {
		return ({
			getFieldName,
			schema,
			getDefaultFieldName,
			getDefaultModelName,
			getFieldAttributes,
			getModelName,
		}) => {
			const selectAllJoins = (join: JoinConfig | undefined) => {
				// Use selectAll which will handle column naming appropriately
				const allSelects: RawBuilder<unknown>[] = [];
				const allSelectsStr: { joinModel: string; fieldName: string }[] = [];
				if (join) {
					for (const [joinModel, _] of Object.entries(join)) {
						const fields = schema[getDefaultModelName(joinModel)]?.fields;
						if (!fields) continue;
						fields.id = { type: "string" }; // make sure there is at least an id field
						for (const [field, fieldAttr] of Object.entries(fields)) {
							allSelects.push(
								sql`${sql.ref(`join_${joinModel}`)}.${sql.ref(fieldAttr.fieldName || field)} as ${sql.ref(`_joined_${joinModel}_${fieldAttr.fieldName || field}`)}`,
							);
							allSelectsStr.push({
								joinModel,
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
					let field: string | any = getFieldName({
						model,
						field: _field,
					});

					const expr = (eb: any) => {
						const f = `${model}.${field}`;
						if (operator.toLowerCase() === "in") {
							return eb(f, "in", Array.isArray(value) ? value : [value]);
						}

						if (operator.toLowerCase() === "not_in") {
							return eb(f, "not in", Array.isArray(value) ? value : [value]);
						}

						if (operator === "contains") {
							return eb(f, "like", `%${value}%`);
						}

						if (operator === "starts_with") {
							return eb(f, "like", `${value}%`);
						}

						if (operator === "ends_with") {
							return eb(f, "like", `%${value}`);
						}

						if (operator === "eq") {
							return eb(f, "=", value);
						}

						if (operator === "ne") {
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
				allSelectsStr: { joinModel: string; fieldName: string }[],
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
						for (const { joinModel, fieldName } of allSelectsStr) {
							if (keyStr === `_joined_${joinModel}_${fieldName}`) {
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
							entry[getModelName(joinModel)] = joinAttr.isUnique ? null : [];
						}

						groupedByMainId.set(mainId, entry);
					}

					const entry = groupedByMainId.get(mainId)!;

					// Add joined records to the entry
					for (const [joinModel, joinAttr] of Object.entries(joinConfig)) {
						const isUnique = joinAttr.isUnique;
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

				let result = Array.from(groupedByMainId.values());

				// Apply final limit to non-unique join arrays as a safety measure
				for (const entry of result) {
					for (const [joinModel, joinAttr] of Object.entries(joinConfig)) {
						if (!joinAttr.isUnique) {
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
							return b.selectAll().as(model);
						})
						.selectAll(model);

					if (join) {
						// Add joins
						for (const [joinModel, joinAttr] of Object.entries(join)) {
							let joinQuery = db
								.selectFrom(joinModel)
								.selectAll()
								.as(`join_${joinModel}`);
							if (joinAttr.type === "inner") {
								query = query.innerJoin(
									() => joinQuery,
									(join: any) =>
										join.onRef(
											`join_${joinModel}.${joinAttr.on.to}`,
											"=",
											`${model}.${joinAttr.on.from}`,
										),
								);
							} else {
								query = query.leftJoin(
									() => joinQuery,
									(join: any) =>
										join.onRef(
											`join_${joinModel}.${joinAttr.on.to}`,
											"=",
											`${model}.${joinAttr.on.from}`,
										),
								);
							}
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
				async findMany({ model, where, limit, offset, sortBy, join }) {
					const { and, or } = convertWhereClause(model, where);
					let query: any = db
						.selectFrom((eb) => {
							let b = eb.selectFrom(model);

							if (limit !== undefined) {
								b = b.limit(limit);
							}

							if (offset !== undefined) {
								b = b.offset(offset);
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

							return b.selectAll().as(model);
						})
						.selectAll(model);

					if (join) {
						for (const [joinModel, joinAttr] of Object.entries(join)) {
							let joinQueryBuilder = db
								.selectFrom(joinModel)
								.selectAll()
								.as(`join_${joinModel}`);
							if (joinAttr.type === "inner") {
								query = query.innerJoin(
									() => joinQueryBuilder,
									(join: any) =>
										join.onRef(
											`join_${joinModel}.${joinAttr.on.to}`,
											"=",
											`${model}.${joinAttr.on.from}`,
										),
								);
							} else {
								query = query.leftJoin(
									() => joinQueryBuilder,
									(join: any) =>
										join.onRef(
											`join_${joinModel}.${joinAttr.on.to}`,
											"=",
											`${model}.${joinAttr.on.from}`,
										),
								);
							}
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

					// console.log("sql query:", await query.compile());
					const res = await query.execute();
					// console.log(`raw unparsed result:`, res);

					if (!res) return [];
					if (join) return processJoinedResults(res, join, allSelectsStr);
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
			supportsJoin: config?.experimental?.joins ?? false,
			transaction:
				(config?.transaction ?? false)
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
