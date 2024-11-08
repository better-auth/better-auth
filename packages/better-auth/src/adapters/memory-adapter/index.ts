import type { Adapter, Where } from "../../types";

export interface MemoryDB {
	[key: string]: any[];
}

export const memoryAdapter = (db: MemoryDB): Adapter => {
	const whereClause = (where: Where[], table: any[]) => {
		return table.filter((record) => {
			return where.every((clause) => {
				const { field, value, operator } = clause;
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
	};

	const applySelect = (record: any, select: string[]) => {
		if (!select) return record;
		return select.reduce((acc, field) => {
			acc[field] = record[field];
			return acc;
		}, {} as any);
	};

	return {
		id: "memory",
		create: async ({ model, data }) => {
			db[model].push(data);
			return data as any;
		},
		findOne: async ({ model, where, select }) => {
			const table = db[model];
			const res = whereClause(where, table);
			const record = res[0] || null;
			return record ? (select ? applySelect(record, select) : record) : null;
		},
		findMany: async ({ model, where, sortBy, limit, offset }) => {
			let table = db[model];
			if (where) {
				table = whereClause(where, table);
			}
			if (sortBy) {
				table = table.sort((a, b) => {
					if (sortBy.direction === "asc") {
						return a[sortBy.field] > b[sortBy.field] ? 1 : -1;
					} else {
						return a[sortBy.field] < b[sortBy.field] ? 1 : -1;
					}
				});
			}
			if (offset !== undefined) {
				table = table.slice(offset);
			}
			if (limit !== undefined) {
				table = table.slice(0, limit);
			}
			return table;
		},
		update: async ({ model, where, update }) => {
			const table = db[model];
			const res = whereClause(where, table);
			res.forEach((record) => {
				Object.assign(record, update);
			});
			return res[0] || null;
		},
		delete: async ({ model, where }) => {
			const table = db[model];
			const res = whereClause(where, table);
			db[model] = table.filter((record) => !res.includes(record));
			return res[0] || null;
		},
		deleteMany: async ({ model, where }) => {
			const table = db[model];
			const res = whereClause(where, table);
			db[model] = table.filter((record) => !res.includes(record));
		},
	};
};
