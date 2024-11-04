import { ObjectId, type Db } from "mongodb";
import type { Adapter, Where } from "../../types";

function whereConvertor(where?: Where[]) {
	if (!where) return {};
	function getField(field: string) {
		if (field === "id") {
			return "_id";
		}
		return field;
	}

	function getValue(field: string, value: any) {
		if (field === "id") {
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

	const conditions = where.map((w) => {
		const { field, value, operator = "eq", connector = "AND" } = w;
		let condition: any;

		switch (operator.toLowerCase()) {
			case "eq":
				condition = {
					[getField(field)]: getValue(field, value),
				};
				break;
			case "in":
				condition = {
					[getField(field)]: {
						$in: Array.isArray(value)
							? getValue(field, value)
							: [getValue(field, value)],
					},
				};
				break;
			case "gt":
				condition = { [getField(field)]: { $gt: value } };
				break;
			case "gte":
				condition = { [getField(field)]: { $gte: value } };
				break;
			case "lt":
				condition = { [getField(field)]: { $lt: value } };
				break;
			case "lte":
				condition = { [getField(field)]: { $lte: value } };
				break;
			case "ne":
				condition = { [getField(field)]: { $ne: value } };
				break;

			case "contains":
				condition = { [getField(field)]: { $regex: `.*${value}.*` } };
				break;
			case "starts_with":
				condition = { [getField(field)]: { $regex: `${value}.*` } };
				break;
			case "ends_with":
				condition = { [getField(field)]: { $regex: `.*${value}` } };
				break;
			default:
				throw new Error(`Unsupported operator: ${operator}`);
		}

		return { condition, connector };
	});

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

function removeMongoId(data: any) {
	const { _id, ...rest } = data;
	return {
		...rest,
		id: _id,
	};
}

function selectConvertor(selects: string[]) {
	const selectConstruct = selects.reduce((acc, field) => {
		//@ts-expect-error
		acc[field] = 1;
		return acc;
	}, {});

	return selectConstruct;
}

export const mongodbAdapter = (
	mongo: Db,
	opts?: {
		usePlural?: boolean;
	},
) => {
	const db = mongo;
	const getModelName = (name: string) => (opts?.usePlural ? `${name}s` : name);
	return {
		id: "mongodb",
		async create(data) {
			let { model, data: val } = data;
			if (val.id) {
				val.id = undefined;
			}
			const res = await db.collection(getModelName(model)).insertOne(val);
			const id_ = res.insertedId;
			const returned = { ...val, id: id_ };
			return removeMongoId(returned);
		},
		async findOne(data) {
			const { model, where, select } = data;

			const wheres = whereConvertor(where);
			let selects = {};
			if (select) {
				selects = selectConvertor(select);
			}

			const result = await db
				.collection(getModelName(model))
				.findOne(wheres, { projection: selects });

			if (!result) {
				return null;
			}
			const toReturn = removeMongoId(result);
			if (select?.length && !select.includes("id")) {
				toReturn.id = undefined;
			}
			return toReturn;
		},
		async findMany(data) {
			const { model, where, limit, offset, sortBy } = data;
			const wheres = whereConvertor(where);
			const toReturn = await db
				.collection(getModelName(model))
				.find(wheres)
				.skip(offset || 0)
				.limit(limit || 100)
				.sort(sortBy?.field || "_id", sortBy?.direction === "desc" ? -1 : 1)
				.toArray();
			return toReturn.map(removeMongoId);
		},
		async update(data) {
			const { model, where, update } = data;
			const wheres = whereConvertor(where);

			if (update.id) {
				// biome-ignore lint/performance/noDelete: valid use case
				delete update.id;
			}

			if (where.length === 1) {
				const res = await db.collection(getModelName(model)).findOneAndUpdate(
					wheres,
					{
						$set: update,
					},
					{ returnDocument: "after" },
				);
				return removeMongoId(res);
			}
			await db.collection(getModelName(model)).updateMany(wheres, {
				$set: update,
			});
			return {};
		},
		async delete(data) {
			const { model, where } = data;
			const wheres = whereConvertor(where);

			await db.collection(getModelName(model)).findOneAndDelete(wheres);
		},
		async deleteMany(data) {
			const { model, where } = data;
			const wheres = whereConvertor(where);

			await db.collection(getModelName(model)).deleteMany(wheres);
		},
	} satisfies Adapter;
};
