import { getAuthTables } from "../../db";
import type { Adapter, BetterAuthOptions, Where } from "../../types";
import { generateId } from "../../utils";
import { withApplyDefault } from "../utils";

export interface MemoryDB {
	[key: string]: any[];
}

const createTransform = (options: BetterAuthOptions) => {
	const schema = getAuthTables(options);

	function getField(model: string, field: string) {
		if (field === "id") {
			return field;
		}
		const f = schema[model].fields[field];
		return f.fieldName || field;
	}
	return {
		transformInput(
			data: Record<string, any>,
			model: string,
			action: "update" | "create",
		) {
			const transformedData: Record<string, any> =
				action === "update"
					? {}
					: {
							id: options.advanced?.generateId
								? options.advanced.generateId({
										model,
									})
								: data.id || generateId(),
						};

			const fields = schema[model].fields;
			for (const field in fields) {
				const value = data[field];
				if (value === undefined && !fields[field].defaultValue) {
					continue;
				}
				transformedData[fields[field].fieldName || field] = withApplyDefault(
					value,
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
			if (!data) return null;
			const transformedData: Record<string, any> =
				data.id || data._id
					? select.length === 0 || select.includes("id")
						? {
								id: data.id,
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
					transformedData[key] = data[field.fieldName || key];
				}
			}
			return transformedData as any;
		},
		convertWhereClause(where: Where[], table: any[], model: string) {
			return table.filter((record) => {
				return where.every((clause) => {
					const { field: _field, value, operator } = clause;
					const field = getField(model, _field);
					if (operator === "in") {
						if (!Array.isArray(value)) {
							throw new Error("Value must be an array");
						}
						// @ts-ignore
						return value.includes(record[field]);
					} else if (operator === "contains") {
						return record[field].includes(value);
					} else if (operator === "starts_with") {
						return record[field].startsWith(value);
					} else if (operator === "ends_with") {
						return record[field].endsWith(value);
					} else {
						return record[field] === value;
					}
				});
			});
		},
		getField,
	};
};

export const memoryAdapter = (db: MemoryDB) => (options: BetterAuthOptions) => {
	const { transformInput, transformOutput, convertWhereClause, getField } =
		createTransform(options);

	return {
		id: "memory",
		create: async ({ model, data }) => {
			const transformed = transformInput(data, model, "create");
			db[model].push(transformed);
			return transformOutput(transformed, model);
		},
		findOne: async ({ model, where, select }) => {
			const table = db[model];
			const res = convertWhereClause(where, table, model);
			const record = res[0] || null;
			return transformOutput(record, model, select);
		},
		findMany: async ({ model, where, sortBy, limit, offset }) => {
			let table = db[model];
			if (where) {
				table = convertWhereClause(where, table, model);
			}
			if (sortBy) {
				table = table.sort((a, b) => {
					const field = getField(model, sortBy.field);
					if (sortBy.direction === "asc") {
						return a[field] > b[field] ? 1 : -1;
					} else {
						return a[field] < b[field] ? 1 : -1;
					}
				});
			}
			if (offset !== undefined) {
				table = table.slice(offset);
			}
			if (limit !== undefined) {
				table = table.slice(0, limit);
			}
			return table.map((record) => transformOutput(record, model));
		},
		count: async ({ model }) => {
			return db[model].length;
		},
		update: async ({ model, where, update }) => {
			const table = db[model];
			const res = convertWhereClause(where, table, model);
			res.forEach((record) => {
				Object.assign(record, transformInput(update, model, "update"));
			});
			return transformOutput(res[0], model);
		},
		delete: async ({ model, where }) => {
			const table = db[model];
			const res = convertWhereClause(where, table, model);
			db[model] = table.filter((record) => !res.includes(record));
		},
		deleteMany: async ({ model, where }) => {
			const table = db[model];
			const res = convertWhereClause(where, table, model);
			let count = 0;
			db[model] = table.filter((record) => {
				if (res.includes(record)) {
					count++;
					return false;
				}
				return !res.includes(record);
			});
			return count;
		},
		updateMany(data) {
			const { model, where, update } = data;
			const table = db[model];
			const res = convertWhereClause(where, table, model);
			res.forEach((record) => {
				Object.assign(record, update);
			});
			return res[0] || null;
		},
	} satisfies Adapter;
};
