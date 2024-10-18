import type { Db } from "mongodb";
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

export const mongodbAdapter = (
	mongo: Db,
	opts?: {
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
	},
) => {
	const db = mongo;
	const getModelName = (name: string) => (opts?.usePlural ? `${name}s` : name);
	return {
		id: "mongodb",
		async create(data) {
			const { model, data: val } = data;

			if (opts?.generateId !== undefined) {
				val.id = opts.generateId ? opts.generateId() : undefined;
			}

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

			const res = await db
				.collection(getModelName(model))
				.find({ ...wheres }, { projection: selects })
				.toArray();

			const result = res[0];

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
				.find()
				// @ts-expect-error
				.filter(wheres)
				.skip(offset || 0)
				.limit(limit || 100)
				.sort(sortBy?.field || "id", sortBy?.direction === "desc" ? -1 : 1)
				.toArray();
			return toReturn.map(removeMongoId);
		},
		async update(data) {
			const { model, where, update } = data;
			const wheres = whereConvertor(where);

			if (where.length === 1) {
				const res = await db.collection(getModelName(model)).findOneAndUpdate(
					//@ts-expect-error
					wheres,
					{
						$set: update,
					},
					{ returnDocument: "after" },
				);
				return removeMongoId(res);
			}
			const res = await db.collection(getModelName(model)).updateMany(
				//@ts-expect-error
				wheres,
				{
					$set: update,
				},
			);
			return {};
		},
		async delete(data) {
			const { model, where } = data;
			const wheres = whereConvertor(where);

			const res = await db
				.collection(getModelName(model))
				//@ts-expect-error
				.findOneAndDelete(wheres);
		},
	} satisfies Adapter;
};
