import type { Adapter, Where } from "../../types";

function whereConvertor(where?: Where[]) {
	if (!where) return {};
	if (where.length === 1) {
		const w = where[0];
		if (!w) {
			return;
		}
		return {
			[w.field]: w.value,
		};
	}
	const and = where.filter((w) => w.connector === "AND" || !w.connector);
	const or = where.filter((w) => w.connector === "OR");

	const andClause = and.map((w) => {
		return {
			[w.field]:
				w.operator === "eq" || !w.operator
					? w.value
					: {
							[w.field]: w.value,
						},
		};
	});
	const orClause = or.map((w) => {
		return {
			[w.field]: w.value,
		};
	});

	let clause = {};
	if (andClause.length) {
		clause = { ...clause, $and: andClause };
	}
	if (orClause.length) {
		clause = { ...clause, $or: orClause };
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

interface MongoClient {
	collection: (model: string) => {
		insertOne: (data: any) => Promise<any>;
		find: (
			where: any,
			select: any,
		) => {
			toArray: () => any;
		};
		findMany: (where: any) => Promise<any>;
		findOneAndUpdate: (where: any, update: any, config: any) => Promise<any>;
		findOneAndDelete: (where: any) => Promise<any>;
	};
}

export const mongodbAdapter = (mongo: any) => {
	const db: MongoClient = mongo;
	return {
		id: "mongodb",
		async create(data) {
			const { model, data: val } = data;
			const res = await db.collection(model).insertOne({
				...val,
			});
			const id_ = res.insertedId;
			const returned = { id: id_, ...val };
			return removeMongoId(returned);
		},
		async findOne(data) {
			const { model, where, select } = data;
			const wheres = whereConvertor(where);
			let selects = {};
			if (select) {
				selects = selectConvertor(select);
			}

			const res = await db
				.collection(model)
				.find({ ...wheres }, { projection: selects })
				.toArray();

			const result = res[0];
			if (!result) {
				return null;
			}

			return removeMongoId(result);
		},
		async findMany(data) {
			const { model, where } = data;
			const wheres = whereConvertor(where);
			const toReturn = await db.collection(model).findMany(wheres);
			return removeMongoId(toReturn);
		},
		async update(data) {
			const { model, where, update } = data;
			const wheres = whereConvertor(where);

			const res = await db.collection(model).findOneAndUpdate(
				wheres,
				{
					$set: update,
				},
				{ returnDocument: "after" },
			);

			return removeMongoId(res);
		},
		async delete(data) {
			const { model, where } = data;
			const wheres = whereConvertor(where);
			const res = await db.collection(model).findOneAndDelete(wheres);

			return res;
		},
	} satisfies Adapter;
};
