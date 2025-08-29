import { ObjectId, type MongoClient, type Db, ClientSession, type DbOptions } from "mongodb";
import type { BetterAuthOptions, Where } from "../../types";
import {
	createAdapter,
	type AdapterContext,
	type AdapterDebugLogs,
} from "../create-adapter";

export interface MongoDBAdapterConfig {
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: AdapterDebugLogs;
	/**
	 * Use plural table names
	 *
	 * @default false
	 */
	usePlural?: boolean;
	/**
	 * Opt out of using database transactions. Useful for compatibility with databases
	 * that don't support transactions like Cloudflare D1.
	 *
	 * @default false
	 */
	bypassTransactions?: boolean;
}

type MongoDBAdapterContext = {
	db:
		| Db
		| {
				client: MongoClient;
				database?: string;
				options?: DbOptions;
		  };
	client: MongoClient | undefined;
	session: ClientSession | undefined;
};

export const mongodbAdapter = (
	db:
		| Db
		| {
				client: MongoClient;
				database?: string;
		  },
	config?: MongoDBAdapterConfig,
) => {
	const getCustomIdGenerator = (options: BetterAuthOptions) => {
		const generator =
			options.advanced?.database?.generateId || options.advanced?.generateId;
		if (typeof generator === "function") {
			return generator;
		}
		return undefined;
	};
	return createAdapter<MongoDBAdapterContext>({
		config: {
			adapterId: "mongodb-adapter",
			adapterName: "MongoDB Adapter",
			usePlural: config?.usePlural ?? false,
			debugLogs: config?.debugLogs ?? false,
			mapKeysTransformInput: {
				id: "_id",
			},
			mapKeysTransformOutput: {
				_id: "id",
			},
			supportsNumericIds: false,
			bypassTransactions: config?.bypassTransactions ?? false,
			customTransformInput({
				action,
				data,
				field,
				fieldAttributes,
				schema,
				model,
				options,
			}) {
				const customIdGen = getCustomIdGenerator(options);

				if (field === "_id" || fieldAttributes.references?.field === "id") {
					if (customIdGen) {
						return data;
					}
					if (action === "update") {
						return data;
					}
					if (Array.isArray(data)) {
						return data.map((v) => new ObjectId());
					}
					if (typeof data === "string") {
						try {
							return new ObjectId(data);
						} catch (error) {
							return new ObjectId();
						}
					}
					return new ObjectId();
				}
				return data;
			},
			customTransformOutput({ data, field, fieldAttributes }) {
				if (field === "id" || fieldAttributes.references?.field === "id") {
					if (data instanceof ObjectId) {
						return data.toHexString();
					}
					if (Array.isArray(data)) {
						return data.map((v) => {
							if (v instanceof ObjectId) {
								return v.toHexString();
							}
							return v;
						});
					}
					return data;
				}
				return data;
			},
		},
		context: {
			db,
			client: undefined,
			session: undefined,
		},
		adapter: ({ options, getFieldName, schema, getDefaultModelName }) => {
			const serializeContext = (
				ctx: AdapterContext,
			): Omit<MongoDBAdapterContext, "db"> & { db: Db } => {
				return "client" in ctx.db
					? {
							db: ctx.db.client.db(ctx.db.database, ctx.db.options),
							client: ctx.db.client,
							session: ctx.session,
						}
					: {
							db: ctx.db,
							client: undefined,
							session: undefined,
						};
			};

			const customIdGen = getCustomIdGenerator(options);

			function serializeID({
				field,
				value,
				model,
			}: {
				field: string;
				value: any;
				model: string;
			}) {
				if (customIdGen) {
					return value;
				}
				model = getDefaultModelName(model);
				if (
					field === "id" ||
					field === "_id" ||
					schema[model].fields[field]?.references?.field === "id"
				) {
					if (typeof value !== "string") {
						if (value instanceof ObjectId) {
							return value;
						}
						if (Array.isArray(value)) {
							return value.map((v) => {
								if (typeof v === "string") {
									try {
										return new ObjectId(v);
									} catch (e) {
										return v;
									}
								}
								if (v instanceof ObjectId) {
									return v;
								}
								throw new Error("Invalid id value");
							});
						}
						throw new Error("Invalid id value");
					}
					try {
						return new ObjectId(value);
					} catch (e) {
						return value;
					}
				}
				return value;
			}

			function convertWhereClause({
				where,
				model,
			}: {
				where: Where[];
				model: string;
			}) {
				if (!where.length) return {};
				const conditions = where.map((w) => {
					const {
						field: field_,
						value,
						operator = "eq",
						connector = "AND",
					} = w;
					let condition: any;
					let field = getFieldName({ model, field: field_ });
					if (field === "id") field = "_id";
					switch (operator.toLowerCase()) {
						case "eq":
							condition = {
								[field]: serializeID({
									field,
									value,
									model,
								}),
							};
							break;
						case "in":
							condition = {
								[field]: {
									$in: Array.isArray(value)
										? value.map((v) => serializeID({ field, value: v, model }))
										: [serializeID({ field, value, model })],
								},
							};
							break;
						case "gt":
							condition = { [field]: { $gt: value } };
							break;
						case "gte":
							condition = { [field]: { $gte: value } };
							break;
						case "lt":
							condition = { [field]: { $lt: value } };
							break;
						case "lte":
							condition = { [field]: { $lte: value } };
							break;
						case "ne":
							condition = { [field]: { $ne: value } };
							break;

						case "contains":
							condition = { [field]: { $regex: `.*${value}.*` } };
							break;
						case "starts_with":
							condition = { [field]: { $regex: `${value}.*` } };
							break;
						case "ends_with":
							condition = { [field]: { $regex: `.*${value}` } };
							break;
						default:
							throw new Error(`Unsupported operator: ${operator}`);
					}
					return { condition, connector };
				});
				if (conditions.length === 1) {
					return conditions[0].condition;
				}
				const andConditions = conditions
					.filter((c) => c.connector === "AND")
					.map((c) => c.condition);
				const orConditions = conditions
					.filter((c) => c.connector === "OR")
					.map((c) => c.condition);

				let clause = {};
				if (andConditions.length) {
					clause = { ...clause, $and: andConditions };
				}
				if (orConditions.length) {
					clause = { ...clause, $or: orConditions };
				}
				return clause;
			}

			return {
				async create({ model, data: values }, context) {
					const ctx = serializeContext(context);
					const res = await ctx.db.collection(model).insertOne(values, {
						session: ctx.session,
					});
					const insertedData = { _id: res.insertedId.toString(), ...values };
					return insertedData as any;
				},
				async findOne({ model, where, select }, context) {
					const clause = convertWhereClause({ where, model });
					const ctx = serializeContext(context);
					const res = await ctx.db.collection(model).findOne(clause, {
						session: ctx.session,
					});
					if (!res) return null;
					return res as any;
				},
				async findMany({ model, where, limit, offset, sortBy }, context) {
					const clause = where ? convertWhereClause({ where, model }) : {};
					const ctx = serializeContext(context);
					const cursor = ctx.db
						.collection(model)
						.find(clause, { session: ctx.session });
					if (limit) cursor.limit(limit);
					if (offset) cursor.skip(offset);
					if (sortBy)
						cursor.sort(
							getFieldName({ field: sortBy.field, model }),
							sortBy.direction === "desc" ? -1 : 1,
						);
					const res = await cursor.toArray();
					return res as any;
				},
				async count({ model }, context) {
					const ctx = serializeContext(context);
					const res = await ctx.db
						.collection(model)
						.countDocuments(undefined, { session: ctx.session });
					return res;
				},
				async update({ model, where, update: values }, context) {
					const clause = convertWhereClause({ where, model });

					const ctx = serializeContext(context);
					const res = await ctx.db.collection(model).findOneAndUpdate(
						clause,
						{ $set: values as any },
						{
							returnDocument: "after",
							session: ctx.session,
						},
					);
					if (!res) return null;
					return res as any;
				},
				async updateMany({ model, where, update: values }, context) {
					const clause = convertWhereClause({ where, model });

					const ctx = serializeContext(context);
					const res = await ctx.db.collection(model).updateMany(
						clause,
						{
							$set: values as any,
						},
						{ session: ctx.session },
					);
					return res.modifiedCount;
				},
				async delete({ model, where }, context) {
					const clause = convertWhereClause({ where, model });
					const ctx = serializeContext(context);
					await ctx.db
						.collection(model)
						.deleteOne(clause, { session: ctx.session });
				},
				async deleteMany({ model, where }, context) {
					const clause = convertWhereClause({ where, model });
					const ctx = serializeContext(context);
					const res = await ctx.db.collection(model).deleteMany(clause, {
						session: ctx.session,
					});
					return res.deletedCount;
				},
				async transaction(callback, context) {
					const ctx = serializeContext(context);
					if (!ctx.client) {
						return callback(ctx);
					}
					const session = ctx.client.startSession();

					try {
						const res = await session.withTransaction(
							async () => {
								return callback({
									...ctx,
									session,
								});
							},
							{
								session: ctx.session,
							},
						);
						return res;
					} finally {
						await session.endSession();
					}
				},
			};
		},
	});
};
