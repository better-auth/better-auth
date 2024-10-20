import { and, asc, desc, eq, or, SQL, inArray, like } from "drizzle-orm";
import type { Adapter, Where } from "../../types";
import { BetterAuthError } from "../../error";

export interface DrizzleAdapterOptions {
	schema?: Record<string, any>;
	provider: "pg" | "mysql" | "sqlite";
	/**
	 * If the table names in the schema are plural
	 * set this to true. For example, if the schema
	 * has an object with a key "users" instead of "user"
	 */
	usePlural?: boolean;
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

function getSchema(
	modelName: string,
	options: {
		schema: Record<string, any>;
		usePlural?: boolean;
	},
) {
	const schema = options.schema;
	if (!schema) {
		throw new BetterAuthError(
			"Drizzle adapter failed to initialize. Schema not found. Please provide a schema object in the adapter options object.",
		);
	}
	const model = options.usePlural ? `${modelName}s` : modelName;

	const schemaModel = schema[model];
	if (!schemaModel) {
		throw new BetterAuthError(
			`[# Drizzle Adapter]: The model "${modelName}" was not found in the schema object. Please pass the schema directly to the adapter options.`,
		);
	}
	return schemaModel;
}

function whereConvertor(where: Where[], schemaModel: any) {
	if (!where) return [];
	if (where.length === 1) {
		const w = where[0];
		if (!w) {
			return [];
		}

		if (w.operator === "in") {
			if (!Array.isArray(w.value)) {
				throw new BetterAuthError(
					`The value for the field "${w.field}" must be an array when using the "in" operator.`,
				);
			}
			return [inArray(schemaModel[w.field], w.value)];
		}

		if (w.operator === "contains") {
			return [like(schemaModel[w.field], `%${w.value}%`)];
		}

		if (w.operator === "starts_with") {
			return [like(schemaModel[w.field], `${w.value}%`)];
		}

		if (w.operator === "ends_with") {
			return [like(schemaModel[w.field], `%${w.value}`)];
		}

		return [eq(schemaModel[w.field], w.value)];
	}
	const andGroup = where.filter((w) => w.connector === "AND" || !w.connector);
	const orGroup = where.filter((w) => w.connector === "OR");

	const andClause = and(
		...andGroup.map((w) => {
			if (w.operator === "in") {
				if (!Array.isArray(w.value)) {
					throw new BetterAuthError(
						`The value for the field "${w.field}" must be an array when using the "in" operator.`,
					);
				}
				return inArray(schemaModel[w.field], w.value);
			}
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

interface DB {
	[key: string]: any;
}

export const drizzleAdapter = (
	db: DB,
	options: DrizzleAdapterOptions,
): Adapter => {
	const schema = options.schema || db._.fullSchema;
	const databaseType = options?.provider;
	return {
		id: "drizzle",
		async create(data) {
			const { model, data: val } = data;
			const schemaModel = getSchema(model, {
				schema,
				usePlural: options.usePlural,
			});
			if (options.generateId !== undefined) {
				val.id = options.generateId ? options.generateId() : undefined;
			}

			const mutation = db.insert(schemaModel).values(val);
			if (databaseType !== "mysql") return (await mutation.returning())[0];

			await mutation;
			const res = await db
				.select()
				.from(schemaModel)
				.where(eq(schemaModel.id, (data.data as { id: string }).id));
			return res[0];
		},
		async findOne(data) {
			const { model, where, select: included } = data;

			const schemaModel = getSchema(model, {
				schema,
				usePlural: options.usePlural,
			});

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
			const { model, where, limit, offset, sortBy } = data;
			const schemaModel = getSchema(model, {
				schema,
				usePlural: options.usePlural,
			});
			const filters = where ? whereConvertor(where, schemaModel) : [];
			const fn = sortBy?.direction === "desc" ? desc : asc;
			const res = await db
				.select()
				.from(schemaModel)
				.limit(limit || 100)
				.offset(offset || 0)
				.orderBy(fn(schemaModel[sortBy?.field || "id"]))
				.where(...(filters.length ? filters : []));

			return res;
		},
		async update(data) {
			const { model, where, update } = data;
			const schemaModel = getSchema(model, {
				schema,
				usePlural: options.usePlural,
			});
			if (update.id) {
				update.id = undefined;
			}
			const wheres = whereConvertor(where, schemaModel);
			const mutation = db
				.update(schemaModel)
				.set(update)
				.where(...wheres);
			if (databaseType !== "mysql") return (await mutation.returning())[0];

			await mutation;
			const res = await db
				.select()
				.from(schemaModel)
				.where(eq(schemaModel.id, (data.update as { id: string }).id));
			return res[0];
		},
		async delete(data) {
			const { model, where } = data;
			const schemaModel = getSchema(model, {
				schema,
				usePlural: options.usePlural,
			});
			const wheres = whereConvertor(where, schemaModel);
			const res = await db.delete(schemaModel).where(...wheres);

			return res[0];
		},
		async deleteMany(data) {
			const { model, where } = data;
			const schemaModel = getSchema(model, {
				schema,
				usePlural: options.usePlural,
			});
			const wheres = whereConvertor(where, schemaModel);
			await db.delete(schemaModel).where(...wheres);
		},
		options,
	};
};
