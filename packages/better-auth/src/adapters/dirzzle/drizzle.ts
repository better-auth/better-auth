import type { Adapter, Where } from "../../types";

export interface DrizzleAdapterOptions<
	T extends Record<string, any> = Record<string, any>,
> {
	db: T;
	schema: Record<string, any>;
}

function getSchema(modelName: string, schema: Record<string, any>) {
	const key = Object.keys(schema).find((key) => {
		const modelName = schema[key]._.name;
		return modelName === modelName;
	});
	if (!key) {
		throw new Error("Model not found");
	}
	return schema[key];
}

function convertWhere(where: Where[]) {
	const and = where.filter((w) => w.connector === "AND" || !w.connector);
	const or = where.filter((w) => w.connector === "OR");
}

export const drizzleAdapter = ({
	db,
	schema,
}: DrizzleAdapterOptions): Adapter => {
	return {
		async create(data) {
			const { model, data: val } = data;
			const schemaModel = getSchema(model, schema);
			return await db.insert(schemaModel).values(val);
		},
		async findOne(data) {
			const { model, where } = data;
			const schemaModel = getSchema(model, schema);
			return await db.select().from(schemaModel).where(where);
		},
		async findMany(data) {
			const { model, where } = data;
			return await db[model].findMany({ where });
		},
		async update(data) {
			const { model, where, update } = data;
			return await db[model].update({
				where,
				data,
			});
		},
		async delete(data) {
			const { model, where } = data;
			return await db[model].delete({ where });
		},
	};
};
