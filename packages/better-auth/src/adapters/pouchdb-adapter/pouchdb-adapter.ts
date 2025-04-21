import { getAuthTables } from "../../db";
import type { Adapter, BetterAuthOptions, Where } from "../../types";
import { withApplyDefault } from "../utils";
import type PouchDB from "pouchdb";
const createTransform = (options: BetterAuthOptions) => {
	const schema = getAuthTables(options);
	/**
	 * if custom id gen is provided we don't want to override with object id
	 */
	const customIdGen =
		options.advanced?.database?.generateId || options.advanced?.generateId;

	function serializeID(field: string, value: any, model: string) {
		if (customIdGen) {
			return value;
		}
		if (
			field === "id" ||
			field === "_id" ||
			schema[model].fields[field].references?.field === "id"
		) {
			if (typeof value !== "string") {
				if (Array.isArray(value)) {
					return value.map((v) => {
						if (typeof v === "string") {
							return v;
						}
					});
				}
				throw new Error("Invalid id value");
			}
			return value;
		}
		return value;
	}

	function deserializeID(field: string, value: any, model: string) {
		if (customIdGen) {
			return value;
		}
		if (
			field === "id" ||
			schema[model].fields[field].references?.field === "id"
		) {
			if (Array.isArray(value)) {
				return value.map((v) => {
					if (typeof v === "string") {
						return v;
					}
					return v;
				});
			}
			return value;
		}
		return value;
	}

	function getField(field: string, model: string) {
		if (field === "id") {
			if (customIdGen) {
				return "id";
			}
			return "_id";
		}
		const f = schema[model].fields[field];
		return f.fieldName || field;
	}

	return {
		transformInput(
			data: Record<string, any>,
			model: string,
			action: "create" | "update",
		) {
			const transformedData: Record<string, any> =
				action === "update"
					? {}
					: customIdGen
						? {
								id: customIdGen({ model }),
							}
						: {
								_id: `${model}:${Date.now()}${Math.floor(Math.random() * 1000000)}`,
							};
			const fields = schema[model].fields;
			for (const field in fields) {
				const value = data[field];
				if (
					value === undefined &&
					(!fields[field].defaultValue || action === "update")
				) {
					continue;
				}
				transformedData[fields[field].fieldName || field] = withApplyDefault(
					serializeID(field, value, model),
					fields[field],
					action,
				);
			}
			return transformedData;
		},
		transformOutput(
			data: Record<string, any>,
			model: string,
			select: string[] = [],
		) {
			const transformedData: Record<string, any> =
				data.id || data._id
					? select.length === 0 || select.includes("id")
						? {
								id: data.id ? data.id.toString() : data._id.toString(),
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
					transformedData[key] = deserializeID(
						key,
						data[field.fieldName || key],
						model,
					);
				}
			}
			return transformedData as any;
		},
		convertWhereClause(where: Where[], model: string) {
			if (!where.length) return {};
			const conditions = where.map((w) => {
				const { field: _field, value, operator = "eq", connector = "AND" } = w;
				let condition: any;
				const field = getField(_field, model);

				switch (operator.toLowerCase()) {
					case "eq":
						condition = {
							[field]: serializeID(_field, value, model),
						};
						break;
					case "in":
						condition = {
							[field]: {
								$in: Array.isArray(value)
									? serializeID(_field, value, model)
									: [serializeID(_field, value, model)],
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
		},
		getModelName: (model: string) => {
			return schema[model].modelName;
		},
		getField,
	};
};

export const pouchdbAdapter = (db: PouchDB.Database) => (options: BetterAuthOptions) => {
	const transform = createTransform(options);
	const hasCustomId = options.advanced?.generateId;
	const createQuery = async ({model, where, limit, offset, sortBy}: {model: string, where?: Where[], limit?: number, offset?: number, sortBy?: {field: string, direction: "asc" | "desc"}}) =>{
		const clause = where ? transform.convertWhereClause(where, model) : {};

		let selector = {_id: {$gt: `${model}:`}, ...clause}
		let sort:(string | {
			[propName: string]: "asc" | "desc";
		})[] | undefined = undefined
		if (sortBy) {
			await db.createIndex({
				"index":{
					"fields": [transform.getField(sortBy.field, model)]
				}
			})
			selector[transform.getField(sortBy.field, model)] = {$gt: ""}
			sort = [{ [transform.getField(sortBy.field, model)]: sortBy.direction === "desc" ? "desc" : "asc" }]
		}
		return {
			selector,
			sort,
			limit: limit || Infinity,
			skip: offset || 0,
		}
	}
	return {
		id: "pouchdb-adapter",
		async create(data) {
			const { model, data: values, select } = data;
			const transformedData = transform.transformInput(values, model, "create");
			if (transformedData.id && !hasCustomId) {
				// biome-ignore lint/performance/noDelete: setting id to undefined will cause the id to be null in the database which is not what we want
				delete transformedData.id;
			}
			const res = await db.put(transformedData);
			const id = res.id;
			const insertedData = { id: id.toString(), ...transformedData };
			const t = transform.transformOutput(insertedData, model, select);
			return t;
		},
		async findOne(data) {
			const { model, where, select } = data;
			const clause = transform.convertWhereClause(where, model);
			const res = await db.find({
				selector: clause,
			});
			if (!res.docs.length) return null;
			const transformedData = transform.transformOutput(res.docs[0], model, select);
			return transformedData;
		},
		async findMany(data) {
			const { model, where, limit, offset, sortBy } = data;

			const result = await db.find(await createQuery({model, where, limit, offset, sortBy}));

			const res = result.docs.map((r) => transform.transformOutput(r, model));
			return res;
		},
		async count(data) {
			const { model } = data;
			const res = await db.allDocs({startkey: `${model}:`, endkey: `${model}:~`});
			return res.rows.length;
		},
		async update(data) {
			const { model, where, update: values } = data;
			const clause = transform.convertWhereClause(where, model);

			const transformedData = transform.transformInput(values, model, "update");

			const res = await db.find({
				selector: clause,
			});
			if (!res.docs.length) return null;
			const doc = res.docs[0];
			const updatedDoc = { ...doc, ...transformedData };
			await db.put(updatedDoc);
			return transform.transformOutput(updatedDoc, model);
		},
		async updateMany(data) {
			const { model, where, update: values } = data;
			const clause = transform.convertWhereClause(where, model);
			const transformedData = transform.transformInput(values, model, "update");
			const res = await db
				.find({
					selector: clause,
				})
				.then((result) => {
					const docs = result.docs;
					const updatedDocs = docs.map((doc) => ({
						...doc,
						...transformedData,
						
					}));
					return db.bulkDocs(updatedDocs);
				});
			return res.length;
		},
		async delete(data) {
			const { model, where } = data;
			const clause = transform.convertWhereClause(where, model);
			const res = await db.find({
				selector: clause,
			});
			if (!res.docs.length) return null;
			const doc = res.docs[0];
			await db.remove(doc._id, doc._rev);
			return transform.transformOutput(doc, model);
		},
		async deleteMany(data) {
			const { model, where } = data;
			const res = await db
				.find(await createQuery({model, where}))
				.then((result) => {
					const docs = result.docs;
					return db.bulkDocs(docs.map((doc) => ({ ...doc, _deleted: true })))
				});
			return res.length;
		},
	} satisfies Adapter;
};
