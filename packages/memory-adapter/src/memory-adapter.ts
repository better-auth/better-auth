import type { BetterAuthOptions } from "@better-auth/core";
import type {
	CleanedWhere,
	DBAdapterDebugLogOption,
	JoinConfig,
} from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import { logger } from "@better-auth/core/env";
import {
	insensitiveCompare,
	insensitiveContains,
	insensitiveEndsWith,
	insensitiveIn,
	insensitiveNotIn,
	insensitiveStartsWith,
} from "./query-builders";

export interface MemoryDB {
	[key: string]: any[];
}

export interface MemoryAdapterConfig {
	debugLogs?: DBAdapterDebugLogOption | undefined;
}

/**
 * Index a table's rows by their `id` for row-level reconciliation. Every
 * better-auth row carries an `id` (the adapter's join logic already keys on
 * `record.id`), so the id is a stable identity for the three-way merge.
 */
function indexById(rows: any[]): Map<unknown, any> {
	const byId = new Map<unknown, any>();
	for (const row of rows) {
		byId.set(row.id, row);
	}
	return byId;
}

/**
 * Commit a transaction onto the live database with a three-way merge so a
 * concurrent write that interleaved at an `await` point survives.
 *
 * `base` is the snapshot taken when the transaction started; `clone` is that
 * snapshot after the transaction mutated it; `target` is the live database as
 * it stands now (possibly carrying concurrent writes). Replaying only the
 * `base -> clone` delta onto `target` applies the transaction's own creates,
 * updates, and deletes without disturbing rows or tables the transaction never
 * touched. A row the transaction did not change keeps the live version, so a
 * concurrent edit to a different row is preserved. A row the transaction did
 * change wins last-writer-wins over a concurrent edit to the same row, which is
 * acceptable for an in-memory development adapter; isolation is guaranteed only
 * at row/table granularity.
 *
 * `target` is mutated in place so any reference held elsewhere (for example the
 * `db` object the caller passed to `memoryAdapter`) stays valid.
 */
function mergeTransactionInto(
	target: MemoryDB,
	base: MemoryDB,
	clone: MemoryDB,
): void {
	const models = new Set([...Object.keys(base), ...Object.keys(clone)]);

	for (const model of models) {
		// A table present at start but absent after commit was dropped wholesale
		// by the transaction; mirror that on the live db.
		if (!(model in clone)) {
			delete target[model];
			continue;
		}

		const baseById = indexById(base[model] ?? []);
		const cloneRows = clone[model] ?? [];
		const cloneById = indexById(cloneRows);
		const liveRows = target[model] ?? [];

		const merged: any[] = [];
		const placed = new Set<unknown>();
		for (const liveRow of liveRows) {
			const id = liveRow.id;
			const baseRow = baseById.get(id);
			const cloneRow = cloneById.get(id);

			// Removed by the transaction (present at start, gone after commit):
			// drop it. A row absent from base was created concurrently and is kept.
			if (baseRow !== undefined && cloneRow === undefined) {
				continue;
			}
			// Changed by the transaction: take the transaction's version. Unchanged
			// rows keep the live version, preserving any concurrent edit to them.
			if (cloneRow !== undefined && rowChanged(baseRow, cloneRow)) {
				merged.push(cloneRow);
			} else {
				merged.push(liveRow);
			}
			placed.add(id);
		}

		// Rows created inside the transaction (absent from base, never seen on the
		// live db): append in the transaction's insertion order.
		for (const cloneRow of cloneRows) {
			if (!baseById.has(cloneRow.id) && !placed.has(cloneRow.id)) {
				merged.push(cloneRow);
			}
		}

		target[model] = merged;
	}
}

/**
 * Whether the transaction mutated a row, comparing its pre-transaction
 * snapshot to its post-transaction state. Rows hold scalar columns and
 * adapter-serializable values, so JSON equality reliably tells a
 * transaction-made edit apart from an untouched row.
 */
function rowChanged(baseRow: any, cloneRow: any): boolean {
	if (baseRow === undefined) return true;
	return JSON.stringify(baseRow) !== JSON.stringify(cloneRow);
}

