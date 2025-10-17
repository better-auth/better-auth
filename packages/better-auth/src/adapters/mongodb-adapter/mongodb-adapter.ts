import { ClientSession, ObjectId, type Db, type MongoClient } from "mongodb";
import type { BetterAuthOptions } from "@better-auth/core";
import {
	createAdapterFactory,
	type AdapterFactoryOptions,
	type AdapterFactoryCustomizeAdapterCreator,
} from "../adapter-factory";
import type {
	DBAdapterDebugLogOption,
	DBAdapter,
	Where,
} from "@better-auth/core/db/adapter";
import { createLogger, type Logger } from "@better-auth/core/env";

export interface MongoDBAdapterConfig {
	/**
	 * MongoDB client instance
	 * If not provided, Database transactions won't be enabled.
	 */
	client?: MongoClient;
	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption;
	/**
	 * Use plural table names
	 *
	 * @default false
	 */
	usePlural?: boolean;
	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions,
	 * set this to `false` and operations will be executed sequentially.
	 * @default false
	 */
	transaction?: boolean;
	/**
	 * By default we convert all IDs to ObjectId instances.
	 * If you don't want this behavior, set this to `true` and IDs will be saved as strings.
	 * @default false
	 */
	disableObjectIdConversion?: boolean;
}

export const mongodbAdapter = (db: Db, config?: MongoDBAdapterConfig) => {
	let lazyOptions: BetterAuthOptions | null;

	const createConvertId =
		(loggerOptions?: Logger) =>
		(
			id: string | ObjectId | ObjectId[] | string[] | null,
			createIdOnFailure: boolean = false,
		): ObjectId | string | ObjectId[] | string[] | null => {
			const logger = createLogger(loggerOptions);

			if (!id) return null;

			const { disableObjectIdConversion } = config || {};
			if (disableObjectIdConversion) {
				if (id instanceof ObjectId) return id.toHexString();
				if (Array.isArray(id))
					return id.map((x) => {
						if (x instanceof ObjectId) return x.toHexString();
						return x;
					});
				if (typeof id === "string") return id;
				return id;
			}

			const convert = (
				id: string | ObjectId | ObjectId[] | string[] | null,
			): ObjectId | string | ObjectId[] | string[] | null => {
				if (!id) return null;
				if (id instanceof ObjectId) {
					return id;
				}
				if (typeof id === "string") {
					try {
						return new ObjectId(id);
					} catch (e) {
						if (createIdOnFailure) {
							return new ObjectId();
						}
						logger.error(
							`[Mongo Adapter] Failed to wrap the id into an ObjectID instance. ID given:`,
							id,
							e,
						);
						throw new Error("[Adapter] Invalid ID value", {
							cause: e,
						});
					}
				}
				if (Array.isArray(id)) {
					return id.map((x: ObjectId | string) => convert(x)) as
						| ObjectId[]
						| string[];
				}
				if (createIdOnFailure) {
					return new ObjectId();
				}
				logger.error(`[Mongo Adapter] Invalid id type provided. ID given:`, id);
				throw new Error("[Adapter] Invalid ID value");
			};

			return convert(id);
		};

	const createCustomAdapter =
		(db: Db, session?: ClientSession): AdapterFactoryCustomizeAdapterCreator =>
		({ getFieldName, schema, getDefaultModelName }) => {
			const convertId = createConvertId({ disabled: true });

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
					const result = convertId(value);
					return result;
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
					let clause: any;
					try {
						clause = convertWhereClause({ where, model });
					} catch (error) {
						// an invalid `id` value was provided
						// given this you couldn't possibly find a record
						return null;
					}
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
					let clause: any;
					try {
						clause = where ? convertWhereClause({ where, model }) : {};
					} catch (error) {
						// an invalid `id` value was provided
						// given this you couldn't possibly find any records
						return [];
					}
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
					let clause: any;
					try {
						clause = where ? convertWhereClause({ where, model }) : {};
					} catch (error) {
						// an invalid `id` value was provided
						// given this you couldn't possibly count any records
						return 0;
					}
					const res = await db
						.collection(model)
						.countDocuments(clause, { session });
					return res;
				},
				async update({ model, where, update: values }) {
					let clause: any;
					try {
						clause = convertWhereClause({ where, model });
					} catch (error) {
						// an invalid `id` value was provided
						// given this you couldn't possibly update any records
						return null;
					}

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
					let clause: any;
					try {
						clause = convertWhereClause({ where, model });
					} catch (error) {
						// an invalid `id` value was provided
						// given this you couldn't possibly update any records
						return 0;
					}

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
					let clause: any;
					try {
						clause = convertWhereClause({ where, model });
					} catch (error) {
						// an invalid `id` value was provided
						// given this you couldn't possibly delete any records
						return;
					}
					await db.collection(model).deleteOne(clause, { session });
				},
				async deleteMany({ model, where }) {
					let clause: any;
					try {
						clause = convertWhereClause({ where, model });
					} catch (error) {
						// an invalid `id` value was provided
						// given this you couldn't possibly delete any records
						return 0;
					}
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
					const convertId = createConvertId(options.logger);
					const result = convertId(
						data,
						action !== "update",
					);
					return result;
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
