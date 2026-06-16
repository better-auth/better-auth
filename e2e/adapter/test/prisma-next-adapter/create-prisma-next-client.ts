/**
 * Creates a mock Prisma Next-compatible ORM client backed by a raw `pg` Pool.
 *
 * This simulates the Prisma Next fluent ORM API (`db.orm.model.where(...).find()`)
 * by translating queries to raw SQL against PostgreSQL. Once Prisma Next reaches
 * GA and can be installed directly, this mock should be replaced with the real
 * `@prisma-next/postgres/runtime` client.
 *
 * Better-auth migrations create tables with camelCase column names (e.g. "userId",
 * "createdAt") so this mock quotes all identifiers to preserve case.
 */
import type { Pool, PoolClient } from "pg";

interface WhereFilter {
	[key: string]: unknown;
}

interface CollectionState {
	model: string;
	where: WhereFilter;
	selectFields: string[] | null;
	includes: Array<{ relation: string; limit?: number }>;
	orderByClause: Record<string, "asc" | "desc"> | null;
	skipCount: number | null;
	takeCount: number | null;
}

function q(name: string): string {
	return `"${name}"`;
}

function buildWhereSQL(
	where: WhereFilter,
	params: unknown[],
): string {
	const conditions: string[] = [];

	for (const [key, value] of Object.entries(where)) {
		if (key === "AND" && Array.isArray(value)) {
			const subConditions = value.map((sub: WhereFilter) => {
				const subParts: string[] = [];
				for (const [k, v] of Object.entries(sub)) {
					subParts.push(buildSingleCondition(k, v, params));
				}
				return subParts.join(" AND ");
			});
			conditions.push(`(${subConditions.join(" AND ")})`);
		} else if (key === "OR" && Array.isArray(value)) {
			const subConditions = value.map((sub: WhereFilter) => {
				const subParts: string[] = [];
				for (const [k, v] of Object.entries(sub)) {
					subParts.push(buildSingleCondition(k, v, params));
				}
				return subParts.join(" AND ");
			});
			conditions.push(`(${subConditions.join(" OR ")})`);
		} else {
			conditions.push(buildSingleCondition(key, value, params));
		}
	}

	return conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
}

function buildSingleCondition(
	field: string,
	value: unknown,
	params: unknown[],
): string {
	const col = q(field);

	if (value === null || value === undefined) {
		return `${col} IS NULL`;
	}

	if (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		!(value instanceof Date)
	) {
		const op = value as Record<string, unknown>;

		if ("equals" in op) {
			if (op.equals === null) return `${col} IS NULL`;
			params.push(op.equals);
			if (op.mode === "insensitive") {
				return `LOWER(${col}::text) = LOWER($${params.length}::text)`;
			}
			return `${col} = $${params.length}`;
		}
		if ("not" in op) {
			if (op.not === null) return `${col} IS NOT NULL`;
			if (
				typeof op.not === "object" &&
				op.not !== null &&
				"equals" in (op.not as Record<string, unknown>)
			) {
				const inner = op.not as Record<string, unknown>;
				params.push(inner.equals);
				if (op.mode === "insensitive") {
					return `LOWER(${col}::text) != LOWER($${params.length}::text)`;
				}
				return `${col} != $${params.length}`;
			}
			params.push(op.not);
			if (op.mode === "insensitive") {
				return `LOWER(${col}::text) != LOWER($${params.length}::text)`;
			}
			return `${col} != $${params.length}`;
		}
		if ("gt" in op) {
			params.push(op.gt);
			return `${col} > $${params.length}`;
		}
		if ("gte" in op) {
			params.push(op.gte);
			return `${col} >= $${params.length}`;
		}
		if ("lt" in op) {
			params.push(op.lt);
			return `${col} < $${params.length}`;
		}
		if ("lte" in op) {
			params.push(op.lte);
			return `${col} <= $${params.length}`;
		}
		if ("in" in op) {
			const arr = op.in as unknown[];
			if (arr.length === 0) return "FALSE";
			const placeholders = arr.map((v) => {
				params.push(v);
				return `$${params.length}`;
			});
			if (op.mode === "insensitive") {
				return `LOWER(${col}::text) IN (${placeholders.map((p) => `LOWER(${p}::text)`).join(", ")})`;
			}
			return `${col} IN (${placeholders.join(", ")})`;
		}
		if ("notIn" in op) {
			const arr = op.notIn as unknown[];
			if (arr.length === 0) return "TRUE";
			const placeholders = arr.map((v) => {
				params.push(v);
				return `$${params.length}`;
			});
			return `${col} NOT IN (${placeholders.join(", ")})`;
		}
		if ("contains" in op) {
			params.push(`%${op.contains}%`);
			if (op.mode === "insensitive") {
				return `${col}::text ILIKE $${params.length}`;
			}
			return `${col}::text LIKE $${params.length}`;
		}
		if ("startsWith" in op) {
			params.push(`${op.startsWith}%`);
			if (op.mode === "insensitive") {
				return `${col}::text ILIKE $${params.length}`;
			}
			return `${col}::text LIKE $${params.length}`;
		}
		if ("endsWith" in op) {
			params.push(`%${op.endsWith}`);
			if (op.mode === "insensitive") {
				return `${col}::text ILIKE $${params.length}`;
			}
			return `${col}::text LIKE $${params.length}`;
		}
		if ("increment" in op) {
			return "";
		}
	}

	params.push(value);
	return `${col} = $${params.length}`;
}

