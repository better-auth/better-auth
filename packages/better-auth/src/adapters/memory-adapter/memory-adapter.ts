import { logger } from "../../utils";
import type { Join } from "../../types";
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
			function performJoins(records: any[], model: string, joins?: Join[]) {
				if (!joins || joins.length === 0) {
					return records;
				}

				return records.map((record) => {
					const joinedRecord = { ...record };

					for (const join of joins) {
						const joinTable = db[join.table];
						if (!joinTable) {
							logger.error(
								`[MemoryAdapter] Join table ${join.table} not found`,
							);
							continue;
						}

						// Parse join conditions
						const leftParts = join.on.left.split(".");
						const rightParts = join.on.right.split(".");

						const leftField =
							leftParts.length === 2 ? leftParts[1] : leftParts[0];
						const rightField =
							rightParts.length === 2 ? rightParts[1] : rightParts[0];

						// Find matching records from join table
						const matchingJoinRecords = joinTable.filter((joinRecord) => {
							return record[leftField] === joinRecord[rightField];
						});

						const joinName = join.alias || join.table;
						if (matchingJoinRecords.length > 0) {
							const joinedData = matchingJoinRecords[0];
							// Add joined fields with prefixed names to avoid conflicts
							if (join.select && join.select.length > 0) {
								for (const field of join.select) {
									joinedRecord[`${joinName}_${field}`] = joinedData[field];
								}
							} else {
								// Add all fields from joined table with prefix
								for (const [key, value] of Object.entries(joinedData)) {
									joinedRecord[`${joinName}_${key}`] = value;
								}
							}
						} else if (join.type === "left" || join.type === "full") {
							// For left/full joins, include null fields when no match
							if (join.select && join.select.length > 0) {
								for (const field of join.select) {
									joinedRecord[`${joinName}_${field}`] = null;
								}
							}
						}
					}

					return joinedRecord;
				});
			}

			function convertWhereClause(
				where: CleanedWhere[],
				model: string,
				joins?: Join[],
			) {
				const table = db[model];
				if (!table) {
					logger.error(
						`[MemoryAdapter] Model ${model} not found in the DB`,
						Object.keys(db),
					);
					throw new Error(`Model ${model} not found`);
				}

				// Helper function to resolve field references
				const resolveFieldValue = (
					record: any,
					fieldRef: string,
					joinedData?: any,
				) => {
					if (fieldRef.includes(".")) {
						const [tableName, fieldName] = fieldRef.split(".");
						if (tableName === model) {
							return record[fieldName];
						}
						// Look for joined data
						if (joinedData && joinedData[tableName]) {
							return joinedData[tableName][fieldName];
						}
						// Fallback to main record
						return record[fieldName];
					} else {
						// Simple field name, use main record
						return record[fieldRef];
					}
				};

				return table.filter((record) => {
					// If we have joins, we need to perform the joins first
					let joinedData: any = {};
					if (joins && joins.length > 0) {
						for (const join of joins) {
							const joinTable = db[join.table];
							if (!joinTable) {
								logger.error(
									`[MemoryAdapter] Join table ${join.table} not found`,
								);
								continue;
							}

							// Parse join conditions
							const leftParts = join.on.left.split(".");
							const rightParts = join.on.right.split(".");

							const leftField =
								leftParts.length === 2 ? leftParts[1] : leftParts[0];
							const rightField =
								rightParts.length === 2 ? rightParts[1] : rightParts[0];

							// Find matching records from join table
							const matchingJoinRecords = joinTable.filter((joinRecord) => {
								return record[leftField] === joinRecord[rightField];
							});

							const joinName = join.alias || join.table;
							if (matchingJoinRecords.length > 0) {
								// For simplicity, take the first match (in real scenarios, this might create multiple result rows)
								joinedData[joinName] = matchingJoinRecords[0];
							} else if (join.type === "left" || join.type === "full") {
								// For left/full joins, include null data when no match
								joinedData[joinName] = null;
							} else {
								// For inner/right joins, exclude this record if no match
								return false;
							}
						}
					}

					return where.every((clause) => {
						let { field, value, operator } = clause;
						const fieldValue = resolveFieldValue(record, field, joinedData);

						if (operator === "in") {
							if (!Array.isArray(value)) {
								throw new Error("Value must be an array");
							}
							return (value as any[]).includes(fieldValue);
						} else if (operator === "not_in") {
							if (!Array.isArray(value)) {
								throw new Error("Value must be an array");
							}
							return !(value as any[]).includes(fieldValue);
						} else if (operator === "contains") {
							return fieldValue && fieldValue.includes(value);
						} else if (operator === "starts_with") {
							return fieldValue && fieldValue.startsWith(value);
						} else if (operator === "ends_with") {
							return fieldValue && fieldValue.endsWith(value);
						} else {
							return fieldValue === value;
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
				findOne: async ({ model, where, select, joins }) => {
					const res = convertWhereClause(where, model, joins);
					const records = performJoins(res, model, joins);
					const record = records[0] || null;
					return record;
				},
				findMany: async ({ model, where, sortBy, limit, offset, joins }) => {
					let table = db[model];
					if (where) {
						table = convertWhereClause(where, model, joins);
					}

					// Perform joins before sorting and pagination
					table = performJoins(table, model, joins);

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
				count: async ({ model, where, joins }) => {
					if (!where && (!joins || joins.length === 0)) {
						return db[model].length;
					}

					let table = db[model];
					if (where) {
						table = convertWhereClause(where, model, joins);
					} else if (joins && joins.length > 0) {
						// Even without where clause, joins can filter records
						table = convertWhereClause([], model, joins);
					}

					return table.length;
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
