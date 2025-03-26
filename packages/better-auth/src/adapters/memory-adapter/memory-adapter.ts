import { createAdapter } from "../create-adapter";
import type { Where } from "../../types";

export interface MemoryDB {
	[key: string]: any[];
}

export const memoryAdapter = (db: MemoryDB) =>
	createAdapter({
		config: {
			adapterId: "memory",
			adapterName: "Memory Adapter",
			usePlural: false,
			debugLogs: false,
		},
		adapter: ({ getField, options }) => {
			function convertWhereClause(where: Where[], table: any[], model: string) {
				return table.filter((record) => {
					return where.every((clause) => {
						const { field: _field, value, operator } = clause;
						const field = getField({ model, field: _field });
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
			}
			return {
				create: async ({ model, data }) => {
					if (options.advanced?.useNumberId) {
						// @ts-ignore
						data.id = db[model].length + 1;
					}
					db[model].push(data);
					return data;
				},
				findOne: async ({ model, where, select }) => {
					const table = db[model];
					const res = convertWhereClause(where, table, model);
					const record = res[0] || null;
					return record;
				},
				findMany: async ({ model, where, sortBy, limit, offset }) => {
					let table = db[model];
					if (where) {
						table = convertWhereClause(where, table, model);
					}
					if (sortBy) {
						table = table.sort((a, b) => {
							const field = getField({ model, field: sortBy.field });
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
					return table;
				},
				count: async ({ model }) => {
					return db[model].length;
				},
				update: async ({ model, where, update }) => {
					const table = db[model];
					const res = convertWhereClause(where, table, model);
					res.forEach((record) => {
						Object.assign(record, update);
					});
					return res[0] || null;
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
				updateMany({ model, where, update }) {
					const table = db[model];
					const res = convertWhereClause(where, table, model);
					res.forEach((record) => {
						Object.assign(record, update);
					});
					return res[0] || null;
				},
			};
		},
	});
