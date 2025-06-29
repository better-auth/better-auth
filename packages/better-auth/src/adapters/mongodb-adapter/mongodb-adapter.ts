import { ObjectId, type Db } from "mongodb";
import type { BetterAuthOptions, Where } from "../../types";
import { createAdapter, type AdapterDebugLogs } from "../create-adapter";

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
}

export const mongodbAdapter = (db: Db, config?: MongoDBAdapterConfig) => {
	const getCustomIdGenerator = (options: BetterAuthOptions) => {
		const generator =
			options.advanced?.database?.generateId || options.advanced?.generateId;
		if (typeof generator === "function") {
			return generator;
		}
		return undefined;
	};
	return createAdapter({
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
		adapter: ({ options, getFieldName, schema, getDefaultModelName }) => {
			const customIdGen = getCustomIdGenerator(options);

			function serializeID({
				field,
				value,
				model,
			}: { field: string; value: any; model: string }) {
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
			}: { where: Where[]; model: string }) {
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
				async create({ model, data: values }) {
					const res = await db.collection(model).insertOne(values);
					const insertedData = { _id: res.insertedId.toString(), ...values };
					return insertedData as any;
				},
				async findOne({ model, where, select }) {
					const clause = convertWhereClause({ where, model });
					const res = await db.collection(model).findOne(clause);
					if (!res) return null;
					return res as any;
				},
				async findMany({ model, where, limit, offset, sortBy }) {
					const clause = where ? convertWhereClause({ where, model }) : {};
					const cursor = db.collection(model).find(clause);
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
				async count({ model }) {
					const res = await db.collection(model).countDocuments();
					return res;
				},
				async update({ model, where, update: values }) {
					const clause = convertWhereClause({ where, model });

					const res = await db.collection(model).findOneAndUpdate(
						clause,
						{ $set: values as any },
						{
							returnDocument: "after",
						},
					);
					if (!res) return null;
					return res as any;
				},
				async updateMany({ model, where, update: values }) {
					const clause = convertWhereClause({ where, model });

					const res = await db.collection(model).updateMany(clause, {
						$set: values as any,
					});
					return res.modifiedCount;
				},
				async delete({ model, where }) {
					const clause = convertWhereClause({ where, model });
					await db.collection(model).deleteOne(clause);
				},
				async deleteMany({ model, where }) {
					const clause = convertWhereClause({ where, model });
					const res = await db.collection(model).deleteMany(clause);
					return res.deletedCount;
				},
			};
		},
	});
};
