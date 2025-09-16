import { logger } from "../../utils";
import {
	createAdapterFactory,
	type AdapterDebugLogs,
	type CleanedWhere,
} from "../adapter-factory";
import type { BetterAuthOptions } from "../../types";

export interface MemoryDB {
	[key: string]: any[];
}

export interface MemoryAdapterConfig {
	debugLogs?: AdapterDebugLogs;
}

export const memoryAdapter = (db: MemoryDB, config?: MemoryAdapterConfig) => {
	let lazyOptions: BetterAuthOptions | null = null;
	let adapterCreator = createAdapterFactory({
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
			transaction: async (cb) => {
				let clone = structuredClone(db);
				try {
					return cb(adapterCreator(lazyOptions!));
				} catch {
					// Rollback changes
					Object.keys(db).forEach((key) => {
						db[key] = clone[key];
					});
					throw new Error("Transaction failed, rolling back changes");
				}
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

				const evalClause = (record: any, clause: CleanedWhere): boolean => {
					const { field, value, operator } = clause;
					switch (operator) {
						case "in":
							if (!Array.isArray(value)) {
								throw new Error("Value must be an array");
							}
							// @ts-expect-error
							return value.includes(record[field]);
						case "not_in":
							if (!Array.isArray(value)) {
								throw new Error("Value must be an array");
							}
							// @ts-expect-error
							return !value.includes(record[field]);
						case "contains":
							return record[field].includes(value);
						case "starts_with":
							return record[field].startsWith(value);
						case "ends_with":
							return record[field].endsWith(value);
						default:
							return record[field] === value;
					}
				};

				return table.filter((record: any) => {
					if (!where.length || where.length === 0) {
						return true;
					}

					let result = evalClause(record, where[0]);
					for (const clause of where) {
						const clauseResult = evalClause(record, clause);

						if (clause.connector === "OR") {
							result = result || clauseResult;
						} else {
							result = result && clauseResult;
						}
					}

					return result;
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
	return (options: BetterAuthOptions) => {
		lazyOptions = options;
		return adapterCreator(options);
	};
};