function createCollection(
	pool: Pool | PoolClient,
	state: CollectionState,
): any {
	const self: any = {};
	const tableName = q(state.model);

	self.where = (filter: WhereFilter) => {
		return createCollection(pool, {
			...state,
			where: { ...state.where, ...filter },
		});
	};

	self.select = (...fields: string[]) => {
		return createCollection(pool, {
			...state,
			selectFields: fields,
		});
	};

	self.include = (relation: string, refinement?: (c: any) => any) => {
		const limit = refinement
			? (() => {
					let lim: number | undefined;
					const fake: any = {
						take: (n: number) => {
							lim = n;
							return fake;
						},
					};
					refinement(fake);
					return lim;
				})()
			: undefined;
		return createCollection(pool, {
			...state,
			includes: [...state.includes, { relation, limit }],
		});
	};

	self.orderBy = (spec: Record<string, "asc" | "desc">) => {
		return createCollection(pool, {
			...state,
			orderByClause: spec,
		});
	};

	self.skip = (n: number) => {
		return createCollection(pool, { ...state, skipCount: n });
	};

	self.take = (n: number) => {
		return createCollection(pool, { ...state, takeCount: n });
	};

	const resolveIncludes = async (row: Record<string, unknown>) => {
		if (state.includes.length === 0) return row;
		for (const inc of state.includes) {
			const relationTable = q(inc.relation);
			const fkCol = q(`${state.model}Id`);
			let relSql = `SELECT * FROM ${relationTable} WHERE ${fkCol} = $1`;
			if (inc.limit != null) {
				relSql += ` LIMIT ${inc.limit}`;
			}
			const relResult = await pool.query(relSql, [row.id]);
			row[inc.relation] = relResult.rows;
		}
		return row;
	};

	self.find = async () => {
		const params: unknown[] = [];
		const whereSql = buildWhereSQL(state.where, params);
		const selectSql = state.selectFields
			? state.selectFields.map((f) => q(f)).join(", ")
			: "*";
		const sql = `SELECT ${selectSql} FROM ${tableName} WHERE ${whereSql} LIMIT 1`;
		const result = await pool.query(sql, params);
		if (!result.rows[0]) return null;
		return resolveIncludes(result.rows[0]);
	};

	self.all = async () => {
		const params: unknown[] = [];
		const whereSql =
			Object.keys(state.where).length > 0
				? buildWhereSQL(state.where, params)
				: "TRUE";
		const selectSql = state.selectFields
			? state.selectFields.map((f) => q(f)).join(", ")
			: "*";
		let sql = `SELECT ${selectSql} FROM ${tableName} WHERE ${whereSql}`;
		if (state.orderByClause) {
			const orders = Object.entries(state.orderByClause)
				.map(([f, d]) => `${q(f)} ${d.toUpperCase()}`)
				.join(", ");
			sql += ` ORDER BY ${orders}`;
		}
		if (state.takeCount != null) {
			sql += ` LIMIT ${state.takeCount}`;
		}
		if (state.skipCount != null) {
			sql += ` OFFSET ${state.skipCount}`;
		}
		const result = await pool.query(sql, params);
		if (state.includes.length > 0) {
			for (const row of result.rows) {
				await resolveIncludes(row);
			}
		}
		return result.rows;
	};

	self.create = async (data: Record<string, unknown>) => {
		const entries = Object.entries(data);
		const cols = entries.map(([k]) => q(k)).join(", ");
		const params = entries.map(([, v]) => v);
		const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
		const sql = `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders}) RETURNING *`;
		const result = await pool.query(sql, params);
		return result.rows[0];
	};

	self.update = async (data: Record<string, unknown>) => {
		const params: unknown[] = [];
		const setClauses: string[] = [];
		for (const [key, value] of Object.entries(data)) {
			if (
				typeof value === "object" &&
				value !== null &&
				"increment" in (value as Record<string, unknown>)
			) {
				const delta = (value as Record<string, unknown>).increment;
				params.push(delta);
				setClauses.push(`${q(key)} = ${q(key)} + $${params.length}`);
			} else {
				params.push(value);
				setClauses.push(`${q(key)} = $${params.length}`);
			}
		}
		const whereSql = buildWhereSQL(state.where, params);
		const sql = `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE ${whereSql} RETURNING *`;
		const result = await pool.query(sql, params);
		if (result.rows.length === 0) {
			const err = new Error("No record found");
			(err as any).code = "NOT_FOUND";
			throw err;
		}
		return result.rows[0];
	};

	self.updateAll = async (data: Record<string, unknown>) => {
		const params: unknown[] = [];
		const setClauses: string[] = [];
		for (const [key, value] of Object.entries(data)) {
			if (
				typeof value === "object" &&
				value !== null &&
				"increment" in (value as Record<string, unknown>)
			) {
				const delta = (value as Record<string, unknown>).increment;
				params.push(delta);
				setClauses.push(`${q(key)} = ${q(key)} + $${params.length}`);
			} else {
				params.push(value);
				setClauses.push(`${q(key)} = $${params.length}`);
			}
		}
		const whereSql = buildWhereSQL(state.where, params);
		const sql = `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE ${whereSql} RETURNING *`;
		const result = await pool.query(sql, params);
		return result.rows;
	};

	self.updateCount = async (data: Record<string, unknown>) => {
		const params: unknown[] = [];
		const setClauses: string[] = [];
		for (const [key, value] of Object.entries(data)) {
			if (
				typeof value === "object" &&
				value !== null &&
				"increment" in (value as Record<string, unknown>)
			) {
				const delta = (value as Record<string, unknown>).increment;
				params.push(delta);
				setClauses.push(`${q(key)} = ${q(key)} + $${params.length}`);
			} else {
				params.push(value);
				setClauses.push(`${q(key)} = $${params.length}`);
			}
		}
		const whereSql = buildWhereSQL(state.where, params);
		const sql = `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE ${whereSql}`;
		const result = await pool.query(sql, params);
		return result.rowCount ?? 0;
	};

	self.delete = async () => {
		const params: unknown[] = [];
		const whereSql = buildWhereSQL(state.where, params);
		const sql = `DELETE FROM ${tableName} WHERE ${whereSql} RETURNING *`;
		const result = await pool.query(sql, params);
		if (result.rows.length === 0) {
			const err = new Error("No record found");
			(err as any).code = "NOT_FOUND";
			throw err;
		}
		return result.rows[0];
	};

	self.deleteAll = async () => {
		const params: unknown[] = [];
		const whereSql = buildWhereSQL(state.where, params);
		const sql = `DELETE FROM ${tableName} WHERE ${whereSql} RETURNING *`;
		const result = await pool.query(sql, params);
		return result.rows;
	};

	self.deleteCount = async () => {
		const params: unknown[] = [];
		const whereSql = buildWhereSQL(state.where, params);
		const sql = `DELETE FROM ${tableName} WHERE ${whereSql}`;
		const result = await pool.query(sql, params);
		return result.rowCount ?? 0;
	};

	self.aggregate = async (fn: (a: any) => Record<string, unknown>) => {
		const aggregator = { count: () => "COUNT(*)" };
		const spec = fn(aggregator);
		const params: unknown[] = [];
		const whereSql =
			Object.keys(state.where).length > 0
				? buildWhereSQL(state.where, params)
				: "TRUE";
		const selectParts: string[] = [];
		const aliases: string[] = [];
		for (const [alias, expr] of Object.entries(spec)) {
			selectParts.push(`${expr} AS "${alias}"`);
			aliases.push(alias);
		}
		const sql = `SELECT ${selectParts.join(", ")} FROM ${tableName} WHERE ${whereSql}`;
		const result = await pool.query(sql, params);
		const row = result.rows[0];
		const mapped: Record<string, unknown> = {};
		for (const alias of aliases) {
			mapped[alias] = Number(row[alias]);
		}
		return mapped;
	};

	return self;
}

