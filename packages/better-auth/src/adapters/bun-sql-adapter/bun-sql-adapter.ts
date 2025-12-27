import type { BetterAuthOptions } from "@better-auth/core";
import type {
	CleanedWhere,
	DBAdapter,
	DBAdapterDebugLogOption,
} from "@better-auth/core/db/adapter";
import type { SQL } from "bun";
import {
	type AdapterFactoryCustomizeAdapterCreator,
	type AdapterFactoryOptions,
	createAdapterFactory,
} from "../adapter-factory";

export interface BunSqlAdapterConfig {
	/**
	 * The Bun SQL instance to use for database operations.
	 */
	sql: SQL;
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption;
	/**
	 * Use plural for table names.
	 *
	 * @default false
	 */
	usePlural?: boolean;
	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * @default false
	 */
	transaction?: boolean;
}

export const bunSqlAdapter = (config: BunSqlAdapterConfig) => {
	const { sql } = config;
	let lazyOptions: BetterAuthOptions | null = null;

	const createCustomAdapter = (
		sqlInstance: SQL,
	): AdapterFactoryCustomizeAdapterCreator => {
		return ({ getFieldName }) => {
			function buildWhereClause(
				model: string,
				where: CleanedWhere[] | undefined,
				startIdx: number,
			): { whereClause: string; whereValues: unknown[] } {
				if (!where || where.length === 0) {
					return { whereClause: "", whereValues: [] };
				}

				const conditions: string[] = [];
				const values: unknown[] = [];
				let idx = startIdx;

				for (let i = 0; i < where.length; i++) {
					const condition = where[i]!;
					const { field: _field, value, operator = "eq", connector } = condition;
					const field = getFieldName({ model, field: _field });

					let conditionStr = "";

					switch (operator) {
						case "eq":
							if (value === null) {
								conditionStr = `"${field}" IS NULL`;
							} else {
								conditionStr = `"${field}" = $${idx++}`;
								values.push(value);
							}
							break;
						case "ne":
							if (value === null) {
								conditionStr = `"${field}" IS NOT NULL`;
							} else {
								conditionStr = `"${field}" != $${idx++}`;
								values.push(value);
							}
							break;
						case "gt":
							conditionStr = `"${field}" > $${idx++}`;
							values.push(value);
							break;
						case "gte":
							conditionStr = `"${field}" >= $${idx++}`;
							values.push(value);
							break;
						case "lt":
							conditionStr = `"${field}" < $${idx++}`;
							values.push(value);
							break;
						case "lte":
							conditionStr = `"${field}" <= $${idx++}`;
							values.push(value);
							break;
						case "in":
							if (Array.isArray(value)) {
								if (value.length === 0) {
									// Empty array: nothing can match, return no rows
									conditionStr = "FALSE";
								} else {
									const inPlaceholders = value
										.map(() => `$${idx++}`)
										.join(", ");
									conditionStr = `"${field}" IN (${inPlaceholders})`;
									values.push(...value);
								}
							}
							break;
						case "not_in":
							if (Array.isArray(value)) {
								if (value.length === 0) {
									// Empty array: nothing to exclude, match all (skip condition)
								} else {
									const notInPlaceholders = value
										.map(() => `$${idx++}`)
										.join(", ");
									conditionStr = `"${field}" NOT IN (${notInPlaceholders})`;
									values.push(...value);
								}
							}
							break;
						case "contains":
							conditionStr = `"${field}" LIKE $${idx++}`;
							values.push(`%${value}%`);
							break;
						case "starts_with":
							conditionStr = `"${field}" LIKE $${idx++}`;
							values.push(`${value}%`);
							break;
						case "ends_with":
							conditionStr = `"${field}" LIKE $${idx++}`;
							values.push(`%${value}`);
							break;
						default:
							conditionStr = `"${field}" = $${idx++}`;
							values.push(value);
					}

					if (conditionStr) {
						if (i === 0) {
							conditions.push(conditionStr);
						} else {
							const logicalOp = connector === "OR" ? "OR" : "AND";
							conditions.push(`${logicalOp} ${conditionStr}`);
						}
					}
				}

				return {
					whereClause:
						conditions.length > 0 ? `WHERE ${conditions.join(" ")}` : "",
					whereValues: values,
				};
			}

			return {
				async create({ model, data }) {
					const record = data as Record<string, unknown>;
					const columns = Object.keys(record);
					const values = Object.values(record);
					const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

					const result = await sqlInstance.unsafe(
						`INSERT INTO "${model}" (${columns.map((c) => `"${c}"`).join(", ")})
             VALUES (${placeholders})
             RETURNING *`,
						values,
					);
					return result[0];
				},

				async findOne({ model, where }) {
					const { whereClause, whereValues } = buildWhereClause(model, where, 1);
					const result = await sqlInstance.unsafe(
						`SELECT * FROM "${model}" ${whereClause} LIMIT 1`,
						whereValues,
					);
					return result[0] ?? null;
				},

				async findMany({ model, where, limit, sortBy, offset }) {
					const { whereClause, whereValues } = buildWhereClause(model, where, 1);
					let query = `SELECT * FROM "${model}" ${whereClause}`;

					if (sortBy) {
						const field = getFieldName({ model, field: sortBy.field });
						const dir = sortBy.direction === "desc" ? "DESC" : "ASC";
						query += ` ORDER BY "${field}" ${dir}`;
					}
					if (limit) query += ` LIMIT ${limit}`;
					if (offset) query += ` OFFSET ${offset}`;

					return await sqlInstance.unsafe(query, whereValues);
				},

				async update({ model, where, update }) {
					const setClauses: string[] = [];
					const values: unknown[] = [];
					let idx = 1;

					for (const [key, value] of Object.entries(
						update as Record<string, unknown>,
					)) {
						const field = getFieldName({ model, field: key });
						setClauses.push(`"${field}" = $${idx++}`);
						values.push(value);
					}

					const { whereClause, whereValues } = buildWhereClause(
						model,
						where,
						idx,
					);
					values.push(...whereValues);

					const result = await sqlInstance.unsafe(
						`UPDATE "${model}" SET ${setClauses.join(", ")} ${whereClause} RETURNING *`,
						values,
					);
					return result[0] ?? null;
				},

				async updateMany({ model, where, update }) {
					const setClauses: string[] = [];
					const values: unknown[] = [];
					let idx = 1;

					for (const [key, value] of Object.entries(
						update as Record<string, unknown>,
					)) {
						const field = getFieldName({ model, field: key });
						setClauses.push(`"${field}" = $${idx++}`);
						values.push(value);
					}

					const { whereClause, whereValues } = buildWhereClause(
						model,
						where,
						idx,
					);
					values.push(...whereValues);

					const result = await sqlInstance.unsafe(
						`UPDATE "${model}" SET ${setClauses.join(", ")} ${whereClause}`,
						values,
					);
					return result.count;
				},

				async delete({ model, where }) {
					const { whereClause, whereValues } = buildWhereClause(model, where, 1);
					await sqlInstance.unsafe(
						`DELETE FROM "${model}" ${whereClause}`,
						whereValues,
					);
				},

				async deleteMany({ model, where }) {
					const { whereClause, whereValues } = buildWhereClause(model, where, 1);
					const result = await sqlInstance.unsafe(
						`DELETE FROM "${model}" ${whereClause}`,
						whereValues,
					);
					return result.count;
				},

				async count({ model, where }) {
					const { whereClause, whereValues } = buildWhereClause(model, where, 1);
					const result = await sqlInstance.unsafe(
						`SELECT COUNT(*)::int as count FROM "${model}" ${whereClause}`,
						whereValues,
					);
					return result[0]?.count ?? 0;
				},

				options: config,
			};
		};
	};

	let adapterOptions: AdapterFactoryOptions | null = null;

	adapterOptions = {
		config: {
			adapterId: "bun-sql",
			adapterName: "Bun SQL Adapter",
			usePlural: config.usePlural,
			debugLogs: config.debugLogs,
			supportsJSON: true,
			supportsDates: true,
			supportsBooleans: true,
			supportsNumericIds: true,
			transaction: config.transaction
				? (cb) =>
						sql.begin(async (trx) => {
							const txAdapter = createCustomAdapter(trx as unknown as SQL);
							const adapter = createAdapterFactory({
								config: { ...adapterOptions!.config, transaction: false },
								adapter: txAdapter,
							})(lazyOptions!);
							return await cb(adapter);
						})
				: false,
		},
		adapter: createCustomAdapter(sql),
	};

	const adapter = createAdapterFactory(adapterOptions);

	return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
		lazyOptions = options;
		return adapter(options);
	};
};
