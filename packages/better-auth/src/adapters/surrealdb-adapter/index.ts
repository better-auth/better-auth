import { jsonify, surql, type Surreal } from "surrealdb";
import type { Adapter, Where } from "../../types";

/**
 * Compose a SurrealDB where clause from a list of where objects.
 *
 * @param {Where[]} where - List of where objects.
 * @param {string} model - Model name.
 * @returns {string} Composed where clause as a string.
 */
function composeWhereClause(where: Where[], model: string): string {
	if (!where.length) return "";

	return where
		.map(({ field, value, operator = "eq", connector = "AND" }, index) => {
			const val =
				typeof value === "string" ? `'${value.replace(/'/g, "\\'")}'` : value;
			const mod = `'${model.replace(/'/g, "\\'")}'`;

			const condition = {
				eq: () =>
					field === "id"
						? `${field} = type::thing(${mod}, ${val})`
						: `${field} = ${val}`,
				in: () =>
					field === "id"
						? `${field} IN [${
								Array.isArray(val)
									? val.map((v) => `type::thing('${model}', '${v}')`).join(", ")
									: `type::thing('${model}', '${val}')`
							}]`
						: `${field} IN [${
								Array.isArray(value)
									? value.map((v) => `'${v}'`).join(", ")
									: val
							}]`,
				gt: () => `${field} > ${val}`,
				gte: () => `${field} >= ${val}`,
				lt: () => `${field} < ${val}`,
				lte: () => `${field} <= ${val}`,
				ne: () => `${field} != ${val}`,
				contains: () => `${field} CONTAINS ${val}`,
				starts_with: () => `string::starts_with(${field}, ${val})`,
				ends_with: () => `string::ends_with(${field}, ${val})`,
			}[operator.toLowerCase() as typeof operator]();

			return index > 0 ? `${connector} ${condition}` : condition;
		})
		.join(" ");
}


	/**
	 * Converting function from RecordId to string.
	 *
	 * Conversion from Surreal native RecordId to string.
	 * This is needed to works properly with custom generated ids.
	 * @param data - data to convert
	 * @returns converted data with id as string
	 */
function convertIdToString(data: any) {
	const { id, ...rest } = data;
	if (!id) return data;

	const RecordIdValueString = jsonify(id.id) as string;
	return { ...rest, id: RecordIdValueString };
}

export const surrealdbAdapter = (
	surrealdb: Surreal,
	opts?: {
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
	const db = surrealdb;

	return {
		id: "surrealdb",
		async create(data) {
			const { model, data: val } = data;

			if (opts?.generateId !== undefined) {
				val.id = opts.generateId ? opts.generateId() : undefined;
			}

			const result = await db.insert(model, {
				...val,
			});
			return convertIdToString(result[0]);
		},
		async findOne(data) {
			const { model, where, select = [] } = data;

			const wheres = composeWhereClause(where, model);

			const query =
				select.length > 0
					? `SELECT type::fields([${select
							.map((s) => `'${s}'`)
							.join(", ")}]) FROM type::table('${model}') WHERE ${wheres};`
					: `SELECT * FROM type::table('${model}') WHERE ${wheres};`;

			const response = await db.query<[any[]]>(query);
			const result = response[0][0];

			if (!result) {
				return null;
			}

			return convertIdToString(result);
		},
		async findMany(data) {
			const { model, where, limit, offset, sortBy } = data;
			const clauses = [];

			if (where) {
				const wheres = composeWhereClause(where, model);
				clauses.push(`WHERE ${wheres}`);
			}
			if (sortBy !== undefined) {
				clauses.push(`ORDER BY ${sortBy.field} ${sortBy.direction}`);
			}
			if (limit !== undefined) {
				clauses.push(`LIMIT type::number('${limit}')`);
			}
			if (offset !== undefined) {
				clauses.push(`START type::number('${offset}')`);
			}

			const query = `SELECT * FROM type::table('${model}') ${
				clauses.length > 0 ? clauses.join(" ") : ""
			}`;

			const response = await db.query<[any[]]>(query);
			const result = response[0];

			return convertIdToString(result);
		},
		async update(data) {
			const { model, where, update } = data;
			const wheres = composeWhereClause(where, model);
			if (!wheres)
				throw new Error("Empty conditions - possible unintended operation");

			if (update.id) {
				update.id = undefined;
			}

			const query = surql`UPDATE type::table(${model}) MERGE { ${update} } WHERE ${wheres}`;
			const response = await db.query<[any[]]>(query);
			const result = response[0][0];

			return convertIdToString(result);
		},
		async delete(data) {
			const { model, where } = data;
			const wheres = composeWhereClause(where, model);
			if (!wheres)
				throw new Error("Empty conditions - possible unintended operation");

			const query = `DELETE type::table('${model}') WHERE ${wheres}`;

			await db.query(query);
		},
		async deleteMany(data) {
			const { model, where } = data;
			const wheres = composeWhereClause(where, model);
			if (!wheres)
				throw new Error("Empty conditions - possible unintended operation");

			const query = `DELETE type::table('${model}') WHERE ${wheres}`;

			await db.query(query);
		},
	} satisfies Adapter;
};
