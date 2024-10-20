import type { Kysely } from "kysely";
import type { FieldAttribute } from "../../db";
import type { Adapter, Where } from "../../types";

function convertWhere(w?: Where[]) {
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
		const { field, value, operator = "=", connector = "AND" } = condition;
		const expr = (eb: any) => {
			if (operator.toLowerCase() === "in") {
				return eb(field, "in", Array.isArray(value) ? value : [value]);
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

function transformTo(
	val: any,
	fields: Record<string, FieldAttribute>,
	transform: KyselyAdapterConfig["transform"],
) {
	for (const key in val) {
		const field =
			fields[key] || Object.values(fields).find((f) => f.fieldName === key);
		if (val[key] === 0 && field.type === "boolean" && transform?.boolean) {
			val[key] = false;
		}
		if (val[key] === 1 && field?.type === "boolean" && transform?.boolean) {
			val[key] = true;
		}
		if (field?.type === "date") {
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
	/**
	 * Custom generateId function.
	 *
	 * If not provided, nanoid will be used.
	 * If set to false, the database's auto generated id will be used.
	 *
	 * @default nanoid
	 */
	generateId?: ((size?: number) => string) | false;
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
			if (config?.generateId !== undefined) {
				val.id = config.generateId ? config.generateId() : undefined;
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
			if (and) {
				query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
			}
			if (or) {
				query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
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
				query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
			}
			if (or) {
				query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
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

			if (val.id) {
				val.id = undefined;
			}

			let query = db.updateTable(model).set(val);
			if (and) {
				query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
			}
			if (or) {
				query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
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
				query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
			}
			if (or) {
				query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
			}

			await query.execute();
		},
		async deleteMany(data) {
			const { model, where } = data;
			const { and, or } = convertWhere(where);
			let query = db.deleteFrom(model);

			if (and) {
				query = query.where((eb) => eb.and(and.map((expr) => expr(eb))));
			}
			if (or) {
				query = query.where((eb) => eb.or(or.map((expr) => expr(eb))));
			}

			await query.execute();
		},
	};
};
export * from "./dialect";
export * from "./types";
