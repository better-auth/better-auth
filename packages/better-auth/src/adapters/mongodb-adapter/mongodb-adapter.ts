import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBAdapter,
	DBAdapterDebugLogOption,
	Where,
} from "@better-auth/core/db/adapter";
import { ClientSession, type Db, type MongoClient, ObjectId } from "mongodb";
import {
	type AdapterFactoryCustomizeAdapterCreator,
	type AdapterFactoryOptions,
	createAdapterFactory,
} from "../adapter-factory";

export interface MongoDBAdapterConfig {
	/**
	 * MongoDB client instance
	 * If not provided, Database transactions won't be enabled.
	 */
	client?: MongoClient | undefined;
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption | undefined;
	/**
	 * Use plural table names
	 *
	 * @default false
	 */
	usePlural?: boolean | undefined;
	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions,
	 * set this to `false` and operations will be executed sequentially.
	 * @default false
	 */
	transaction?: boolean | undefined;
}

export const mongodbAdapter = (
	db: Db,
	config?: MongoDBAdapterConfig | undefined,
) => {
	let lazyOptions: BetterAuthOptions | null;

	const createCustomAdapter =
		(
			db: Db,
			session?: ClientSession | undefined,
		): AdapterFactoryCustomizeAdapterCreator =>
		({ options, getFieldName, schema, getDefaultModelName }) => {
			function serializeID({
				field,
				value,
				model,
			}: {
				field: string;
				value: any;
				model: string;
			}) {
				model = getDefaultModelName(model);
				if (
					field === "id" ||
					field === "_id" ||
					schema[model]!.fields[field]?.references?.field === "id"
				) {
					if (value === null || value === undefined) {
						return value;
					}
					if (typeof value !== "string") {
						if (value instanceof ObjectId) {
							return value;
						}
						if (Array.isArray(value)) {
							return value.map((v) => {
								if (v === null || v === undefined) {
									return v;
								}
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
						case "not_in":
							condition = {
								[field]: {
									$nin: Array.isArray(value)
										? value.map((v) => serializeID({ field, value: v, model }))
										: [serializeID({ field, value, model })],
								},
							};
							break;
						case "gt":
							condition = {
								[field]: {
									$gt: serializeID({
										field,
										value,
										model,
									}),
								},
							};
							break;
						case "gte":
							condition = {
								[field]: {
									$gte: serializeID({
										field,
										value,
										model,
									}),
								},
							};
							break;
						case "lt":
							condition = {
								[field]: {
									$lt: serializeID({
										field,
										value,
										model,
									}),
								},
							};
							break;
						case "lte":
							condition = {
								[field]: {
									$lte: serializeID({
										field,
										value,
										model,
									}),
								},
							};
							break;
						case "ne":
							condition = {
								[field]: {
									$ne: serializeID({
										field,
										value,
										model,
									}),
								},
							};
							break;
						case "contains":
							condition = {
								[field]: {
									$regex: `.*${escapeForMongoRegex(value as string)}.*`,
								},
							};
							break;
						case "starts_with":
							condition = {
								[field]: { $regex: `^${escapeForMongoRegex(value as string)}` },
							};
							break;
						case "ends_with":
							condition = {
								[field]: { $regex: `${escapeForMongoRegex(value as string)}$` },
							};
							break;
						default:
							throw new Error(`Unsupported operator: ${operator}`);
					}
					return { condition, connector };
				});
				if (conditions.length === 1) {
					return conditions[0]!.condition;
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
				async create({ model, data: values }) {
					const res = await db.collection(model).insertOne(values, { session });
					const insertedData = { _id: res.insertedId.toString(), ...values };
					return insertedData as any;
				},
				async findOne({ model, where, select }) {
					const clause = convertWhereClause({ where, model });
					const projection = select
						? Object.fromEntries(
								select.map((field) => [getFieldName({ field, model }), 1]),
							)
						: undefined;
					const res = await db
						.collection(model)
						.findOne(clause, { session, projection });
					if (!res) return null;
					return res as any;
				},
				async findMany({ model, where, limit, offset, sortBy }) {
					const clause = where ? convertWhereClause({ where, model }) : {};
					const cursor = db.collection(model).find(clause, { session });
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
				async count({ model, where }) {
					const clause = where ? convertWhereClause({ where, model }) : {};
					const res = await db
						.collection(model)
						.countDocuments(clause, { session });
					return res;
				},
				async update({ model, where, update: values }) {
					const clause = convertWhereClause({ where, model });

					const res = await db.collection(model).findOneAndUpdate(
						clause,
						{ $set: values as any },
						{
							session,
							returnDocument: "after",
						},
					);
					if (!res) return null;
					return res as any;
				},
				async updateMany({ model, where, update: values }) {
					const clause = convertWhereClause({ where, model });

					const res = await db.collection(model).updateMany(
						clause,
						{
							$set: values as any,
						},
						{ session },
					);
					return res.modifiedCount;
				},
				async delete({ model, where }) {
					const clause = convertWhereClause({ where, model });
					await db.collection(model).deleteOne(clause, { session });
				},
				async deleteMany({ model, where }) {
					const clause = convertWhereClause({ where, model });
					const res = await db
						.collection(model)
						.deleteMany(clause, { session });
					return res.deletedCount;
				},
			};
		};

	let lazyAdapter:
		| ((options: BetterAuthOptions) => DBAdapter<BetterAuthOptions>)
		| null = null;
	let adapterOptions: AdapterFactoryOptions | null = null;
	adapterOptions = {
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
			transaction:
				config?.client && (config?.transaction ?? true)
					? async (cb) => {
							if (!config.client) {
								return cb(lazyAdapter!(lazyOptions!));
							}

							const session = config.client.startSession();

							try {
								session.startTransaction();

								const adapter = createAdapterFactory({
									config: adapterOptions!.config,
									adapter: createCustomAdapter(db, session),
								})(lazyOptions!);

								const result = await cb(adapter);

								await session.commitTransaction();
								return result;
							} catch (err) {
								await session.abortTransaction();
								throw err;
							} finally {
								await session.endSession();
							}
						}
					: false,
			customTransformInput({
				action,
				data,
				field,
				fieldAttributes,
				schema,
				model,
				options,
			}) {
				if (field === "_id" || fieldAttributes.references?.field === "id") {
					if (action === "update") {
						if (typeof data === "string") {
							try {
								return new ObjectId(data);
							} catch (error) {
								return data;
							}
						}
						return data;
					}
					if (Array.isArray(data)) {
						return data.map((v) => {
							if (typeof v === "string") {
								try {
									return new ObjectId(v);
								} catch (error) {
									return v;
								}
							}
							return v;
						});
					}
					if (typeof data === "string") {
						try {
							return new ObjectId(data);
						} catch (error) {
							return new ObjectId();
						}
					}
					if (data === null && fieldAttributes.references?.field === "id") {
						return null;
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
			customIdGenerator(props) {
				return new ObjectId().toString();
			},
		},
		adapter: createCustomAdapter(db),
	};
	lazyAdapter = createAdapterFactory(adapterOptions);

	return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
		lazyOptions = options;
		return lazyAdapter(options);
	};
};

/**
 * Safely escape user input for use in a MongoDB regex.
 * This ensures the resulting pattern is treated as literal text,
 * and not as a regex with special syntax.
 *
 * @param input - The input string to escape. Any type that isn't a string will be converted to an empty string.
 * @param maxLength - The maximum length of the input string to escape. Defaults to 256. This is to prevent DOS attacks.
 * @returns The escaped string.
 */
function escapeForMongoRegex(input: string, maxLength = 256): string {
	if (typeof input !== "string") return "";

	// Escape all PCRE special characters
	// Source: PCRE docs — https://www.pcre.org/original/doc/html/pcrepattern.html
	return input.slice(0, maxLength).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