/**
 * Creates a Prisma Next-compatible client backed by a PostgreSQL pool.
 * Implements the same interface (`db.orm[model]` fluent API) that
 * the `prismaNextAdapter` expects.
 */
export function createPrismaNextClient(pool: Pool) {
	const orm = new Proxy(
		{},
		{
			get(_target, prop: string) {
				return createCollection(pool, {
					model: prop,
					where: {},
					selectFields: null,
					includes: [],
					orderByClause: null,
					skipCount: null,
					takeCount: null,
				});
			},
		},
	);

	return {
		orm,
		transaction: async <R>(
			callback: (tx: any) => R | Promise<R>,
		): Promise<R> => {
			const client = await pool.connect();
			try {
				await client.query("BEGIN");
				const txOrm = new Proxy(
					{},
					{
						get(_target, prop: string) {
							return createCollection(client as any, {
								model: prop,
								where: {},
								selectFields: null,
								includes: [],
								orderByClause: null,
								skipCount: null,
								takeCount: null,
							});
						},
					},
				);
				const result = await callback({
					orm: txOrm,
					transaction: () => {
						throw new Error("Nested transactions not supported");
					},
				});
				await client.query("COMMIT");
				return result;
			} catch (e) {
				await client.query("ROLLBACK");
				throw e;
			} finally {
				client.release();
			}
		},
	};
}
