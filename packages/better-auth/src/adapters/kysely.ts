import { Kysely } from "kysely";
import { FieldAttribute } from "../db";
import { Adapter, Where } from "../types/adapter";
import { Dialect, MysqlDialect, PostgresDialect, SqliteDialect } from "kysely";
import { BetterAuthOptions } from "../types";
import { createPool } from "mysql2";
import Database from "better-sqlite3";
import pg from "pg";

const { Pool } = pg;

function convertWhere(w?: Where[]) {
	if (!w)
		return {
			and: null,
			or: null,
		};
	const and = w
		?.filter((w) => w.connector === "AND" || !w.connector)
		.reduce(
			(acc, w) =>
				({
					// biome-ignore lint/performance/noAccumulatingSpread: <explanation>
					...acc,
					[w.field]: w.value,
				}) as any,
			{},
		);
	const or = w
		?.filter((w) => w.connector === "OR")
		.reduce(
			(acc, w) =>
				({
					// biome-ignore lint/performance/noAccumulatingSpread: <explanation>
					...acc,
					[w.field]: w.value,
				}) as any,
			{},
		);
	return {
		and: Object.keys(and).length ? and : null,
		or: Object.keys(or).length ? or : null,
	};
}

function transformTo(
	val: any,
	fields: Record<string, FieldAttribute>,
	transform: KyselyAdapterConfig["transform"],
) {
	for (const key in val) {
		if (
			val[key] === 0 &&
			fields[key]?.type === "boolean" &&
			transform?.boolean
		) {
			val[key] = false;
		}
		if (
			val[key] === 1 &&
			fields[key]?.type === "boolean" &&
			transform?.boolean
		) {
			val[key] = true;
		}
		if (fields[key]?.type === "date") {
			if (!(val[key] instanceof Date)) {
				val[key] = new Date(val[key]);
			}
		}
	}
	return val;
}

function transformFrom(val: any, transform: KyselyAdapterConfig["transform"]) {
	for (const key in val) {
		if (typeof val[key] === "boolean" && transform?.boolean) {
			val[key] = val[key] ? 1 : 0;
		}
		if (val[key] instanceof Date) {
			val[key] = val[key].toISOString();
		}
	}
	return val;
}

export interface KyselyAdapterConfig {
	/**
	 * Transform dates and booleans for sqlite.
	 */
	transform?: {
		schema: {
			[table: string]: Record<string, FieldAttribute>;
		};
		boolean: boolean;
		date: boolean;
	};
}

export const kyselyAdapter = (
	db: Kysely<any>,
	config?: KyselyAdapterConfig,
): Adapter => {
	return {
		async create(data) {
			let { model, data: val, select } = data;
			if (config?.transform) {
				val = transformFrom(val, config.transform);
			}
			let res = await db
				.insertInto(model)
				.values(val)
				.returningAll()
				.executeTakeFirst();

			if (config?.transform) {
				const schema = config.transform.schema[model];
				res = schema ? transformTo(val, schema, config.transform) : res;
			}

			if (select?.length) {
				const data = res
					? select.reduce((acc, cur) => {
							if (res?.[cur]) {
								return {
									// biome-ignore lint/performance/noAccumulatingSpread: <explanation>
									...acc,
									[cur]: res[cur],
								};
							}
							return acc;
						}, {} as any)
					: null;
				res = data;
			}

			return res as any;
		},
		async findOne(data) {
			const { model, where, select } = data;
			const { and, or } = convertWhere(where);
			let query = db.selectFrom(model).selectAll();
			if (or) {
				query = query.where((eb) => eb.or(or));
			}
			if (and) {
				query = query.where((eb) => eb.and(and));
			}
			let res = await query.executeTakeFirst();
			if (select?.length) {
				const data = res
					? select.reduce((acc, cur) => {
							if (res?.[cur]) {
								return {
									// biome-ignore lint/performance/noAccumulatingSpread: <explanation>
									...acc,
									[cur]: res[cur],
								};
							}
							return acc;
						}, {} as any)
					: null;
				res = data;
			}

			if (config?.transform) {
				const schema = config.transform.schema[model];
				res = res && schema ? transformTo(res, schema, config.transform) : res;

				return res || null;
			}
			return (res || null) as any;
		},
		async findMany(data) {
			const { model, where } = data;
			let query = db.selectFrom(model);
			const { and, or } = convertWhere(where);
			if (and) {
				query = query.where((eb) => eb.and(and));
			}
			if (or) {
				query = query.where((eb) => eb.or(or));
			}
			const res = await query.selectAll().execute();
			if (config?.transform) {
				const schema = config.transform.schema[model];
				return schema
					? res.map((v) => transformTo(v, schema, config.transform))
					: res;
			}
			return res as any;
		},
		async update(data) {
			let { model, where, update: val } = data;
			const { and, or } = convertWhere(where);

			if (config?.transform) {
				val = transformFrom(val, config.transform);
			}

			let query = db.updateTable(model).set(val);
			if (and) {
				query = query.where((eb) => eb.and(and));
			}
			if (or) {
				query = query.where((eb) => eb.or(or));
			}
			const res = await query.returningAll().executeTakeFirst();
			if (config?.transform) {
				const schema = config.transform.schema[model];
				return schema ? transformTo(res, schema, config.transform) : res;
			}
			return res as any;
		},
		async delete(data) {
			const { model, where } = data;
			const { and, or } = convertWhere(where);
			let query = db.deleteFrom(model);

			if (and) {
				query = query.where((eb) => eb.and(and));
			}
			if (or) {
				query = query.where((eb) => eb.or(or));
			}

			await query.execute();
		},
	};
};

export const getDialect = (config: BetterAuthOptions) => {
	if (!config.database) {
		return null;
	}
	let dialect: Dialect | null = null;
	if ("provider" in config.database) {
		const provider = config.database.provider;
		const connectionString = config.database.url.trim();
		if (provider === "postgres") {
			const pool = new Pool({
				connectionString,
			});
			dialect = new PostgresDialect({
				pool,
			});
		}
		if (provider === "mysql") {
			const params = new URL(connectionString);
			const pool = createPool({
				host: params.hostname,
				user: params.username,
				password: params.password,
				database: params.pathname.split("/")[1],
				port: Number(params.port),
			});
			dialect = new MysqlDialect({ pool });
		}

		if (provider === "sqlite") {
			const db = new Database(connectionString);
			dialect = new SqliteDialect({
				database: db,
			});
		}
	}
	return dialect;
};

export const createKyselyAdapter = (config: BetterAuthOptions) => {
	const dialect = getDialect(config);
	if (!dialect) {
		return null;
	}
	const db = new Kysely<any>({
		dialect,
	});
	return db;
};

export const getDatabaseType = (config: BetterAuthOptions) => {
	if ("provider" in config.database) {
		return config.database.provider;
	}
	if ("dialect" in config.database) {
		if (config.database.dialect instanceof PostgresDialect) {
			return "postgres";
		}
		if (config.database.dialect instanceof MysqlDialect) {
			return "mysql";
		}
		if (config.database.dialect instanceof SqliteDialect) {
			return "sqlite";
		}
	}
	return "sqlite";
};
