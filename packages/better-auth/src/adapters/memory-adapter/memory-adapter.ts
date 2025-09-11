import { logger } from "../../utils";
import {
	createAdapter,
	type AdapterDebugLogs,
	type CleanedWhere,
} from "../create-adapter";

export interface MemoryDB {
	[key: string]: any[];
}

export interface MemoryAdapterConfig {
	debugLogs?: AdapterDebugLogs;
}

export const memoryAdapter = (db: MemoryDB, config?: MemoryAdapterConfig) =>
	createAdapter({
		config: {
			adapterId: "memory",
			adapterName: "Memory Adapter",
			usePlural: false,
			debugLogs: config?.debugLogs || false,
			customTransformInput(props) {
				if (
					props.options.advanced?.database?.useNumberId &&
					props.field === "id" &&
					props.action === "create"
				) {
					return db[props.model].length + 1;
				}
				return props.data;
			},
		},
		adapter: ({ getFieldName, options, debugLog }) => {
			function convertWhereClause(where: CleanedWhere[], model: string) {
				const table = db[model];
				if (!table) {
					logger.error(
						`[MemoryAdapter] Model ${model} not found in the DB`,
						Object.keys(db),
					);
					throw new Error(`Model ${model} not found`);
				}
				return table.filter((record) => {
					return where.every((clause) => {
						let { field, value, operator } = clause;

						if (operator === "in") {
							if (!Array.isArray(value)) {
								throw new Error("Value must be an array");
							}
							// @ts-expect-error
							return value.includes(record[field]);
						} else if (operator === "not_in") {
							if (!Array.isArray(value)) {
								throw new Error("Value must be an array");
							}
							// @ts-expect-error
							return !value.includes(record[field]);
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
					if (options.advanced?.database?.useNumberId) {
						// @ts-expect-error
						data.id = db[model].length + 1;
					}
					if (!db[model]) {
						db[model] = [];
					}
					db[model].push(data);
					return data;
				},
				findOne: async ({ model, where }) => {
					const res = convertWhereClause(where, model);
					const record = res[0] || null;
					return record;
				},
				findMany: async ({ model, where, sortBy, limit, offset }) => {
					let table = db[model];
					if (where) {
						table = convertWhereClause(where, model);
					}
					if (sortBy) {
						table = table.sort((a, b) => {
							const field = getFieldName({ model, field: sortBy.field });
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
					const res = convertWhereClause(where, model);
					res.forEach((record) => {
						Object.assign(record, update);
					});
					return res[0] || null;
				},
				delete: async ({ model, where }) => {
					const table = db[model];
					const res = convertWhereClause(where, model);
					db[model] = table.filter((record) => !res.includes(record));
				},
				deleteMany: async ({ model, where }) => {
					const table = db[model];
					const res = convertWhereClause(where, model);
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
					const res = convertWhereClause(where, model);
					res.forEach((record) => {
						Object.assign(record, update);
					});
					return res[0] || null;
				},
			};
		},
	});