export const memoryAdapter = (
	db: MemoryDB,
	config?: MemoryAdapterConfig | undefined,
) => {
	let lazyOptions: BetterAuthOptions | null = null;

	/**
	 * Build an adapter factory whose operations read and write `activeDb`.
	 * The non-transactional adapter targets the live `db`. A transaction
	 * targets an isolated clone so its uncommitted writes are invisible to
	 * concurrent operations against the live `db`. A failed transaction leaves
	 * the live `db` untouched, and a committed one replays only its own
	 * row/table changes, so a concurrent write that interleaved at an `await`
	 * point survives either outcome. Isolation is at row/table granularity:
	 * the in-memory adapter does not serialize writes, so two operations that
	 * edit the same row resolve last-writer-wins. It is built for development
	 * and tests, not production concurrency control.
	 */
	const buildAdapterFactory = (activeDb: MemoryDB) =>
		createAdapterFactory({
			config: {
				adapterId: "memory",
				adapterName: "Memory Adapter",
				usePlural: false,
				debugLogs: config?.debugLogs || false,
				supportsArrays: true,
				customTransformInput(props) {
					const useNumberId =
						props.options.advanced?.database?.generateId === "serial";
					if (
						useNumberId &&
						props.field === "id" &&
						props.action === "create"
					) {
						return activeDb[props.model]!.length + 1;
					}
					return props.data;
				},
				transaction: async (cb) => {
					// Copy-on-write isolation: run the callback against a clone, then
					// replay its delta onto the live db on success. On failure the clone
					// is discarded and the live db is never touched. `base` captures the
					// pre-transaction state so the commit can apply only the rows the
					// transaction changed, preserving writes that interleaved at an
					// `await` point.
					const base = structuredClone(activeDb);
					const clone = structuredClone(activeDb);
					const trxAdapter = buildAdapterFactory(clone)(lazyOptions!);
					const result = await cb(trxAdapter);
					mergeTransactionInto(activeDb, base, clone);
					return result;
				},
			},
			adapter: ({
				getFieldName,
				getDefaultFieldName,
				options,
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
					join?: JoinConfig,
					select?: string[],
				): any[] {
					const baseRecords = (() => {
						const table = activeDb[model];
						if (!table) {
							logger.error(
								`[MemoryAdapter] Model ${model} not found in the DB`,
								Object.keys(activeDb),
							);
							throw new Error(`Model ${model} not found`);
						}

						const evalClause = (record: any, clause: CleanedWhere): boolean => {
							const { field, value, operator, mode = "sensitive" } = clause;
							const isInsensitive =
								mode === "insensitive" &&
								(typeof value === "string" ||
									(Array.isArray(value) &&
										value.every((v) => typeof v === "string")));

							switch (operator) {
								case "in":
									if (!Array.isArray(value)) {
										throw new Error("Value must be an array");
									}
									if (isInsensitive) {
										return insensitiveIn(record[field], value);
									}
									// @ts-expect-error
									return value.includes(record[field]);
								case "not_in":
									if (!Array.isArray(value)) {
										throw new Error("Value must be an array");
									}
									if (isInsensitive) {
										return insensitiveNotIn(record[field], value);
									}
									// @ts-expect-error
									return !value.includes(record[field]);
								case "contains":
									if (isInsensitive) {
										return insensitiveContains(record[field], value);
									}
									return record[field]?.includes(value);
								case "starts_with":
									if (isInsensitive) {
										return insensitiveStartsWith(record[field], value);
									}
									return record[field].startsWith(value);
								case "ends_with":
									if (isInsensitive) {
										return insensitiveEndsWith(record[field], value);
									}
									return record[field].endsWith(value);
								case "ne":
									return isInsensitive
										? !insensitiveCompare(record[field], value)
										: record[field] !== value;
								case "gt":
									return value != null && Boolean(record[field] > value);
								case "gte":
									return value != null && Boolean(record[field] >= value);
								case "lt":
									return value != null && Boolean(record[field] < value);
								case "lte":
									return value != null && Boolean(record[field] <= value);
								default:
									if (isInsensitive) {
										return insensitiveCompare(record[field], value);
									}
									// Treat undefined and null as equivalent for `eq null`
									// predicates. Rows created without a nullable field
									// (the adapter factory's `transformInput` skips
									// `undefined`) store the field as `undefined`; a
									// CAS-style `WHERE field IS NULL` predicate from
									// caller code must match those rows, mirroring SQL
									// `IS NULL` and Mongo's missing-or-null semantics.
									if (value === null) {
										return record[field] == null;
									}
									return record[field] === value;
							}
						};

						let records = table.filter((record: any) => {
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
						if (select?.length && select.length > 0) {
							records = records.map((record: any) =>
								Object.fromEntries(
									Object.entries(record).filter(([key]) =>
										select.includes(getDefaultFieldName({ model, field: key })),
									),
								),
							);
						}
						return records;
					})();

					if (!join) return baseRecords;

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
							const joinTable = activeDb[joinModelName];
							if (!joinTable) {
								logger.error(
									`[MemoryAdapter] JoinOption model ${joinModelName} not found in the DB`,
									Object.keys(activeDb),
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
							options.advanced?.database?.generateId === "serial";
						if (useNumberId) {
							// @ts-expect-error
							data.id = activeDb[getModelName(model)]!.length + 1;
						}
						if (!activeDb[model]) {
							activeDb[model] = [];
						}
						activeDb[model]!.push(data);
						return data;
					},
					findOne: async ({ model, where, select, join }) => {
						const res = convertWhereClause(where, model, join, select);
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
					findMany: async ({
						model,
						where,
						sortBy,
						limit,
						select,
						offset,
						join,
					}) => {
						const res = convertWhereClause(where || [], model, join, select);

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
						return activeDb[model]!.length;
					},
					update: async ({ model, where, update }) => {
						// A singular mutation with an empty predicate is a no-op. Match-all
						// is reserved for updateMany/deleteMany; a singular update must
						// never mutate every row.
						if (where.length === 0) {
							return null;
						}
						const res = convertWhereClause(where, model);
						res.forEach((record) => {
							Object.assign(record, update);
						});
						return res[0] || null;
					},
					delete: async ({ model, where }) => {
						// A singular mutation with an empty predicate is a no-op. Match-all
						// is reserved for updateMany/deleteMany; a singular delete must
						// never remove every row.
						if (where.length === 0) {
							return;
						}
						const table = activeDb[model]!;
						const res = convertWhereClause(where, model);
						activeDb[model] = table.filter((record) => !res.includes(record));
					},
					deleteMany: async ({ model, where }) => {
						const table = activeDb[model]!;
						const res = convertWhereClause(where, model);
						let count = 0;
						activeDb[model] = table.filter((record) => {
							if (res.includes(record)) {
								count++;
								return false;
							}
							return !res.includes(record);
						});
						return count;
					},
					consumeOne: async ({ model, where }) => {
						const table = activeDb[model]!;
						const matches = convertWhereClause(where, model);
						const target = matches[0];
						if (!target) return null;
						activeDb[model] = table.filter((record) => record !== target);
						return target as any;
					},
					incrementOne: async ({ model, where, increment, set }) => {
						// `where` is both selector and guard: a comparison operator that
						// excludes the row (e.g. `remaining > 0` on a depleted counter)
						// yields no match, so nothing is mutated and null is returned.
						const target = convertWhereClause(where, model)[0];
						if (!target) return null;
						for (const [field, delta] of Object.entries(increment)) {
							const current =
								typeof target[field] === "number" ? target[field] : 0;
							target[field] = current + delta;
						}
						if (set) {
							Object.assign(target, set);
						}
						return target as any;
					},
					updateMany: async ({ model, where, update }) => {
						const res = convertWhereClause(where, model);
						res.forEach((record) => {
							Object.assign(record, update);
						});
						return res.length;
					},
				};
			},
		});

	const adapterCreator = buildAdapterFactory(db);
	return (options: BetterAuthOptions) => {
		lazyOptions = options;
		return adapterCreator(options);
	};
};
