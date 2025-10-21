import { logger } from "@better-auth/core/env";
import { createAdapterFactory } from "../adapter-factory";
import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBAdapterDebugLogOption,
	CleanedWhere,
	Join,
} from "@better-auth/core/db/adapter";

export interface MemoryDB {
	[key: string]: any[];
}

export interface MemoryAdapterConfig {
	debugLogs?: DBAdapterDebugLogOption;
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
					return db[props.model]!.length + 1;
				}
				return props.data;
			},
			transaction: async (cb) => {
				let clone = structuredClone(db);
				try {
					const r = await cb(adapterCreator(lazyOptions!));
					return r;
				} catch (error) {
					// Rollback changes
					Object.keys(db).forEach((key) => {
						db[key] = clone[key]!;
					});
					throw error;
				}
			},
		},
		adapter: ({
			getFieldName,
			options,
			debugLog,
			getDefaultModelName,
			getDefaultFieldName,
			getFieldAttributes,
			getModelName,
		}) => {
			const applySortToRecords = (
				records: any[],
				sortBy: { field: string; direction: "asc" | "desc" } | undefined,
				model: string,
			) => {
				if (!sortBy) return records;
				return records.sort((a: any, b: any) => {
					const field = getFieldName({ model, field: sortBy.field });
					const aValue = a[field];
					const bValue = b[field];

					let comparison = 0;

					// Handle null/undefined values
					if (aValue == null && bValue == null) {
						comparison = 0;
					} else if (aValue == null) {
						comparison = -1;
					} else if (bValue == null) {
						comparison = 1;
					}
					// Handle string comparison
					else if (
						typeof aValue === "string" &&
						typeof bValue === "string"
					) {
						comparison = aValue.localeCompare(bValue);
					}
					// Handle date comparison
					else if (aValue instanceof Date && bValue instanceof Date) {
						comparison = aValue.getTime() - bValue.getTime();
					}
					// Handle numeric comparison
					else if (
						typeof aValue === "number" &&
						typeof bValue === "number"
					) {
						comparison = aValue - bValue;
					}
					// Handle boolean comparison
					else if (
						typeof aValue === "boolean" &&
						typeof bValue === "boolean"
					) {
						comparison = aValue === bValue ? 0 : aValue ? 1 : -1;
					}
					// Fallback to string comparison
					else {
						comparison = String(aValue).localeCompare(String(bValue));
					}

					return sortBy.direction === "asc" ? comparison : -comparison;
				});
			};

			function convertWhereClause(
				where: CleanedWhere[],
				model: string,
				join?: Join,
			): any[] | Record<string, any[]> {
				const execute = (where: CleanedWhere[], model: string) => {
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
							case "ne":
								return record[field] !== value;
							case "gt":
								return value != null && Boolean(record[field] > value);
							case "gte":
								return value != null && Boolean(record[field] >= value);
							case "lt":
								return value != null && Boolean(record[field] < value);
							case "lte":
								return value != null && Boolean(record[field] <= value);
							default:
								return record[field] === value;
						}
					};

					return table.filter((record: any) => {
						if (!where.length || where.length === 0) {
							return true;
						}

						let result = evalClause(record, where[0]!);
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
				};

				if (!join) return execute(where, model);

				const baseRecords = execute(where, model);
				const records: Record<string, any[]> = {};
				records[getModelName(model)] = baseRecords;

				for (const [joinModel, joinAttr] of Object.entries(join)) {
					const joinModelName = getModelName(joinModel);
					const joinTable = db[joinModelName];
					if (!joinTable) {
						logger.error(
							`[MemoryAdapter] Join model ${joinModelName} not found in the DB`,
							Object.keys(db),
						);
						throw new Error(`Join model ${joinModelName} not found`);
					}

					records[joinModelName] = [];
					for (const baseRecord of baseRecords) {
						const matchingRecords = joinTable.filter(
							(joinRecord: any) =>
								joinRecord[joinAttr.on.to] === baseRecord[joinAttr.on.from],
						);
						if (joinAttr.type === "inner" && !matchingRecords.length) {
							// For inner join, exclude the base record if there's no match
							records[getModelName(model)] = records[getModelName(model)]!.filter(
								(r) => r !== baseRecord,
							);
						} else if (matchingRecords.length > 0) {
							records[joinModelName]!.push(...matchingRecords);
						}
					}
				}

				return records;
			}
			return {
				create: async ({ model, data }) => {
					if (options.advanced?.database?.useNumberId) {
						// @ts-expect-error
						data.id = db[model]!.length + 1;
					}
					if (!db[model]) {
						db[model] = [];
					}
					db[model]!.push(data);
					return data;
				},
				findOne: async ({ model, where, join }) => {
					const res = convertWhereClause(where, model, join);
					if (join) {
						// When join is present, res is a Record<modelName, records[]>
						const resObj = res as Record<string, any[]>;
						const baseModelName = getModelName(model);
						if (!resObj[baseModelName]?.length) {
							return null;
						}
						// Build result object with joined models
						const result: Record<string, any> = {};
						for (const [modelName, records] of Object.entries(resObj)) {
							result[modelName] = records[0] || null;
						}
						return result;
					}
					// Without join, res is an array
					const resArray = res as any[];
					const record = resArray[0] || null;
					return record;
				},
				findMany: async ({ model, where, sortBy, limit, offset, join }) => {
					let res = convertWhereClause(where || [], model, join);
					
					if (join) {
						// When join is present, res is a Record<modelName, records[]>
						const resObj = res as Record<string, any[]>;
						const baseModelName = getModelName(model);
						const baseRecords = resObj[baseModelName] || [];
						
						if (!baseRecords.length) {
							return [];
						}

						// Apply sorting to base records
						applySortToRecords(baseRecords, sortBy, model);

						// Apply offset and limit to base records
						let paginatedBaseRecords = baseRecords;
						if (offset !== undefined) {
							paginatedBaseRecords = paginatedBaseRecords.slice(offset);
						}
						if (limit !== undefined) {
							paginatedBaseRecords = paginatedBaseRecords.slice(0, limit);
						}

						// Map base records to result objects with joined data
						return paginatedBaseRecords.map((baseRecord: any) => {
							const result: Record<string, any> = {};
							result[baseModelName] = baseRecord;
							for (const [joinModelName, joinRecords] of Object.entries(resObj)) {
								if (joinModelName !== baseModelName) {
									// Find the joined record that matches this base record
									// (In a one-to-one or one-to-many join, we need to find the matching record)
									const matchingRecord = joinRecords.find((jr: any) => {
										// Find the join condition from the original join config
										for (const [jm, jAttr] of Object.entries(join)) {
											if (getModelName(jm) === joinModelName) {
												return jr[jAttr.on.to] === baseRecord[jAttr.on.from];
											}
										}
										return false;
									});
									result[joinModelName] = matchingRecord || null;
								}
							}
							return result;
						});
					}
					
					// Without join - original logic
					const resArray = res as any[];
					let table = applySortToRecords(resArray, sortBy, model);
					if (offset !== undefined) {
						table = table!.slice(offset);
					}
					if (limit !== undefined) {
						table = table!.slice(0, limit);
					}
					return table || [];
				},
				count: async ({ model, where }) => {
					if (where) {
						const filteredRecords = convertWhereClause(where, model) as any;
						return filteredRecords.length;
					}
					return db[model]!.length;
				},
				update: async ({ model, where, update }) => {
					const res = convertWhereClause(where, model) as any;
					res.forEach((record: any) => {
						Object.assign(record, update);
					});
					return res[0] || null;
				},
				delete: async ({ model, where }) => {
					const table = db[model]!;
					const res = convertWhereClause(where, model) as any;
					db[model] = table.filter((record) => !res.includes(record));
				},
				deleteMany: async ({ model, where }) => {
					const table = db[model]!;
					const res = convertWhereClause(where, model) as any;
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
					const res = convertWhereClause(where, model) as any;
					res.forEach((record: any) => {
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
