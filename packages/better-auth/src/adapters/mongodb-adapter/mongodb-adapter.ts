import { ObjectId, type Db } from "mongodb";
import type { BetterAuthOptions, Where, Join } from "../../types";
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

			function buildAggregationPipeline({
				model,
				where,
				joins,
				limit,
				offset,
				sortBy,
			}: {
				model: string;
				where?: Where[];
				joins?: Join[];
				limit?: number;
				offset?: number;
				sortBy?: { field: string; direction: "asc" | "desc" };
			}) {
				const pipeline: any[] = [];

				// Add $lookup stages for joins
				if (joins && joins.length > 0) {
					for (const join of joins) {
						const joinName = join.alias || join.table;

						// Parse join conditions
						const leftParts = join.on.left.split(".");
						const rightParts = join.on.right.split(".");

						const localField =
							leftParts.length === 2 ? leftParts[1] : leftParts[0];
						const foreignField =
							rightParts.length === 2 ? rightParts[1] : rightParts[0];

						// Convert field names if needed
						const localFieldName =
							localField === "id"
								? "_id"
								: getFieldName({ model, field: localField });
						const foreignFieldName =
							foreignField === "id"
								? "_id"
								: getFieldName({ model: join.table, field: foreignField });

						const lookupStage: any = {
							$lookup: {
								from: join.table,
								localField: localFieldName,
								foreignField: foreignFieldName,
								as: joinName,
							},
						};

						pipeline.push(lookupStage);

						// Handle different join types
						if (join.type === "inner") {
							// Inner join: exclude docs where the array is empty
							pipeline.push({
								$match: {
									[`${joinName}.0`]: { $exists: true },
								},
							});
						}

						// Unwind the array for single document joins (like SQL joins)
						// For left joins, preserve null
						if (join.type === "left" || join.type === "full") {
							pipeline.push({
								$unwind: {
									path: `$${joinName}`,
									preserveNullAndEmptyArrays: true,
								},
							});
						} else {
							pipeline.push({
								$unwind: `$${joinName}`,
							});
						}

						// Project specific fields if specified
						if (join.select && join.select.length > 0) {
							const projectFields: any = {};
							// Keep all original fields
							for (const field of Object.keys(schema[model].fields || {})) {
								projectFields[field] = 1;
							}
							projectFields._id = 1;

							// Add selected join fields with prefixed names
							for (const field of join.select) {
								const joinField = field === "id" ? "_id" : field;
								projectFields[`${joinName}_${field}`] =
									`$${joinName}.${joinField}`;
							}

							// Remove the original joined document
							projectFields[joinName] = 0;

							pipeline.push({ $project: projectFields });
						} else {
							// Flatten all fields from joined document with prefixes
							const projectFields: any = {};
							// Keep all original fields
							for (const field of Object.keys(schema[model].fields || {})) {
								projectFields[field] = 1;
							}
							projectFields._id = 1;

							// Add all join fields with prefixed names
							const joinSchema = schema[join.table];
							if (joinSchema) {
								for (const field of Object.keys(joinSchema.fields || {})) {
									const joinField = field === "id" ? "_id" : field;
									projectFields[`${joinName}_${field}`] =
										`$${joinName}.${joinField}`;
								}
								// Special handling for _id -> id mapping
								projectFields[`${joinName}_id`] = `$${joinName}._id`;
							}

							// Remove the original joined document
							projectFields[joinName] = 0;

							pipeline.push({ $project: projectFields });
						}
					}
				}

				// Add $match stage for where conditions
				if (where && where.length > 0) {
					const clause = convertWhereClause({ where, model, joins });
					if (Object.keys(clause).length > 0) {
						pipeline.push({ $match: clause });
					}
				}

				// Add $sort stage
				if (sortBy) {
					const sortField = getFieldName({ field: sortBy.field, model });
					pipeline.push({
						$sort: {
							[sortField === "id" ? "_id" : sortField]:
								sortBy.direction === "desc" ? -1 : 1,
						},
					});
				}

				// Add $skip stage
				if (offset) {
					pipeline.push({ $skip: offset });
				}

				// Add $limit stage
				if (limit) {
					pipeline.push({ $limit: limit });
				}

				return pipeline;
			}

			function convertWhereClause({
				where,
				model,
				joins,
			}: {
				where: Where[];
				model: string;
				joins?: Join[];
			}) {
				if (!where.length) return {};

				// Helper to resolve field references in joins
				const resolveFieldName = (fieldRef: string) => {
					if (fieldRef.includes(".")) {
						const [tableName, fieldName] = fieldRef.split(".");
						if (tableName === model) {
							// Main table field
							const resolvedField = getFieldName({ model, field: fieldName });
							return resolvedField === "id" ? "_id" : resolvedField;
						} else {
							// Joined table field - use prefixed name after aggregation
							const joinName =
								joins?.find((j) => (j.alias || j.table) === tableName)?.alias ||
								tableName;
							return `${joinName}_${fieldName === "id" ? "id" : fieldName}`;
						}
					} else {
						// Simple field name, assume main table
						const resolvedField = getFieldName({ model, field: fieldRef });
						return resolvedField === "id" ? "_id" : resolvedField;
					}
				};

				const conditions = where.map((w) => {
					const {
						field: field_,
						value,
						operator = "eq",
						connector = "AND",
					} = w;
					let condition: any;
					let field = resolveFieldName(field_);

					switch (operator.toLowerCase()) {
						case "eq":
							condition = {
								[field]:
									field.endsWith("_id") || field === "_id"
										? serializeID({
												field: field.replace(/.*_/, ""), // Remove prefix for ID serialization
												value,
												model: field.includes("_")
													? field.split("_")[0]
													: model,
											})
										: value,
							};
							break;
						case "in":
							condition = {
								[field]: {
									$in: Array.isArray(value)
										? field.endsWith("_id") || field === "_id"
											? value.map((v) =>
													serializeID({
														field: field.replace(/.*_/, ""),
														value: v,
														model: field.includes("_")
															? field.split("_")[0]
															: model,
													}),
												)
											: value
										: field.endsWith("_id") || field === "_id"
											? [
													serializeID({
														field: field.replace(/.*_/, ""),
														value,
														model: field.includes("_")
															? field.split("_")[0]
															: model,
													}),
												]
											: [value],
								},
							};
							break;
						case "not_in":
							condition = {
								[field]: {
									$nin: Array.isArray(value)
										? field.endsWith("_id") || field === "_id"
											? value.map((v) =>
													serializeID({
														field: field.replace(/.*_/, ""),
														value: v,
														model: field.includes("_")
															? field.split("_")[0]
															: model,
													}),
												)
											: value
										: field.endsWith("_id") || field === "_id"
											? [
													serializeID({
														field: field.replace(/.*_/, ""),
														value,
														model: field.includes("_")
															? field.split("_")[0]
															: model,
													}),
												]
											: [value],
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
				async findOne({ model, where, select, joins }) {
					if (joins && joins.length > 0) {
						// Use aggregation pipeline for joins
						const pipeline = buildAggregationPipeline({
							model,
							where,
							joins,
							limit: 1,
						});

						const results = await db
							.collection(model)
							.aggregate(pipeline)
							.toArray();
						return results.length > 0 ? results[0] : null;
					} else {
						// Simple find for no joins
						const clause = convertWhereClause({ where, model });
						const res = await db.collection(model).findOne(clause);
						if (!res) return null;
						return res as any;
					}
				},
				async findMany({ model, where, limit, offset, sortBy, joins }) {
					if (joins && joins.length > 0) {
						// Use aggregation pipeline for joins
						const pipeline = buildAggregationPipeline({
							model,
							where,
							joins,
							limit,
							offset,
							sortBy,
						});

						const results = await db
							.collection(model)
							.aggregate(pipeline)
							.toArray();
						return results as any;
					} else {
						// Simple find for no joins
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
					}
				},
				async count({ model, where, joins }) {
					if (joins && joins.length > 0) {
						// Use aggregation pipeline for joins
						const pipeline = buildAggregationPipeline({
							model,
							where,
							joins,
						});

						// Add $count stage to get the count
						pipeline.push({ $count: "total" });

						const results = await db
							.collection(model)
							.aggregate(pipeline)
							.toArray();
						return results.length > 0 ? results[0].total : 0;
					} else {
						// Simple count for no joins
						if (!where || where.length === 0) {
							const res = await db.collection(model).countDocuments();
							return res;
						} else {
							const clause = convertWhereClause({ where, model });
							const res = await db.collection(model).countDocuments(clause);
							return res;
						}
					}
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
