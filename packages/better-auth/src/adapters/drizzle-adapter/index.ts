import { and, eq, or, SQL } from "drizzle-orm";
import type { Adapter, Where } from "../../types";

export interface DrizzleAdapterOptions {
	schema: Record<string, any>;
}

function getSchema(modelName: string, schema: Record<string, any>) {
	const key = Object.keys(schema).find((key) => {
		const modelName = schema[key].name;
		return modelName === modelName;
	});
	if (!key) {
		throw new Error("Model not found");
	}
	return schema[key];
}

function whereConvertor(where: Where[], schemaModel: any) {
	if (!where) return [];
	if (where.length === 1) {
		const w = where[0];
		if (!w) {
			return [];
		}
		return [eq(schemaModel[w.field], w.value)];
	}
	const andGroup = where.filter((w) => w.connector === "AND" || !w.connector);
	const orGroup = where.filter((w) => w.connector === "OR");

	const andClause = and(
		...andGroup.map((w) => {
			return eq(schemaModel[w.field], w.value);
		}),
	);
	const orClause = or(
		...orGroup.map((w) => {
			return eq(schemaModel[w.field], w.value);
		}),
	);
	const clause: SQL<unknown>[] = [];

	if (andGroup.length) clause.push(andClause!);
	if (orGroup.length) clause.push(orClause!);
	return clause;
}

export const drizzleAdapter = (
	db: Record<string, any>,
	{ schema }: DrizzleAdapterOptions,
): Adapter => {
	return {
		async create(data) {
			const { model, data: val } = data;
			const schemaModel = getSchema(model, schema);
			const res = await db.insert(schemaModel).values(val).returning();
			return res[0];
		},
		async findOne(data) {
			const { model, where, select: included } = data;
			const schemaModel = getSchema(model, schema);
			const wheres = whereConvertor(where, schemaModel);

			let res = null;
			if (!!included?.length) {
				res = await db
					.select(
						...included.map((include) => {
							return {
								[include]: schemaModel[include],
							};
						}),
					)
					.from(schemaModel)
					.where(...wheres);
			} else {
				res = await db
					.select()
					.from(schemaModel)
					.where(...wheres);
			}

			if (!!res.length) return res[0];
			else return null;
		},
		async findMany(data) {
			const { model, where } = data;
			const schemaModel = getSchema(model, schema);
			const wheres = where ? whereConvertor(where, schemaModel) : [];

			return await db
				.select()
				.from(schemaModel)
				.findMany(...wheres);
		},
		async update(data) {
			const { model, where, update } = data;
			const schemaModel = getSchema(model, schema);
			const wheres = whereConvertor(where, schemaModel);
			const res = await db
				.update(schemaModel)
				.set(update)
				.where(...wheres)
				.returning();
			return res[0];
		},
		async delete(data) {
			const { model, where } = data;
			const schemaModel = getSchema(model, schema);
			const wheres = whereConvertor(where, schemaModel);
			const res = await db.delete(schemaModel).where(...wheres);

			return res[0];
		},
	};
};
