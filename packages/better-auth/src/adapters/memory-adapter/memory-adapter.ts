import type { BetterAuthOptions } from "@better-auth/core";
import type {
	CleanedWhere,
	DBAdapterDebugLogOption,
	JoinConfig,
} from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import { logger } from "@better-auth/core/env";

export interface MemoryDB {
	[key: string]: any[];
}

export interface MemoryAdapterConfig {
	debugLogs?: DBAdapterDebugLogOption | undefined;
}

export const memoryAdapter = (
	db: MemoryDB,
	config?: MemoryAdapterConfig | undefined,
) => {
	let lazyOptions: BetterAuthOptions | null = null;
	let adapterCreator = createAdapterFactory({
		config: {
			adapterId: "memory",
			adapterName: "Memory Adapter",
			usePlural: false,
			debugLogs: config?.debugLogs || false,
			customTransformInput(props) {
				const useNumberId =
					props.options.advanced?.database?.useNumberId ||
					props.options.advanced?.database?.generateId === "serial";
				if (useNumberId && props.field === "id" && props.action === "create") {
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
		adapter: ({ getFieldName, options, getModelName }) => {
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
					else if (typeof aValue === "string" && typeof bValue === "string") {
						comparison = aValue.localeCompare(bValue);
					}
					// Handle date comparison
					else if (aValue instanceof Date && bValue instanceof Date) {
						comparison = aValue.getTime() - bValue.getTime();
					}
					// Handle numeric comparison
					else if (typeof aValue === "number" && typeof bValue === "number") {
						comparison = aValue - bValue;
					}
					// Handle boolean comparison
					else if (typeof aValue === "boolean" && typeof bValue === "boolean") {
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
				join?: JoinConfig,
			): any[] {
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

				// Group results by base model and nest joined data as arrays
				const grouped = new Map<string, any>();
				// Track seen IDs per joined model for O(1) deduplication
				const seenIds = new Map<string, Set<string>>();

				for (const baseRecord of baseRecords) {
					const baseId = String(baseRecord.id);

					if (!grouped.has(baseId)) {
						const nested: Record<string, any> = { ...baseRecord };

						// Initialize joined data structures based on isUnique
						for (const [joinModel, joinAttr] of Object.entries(join)) {
							const joinModelName = getModelName(joinModel);
							if (joinAttr.relation === "one-to-one") {
								nested[joinModelName] = null;
							} else {
								nested[joinModelName] = [];
								seenIds.set(`${baseId}-${joinModel}`, new Set());
							}
						}

						grouped.set(baseId, nested);
					}

					const nestedEntry = grouped.get(baseId)!;

					// Add joined data
					for (const [joinModel, joinAttr] of Object.entries(join)) {
						const joinModelName = getModelName(joinModel);
						const joinTable = db[joinModelName];
						if (!joinTable) {
							logger.error(
								`[MemoryAdapter] JoinOption model ${joinModelName} not found in the DB`,
								Object.keys(db),
							);
							throw new Error(`JoinOption model ${joinModelName} not found`);
						}

						const matchingRecords = joinTable.filter(
							(joinRecord: any) =>
								joinRecord[joinAttr.on.to] === baseRecord[joinAttr.on.from],
						);

						if (joinAttr.relation === "one-to-one") {
							// For unique relationships, store a single object (or null)
							nestedEntry[joinModelName] = matchingRecords[0] || null;
						} else {
							// For non-unique relationships, store array with limit
							const seenSet = seenIds.get(`${baseId}-${joinModel}`)!;
							const limit = joinAttr.limit ?? 100;
							let count = 0;

							for (const matchingRecord of matchingRecords) {
								if (count >= limit) break;
								if (!seenSet.has(matchingRecord.id)) {
									nestedEntry[joinModelName].push(matchingRecord);
									seenSet.add(matchingRecord.id);
									count++;
								}
							}
						}
					}
				}

				return Array.from(grouped.values());
			}
			return {
				create: async ({ model, data }) => {
					const useNumberId =
						options.advanced?.database?.useNumberId ||
						options.advanced?.database?.generateId === "serial";
					if (useNumberId) {
						// @ts-expect-error
						data.id = db[getModelName(model)]!.length + 1;
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
						// When join is present, res is an array of nested objects
						const resArray = res as any[];
						if (!resArray.length) {
							return null;
						}
						// Return the first nested object
						return resArray[0];
					}
					// Without join, res is an array
					const resArray = res as any[];
					const record = resArray[0] || null;
					return record;
				},
				findMany: async ({ model, where, sortBy, limit, offset, join }) => {
					let res = convertWhereClause(where || [], model, join);

					if (join) {
						// When join is present, res is an array of nested objects
						const resArray = res as any[];
						if (!resArray.length) {
							return [];
						}

						// Apply sorting to nested objects
						applySortToRecords(resArray, sortBy, model);

						// Apply offset and limit
						let paginatedRecords = resArray;
						if (offset !== undefined) {
							paginatedRecords = paginatedRecords.slice(offset);
						}
						if (limit !== undefined) {
							paginatedRecords = paginatedRecords.slice(0, limit);
						}

						return paginatedRecords;
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
						const filteredRecords = convertWhereClause(where, model);
						return filteredRecords.length;
					}
					return db[model]!.length;
				},
				update: async ({ model, where, update }) => {
					const res = convertWhereClause(where, model);
					res.forEach((record) => {
						Object.assign(record, update);
					});
					return res[0] || null;
				},
				delete: async ({ model, where }) => {
					const table = db[model]!;
					const res = convertWhereClause(where, model);
					db[model] = table.filter((record) => !res.includes(record));
				},
				deleteMany: async ({ model, where }) => {
					const table = db[model]!;
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
