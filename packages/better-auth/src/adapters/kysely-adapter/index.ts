import type { Kysely } from "kysely";
import type { FieldAttribute } from "../../db";
import type { Adapter, Where } from "../../types";
import { getMigrations } from "../../cli/utils/get-migration";

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
		id: "kysely",
		async create(data) {
			let { model, data: val, select } = data;
			if (config?.transform) {
				val = transformFrom(val, config.transform);
			}
			let res = await db
				.insertInto(model)
				.values(val as any)
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
			const { model, where, limit, offset, sortBy } = data;
			let query = db.selectFrom(model);
			const { and, or } = convertWhere(where);
			if (and) {
				query = query.where((eb) => eb.and(and));
			}
			if (or) {
				query = query.where((eb) => eb.or(or));
			}
			query = query.limit(limit || 100);
			if (offset) {
				query = query.offset(offset);
			}
			if (sortBy) {
				query = query.orderBy(sortBy.field, sortBy.direction);
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
			const res = (await query.returningAll().executeTakeFirst()) || null;
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
		async createSchema(options) {
			const { compileMigrations } = await getMigrations(options);
			const migrations = await compileMigrations();
			return {
				code: migrations,
				fileName: `./better-auth_migrations/${new Date()
					.toISOString()
					.replace(/:/g, "-")}.sql`,
			};
		},
	};
};
