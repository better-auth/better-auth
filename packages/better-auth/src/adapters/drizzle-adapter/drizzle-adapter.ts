import { and, asc, desc, eq, inArray, like, or, SQL } from "drizzle-orm";
import { getAuthTables } from "../../db";
import { BetterAuthError } from "../../error";
import type { Adapter, BetterAuthOptions, Where } from "../../types";

interface DB {
	[key: string]: any;
}

const createTransform = (
	db: DB,
	config: DrizzleAdapterConfig,
	options: BetterAuthOptions,
) => {
	const schema = getAuthTables(options);

	function getField(model: string, field: string) {
		if (field === "id") {
			return field;
		}
		const f = schema[model].fields[field];
		return f.fieldName || field;
	}

	function getSchema(modelName: string) {
		const schema = config.schema || db._.fullSchema;
		if (!schema) {
			throw new BetterAuthError(
				"Drizzle adapter failed to initialize. Schema not found. Please provide a schema object in the adapter options object.",
			);
		}
		const model = getModelName(modelName);
		const schemaModel = schema[model];
		if (!schemaModel) {
			throw new BetterAuthError(
				`[# Drizzle Adapter]: The model "${modelName}" was not found in the schema object. Please pass the schema directly to the adapter options.`,
			);
		}
		return schemaModel;
	}

	const getModelName = (model: string) => {
		return schema[model].tableName !== model
			? schema[model].tableName
			: config.usePlural
				? `${model}s`
				: model;
	};

	return {
		getSchema,
		transformInput(data: Record<string, any>, model: string) {
			const transformedData: Record<string, any> = data.id
				? {
						id: data.id,
					}
				: {};
			for (const key in data) {
				const field = schema[model].fields[key];
				if (field) {
					transformedData[field.fieldName || key] = data[key];
				}
			}
			return transformedData;
		},
		transformOutput(
			data: Record<string, any>,
			model: string,
			select: string[] = [],
		) {
			if (!data) return null;
			const transformedData: Record<string, any> =
				data.id || data._id
					? select.length === 0 || select.includes("id")
						? {
								id: data.id,
							}
						: {}
					: {};
			const tableSchema = schema[model].fields;
			for (const key in tableSchema) {
				if (select.length && !select.includes(key)) {
					continue;
				}
				const field = tableSchema[key];
				if (field) {
					transformedData[key] = data[field.fieldName || key];
				}
			}
			return transformedData as any;
		},
		convertWhereClause(where: Where[], model: string) {
			const schemaModel = getSchema(model);
			if (!where) return [];
			if (where.length === 1) {
				const w = where[0];
				if (!w) {
					return [];
				}
				const field = getField(model, w.field);
				if (w.operator === "in") {
					if (!Array.isArray(w.value)) {
						throw new BetterAuthError(
							`The value for the field "${w.field}" must be an array when using the "in" operator.`,
						);
					}
					return [inArray(schemaModel[field], w.value)];
				}

				if (w.operator === "contains") {
					return [like(schemaModel[field], `%${w.value}%`)];
				}

				if (w.operator === "starts_with") {
					return [like(schemaModel[field], `${w.value}%`)];
				}

				if (w.operator === "ends_with") {
					return [like(schemaModel[field], `%${w.value}`)];
				}

				return [eq(schemaModel[field], w.value)];
			}
			const andGroup = where.filter(
				(w) => w.connector === "AND" || !w.connector,
			);
			const orGroup = where.filter((w) => w.connector === "OR");

			const andClause = and(
				...andGroup.map((w) => {
					const field = getField(model, w.field);
					if (w.operator === "in") {
						if (!Array.isArray(w.value)) {
							throw new BetterAuthError(
								`The value for the field "${w.field}" must be an array when using the "in" operator.`,
							);
						}
						return inArray(schemaModel[field], w.value);
					}
					return eq(schemaModel[field], w.value);
				}),
			);
			const orClause = or(
				...orGroup.map((w) => {
					const field = getField(model, w.field);
					return eq(schemaModel[field], w.value);
				}),
			);

			const clause: SQL<unknown>[] = [];

			if (andGroup.length) clause.push(andClause!);
			if (orGroup.length) clause.push(orClause!);
			return clause;
		},
		withReturning: async (
			model: string,
			builder: any,
			data: Record<string, any>,
		) => {
			if (config.provider !== "mysql") {
				const c = await builder.returning();
				return c[0];
			}
			await builder;
			const schemaModel = getSchema(getModelName(model));
			const res = await db
				.select()
				.from(schemaModel)
				.where(eq(schemaModel.id, data.id));
			return res[0];
		},
	};
};

interface DrizzleAdapterConfig {
	/**
	 * The schema object that defines the tables and fields
	 */
	schema?: Record<string, any>;
	/**
	 * The database provider
	 */
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

export const drizzleAdapter =
	(db: DB, config: DrizzleAdapterConfig) => (options: BetterAuthOptions) => {
		const {
			transformInput,
			transformOutput,
			convertWhereClause,
			getSchema,
			withReturning,
		} = createTransform(db, config, options);
		return {
			id: "drizzle",
			async create(data) {
				const { model, data: values } = data;
				const transformed = transformInput(values, model);
				const schemaModel = getSchema(model);
				const builder = db.insert(schemaModel).values(transformed);
				const returned = await withReturning(model, builder, transformed);
				return transformOutput(returned, model);
			},
			async findOne(data) {
				const { model, where, select } = data;
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				const res = await db
					.select()
					.from(schemaModel)
					.where(...clause);
				if (!res.length) return null;
				return transformOutput(res[0], model, select);
			},
			async findMany(data) {
				const { model, where, sortBy, limit, offset } = data;
				const schemaModel = getSchema(model);
				const clause = where ? convertWhereClause(where, model) : [];

				const sortFn = sortBy?.direction === "desc" ? desc : asc;
				const builder = db
					.select()
					.from(schemaModel)
					.limit(limit || 100)
					.offset(offset || 0)
					.orderBy(sortFn(schemaModel[sortBy?.field || "id"]));
				const res = (await builder.where(...clause)) as any[];
				return res.map((r) => transformOutput(r, model));
			},
			async update(data) {
				const { model, where, update: values } = data;
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				const transformed = transformInput(values, model);
				const builder = db
					.update(schemaModel)
					.set(transformed)
					.where(...clause);
				const returned = await withReturning(model, builder, transformed);
				return transformOutput(returned, model);
			},
			async updateMany(data) {
				const { model, where, update: values } = data;
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				const transformed = transformInput(values, model);
				const builder = db
					.update(schemaModel)
					.set(transformed)
					.where(...clause);
				const res = await builder;
				return res ? res.changes : 0;
			},
			async delete(data) {
				const { model, where } = data;
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				const builder = db.delete(schemaModel).where(...clause);
				await builder;
			},
			async deleteMany(data) {
				const { model, where } = data;
				const schemaModel = getSchema(model);
				const clause = convertWhereClause(where, model);
				const builder = db.delete(schemaModel).where(...clause);
				const res = await builder;
				return res ? res.length : 0;
			},
			options: config,
		} satisfies Adapter;
	};
