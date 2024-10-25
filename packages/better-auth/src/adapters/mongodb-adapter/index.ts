import type { Db } from "mongodb";
import type { Adapter, Where } from "../../types";

function whereConvertor(where?: Where[]) {
	if (!where) return {};

	const conditions = where.map((w) => {
		const { field, value, operator = "eq", connector = "AND" } = w;
		let condition: any;
		function getField(field: string) {
			if (field === "id") {
				return "_id";
			}
			return field;
		}
		switch (operator.toLowerCase()) {
			case "eq":
				condition = { [getField(field)]: value };
				break;
			case "in":
				condition = {
					[getField(field)]: { $in: Array.isArray(value) ? value : [value] },
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

			// Add more operators as needed
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
	return rest;
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
			const { model, data: val } = data;
			val.id = undefined;
			const res = await db.collection(getModelName(model)).insertOne({
				...val,
			});
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

			return removeMongoId(result);
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
				update.id = undefined;
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

			const res = await db
				.collection(getModelName(model))
				.findOneAndDelete(wheres);
		},
		async deleteMany(data) {
			const { model, where } = data;
			const wheres = whereConvertor(where);

			const res = await db.collection(getModelName(model)).deleteMany(wheres);
		},
	} satisfies Adapter;
};
