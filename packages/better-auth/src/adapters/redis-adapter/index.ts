import {
	filterFirstKey,
	filterKeys,
	findOneWithWhere,
	findWithWhere,
} from "./utils";
import {
	createAdapter,
	type AdapterDebugLogs,
	type CustomAdapter,
} from "../create-adapter";
import type { Redis } from "ioredis";

export interface RedisAdapterConfig {
	debugLogs?: AdapterDebugLogs;
}

export const redisAdapter = (redis: Redis, config?: RedisAdapterConfig) => {
	return createAdapter({
		config: {
			adapterId: "redis",
			adapterName: "Redis Adapter",
			debugLogs: config?.debugLogs,
			supportsNumericIds: false,
			supportsArrays: false,
			supportsJSON: false,
			supportsDates: false,
			supportsBooleans: false,
			supportsNumbers: false,
		},
		adapter: ({ debugLog, getFieldAttributes }) => {
			return {
				async create({ data, model }) {
					if (!data.id) {
						debugLog(
							"Adapter create method was called without an `id` field. This is required for redis adapter.",
						);
						throw new Error("ID is missing during adapter create method.");
					}
					const key = `${model}:${data.id}`;
					debugLog({ method: "create" }, { key });
					try {
						// Use hmset to store data as a hash
						const result = await redis.hmset(key, data);

						if (result !== "OK") {
							debugLog(`Error setting key ${key} in redis:`, result);
							throw new Error("Failed to create record.");
						}
						return data;
					} catch (error) {
						debugLog(`Error setting key ${key} in redis:`, error);
						throw new Error("Failed to create record.");
					}
				},
				async count({ model, where }) {
					const keys = await findWithWhere(redis, model, where);
					debugLog({ method: "count" }, { keys });
					return keys.length;
				},
				async findOne({ model, where }) {
					const keys = await findOneWithWhere(redis, model, where);
					debugLog({ method: "findOne" }, { keys });
					return keys as any;
				},
				async findMany({ model, where, limit, sortBy, offset }) {
					let matchingKeys = await filterKeys(redis, model, where);
					debugLog({ method: "findMany" }, { matchingKeys });
					// Sort the keys (using asynchronous compare function)
					if (sortBy) {
						const fieldAttributes = getFieldAttributes({
							model,
							field: sortBy.field,
						});

						// Pre-fetch all field values for sorting
						const keyFieldPairs = await Promise.all(
							matchingKeys.map(async (key) => {
								const value = await redis.hget(key, sortBy.field);
								return { key, value };
							}),
						);

						keyFieldPairs.sort((a, b) => {
							let aValue = a.value;
							let bValue = b.value;

							if (aValue === null && bValue === null) {
								return 0;
							}
							if (aValue === null) {
								return 1;
							}
							if (bValue === null) {
								return -1;
							}

							if (fieldAttributes.type === "number") {
								let aValueNumber = aValue !== null ? Number(aValue) : -Infinity;
								let bValueNumber = bValue !== null ? Number(bValue) : -Infinity;

								if (aValueNumber === bValueNumber) return 0;
								if (sortBy.direction === "desc") {
									return aValueNumber < bValueNumber ? 1 : -1;
								} else {
									return aValueNumber > bValueNumber ? 1 : -1;
								}
							} else if (fieldAttributes.type === "string") {
								const normalizedA = aValue.toLowerCase();
								const normalizedB = bValue.toLowerCase();
								const multiplier = sortBy.direction === "asc" ? 1 : -1;
								if (normalizedA < normalizedB) return -1 * multiplier;
								if (normalizedA > normalizedB) return 1 * multiplier;
								return 0;
							} else if (fieldAttributes.type === "boolean") {
								if (aValue === "1" && bValue === "0") return 1;
								if (aValue === "0" && bValue === "1") return -1;
								return 0;
							} else if (fieldAttributes.type === "date") {
								try {
									const aDate = new Date(aValue);
									const bDate = new Date(bValue);
									return sortBy.direction === "desc"
										? bDate.getTime() - aDate.getTime()
										: aDate.getTime() - bDate.getTime();
								} catch (error) {
									debugLog(
										`Error sorting date field ${sortBy.field} for key ${a.key}: (Could it be that a date is invalid?)`,
										error,
									);

									return 0;
								}
							} else {
								return 0;
							}
						});

						// Extract sorted keys
						matchingKeys = keyFieldPairs.map((pair) => pair.key);
					}

					// Apply offset and limit
					const finalOffset = offset || 0;
					const paginatedKeys = matchingKeys.slice(
						finalOffset,
						finalOffset + limit,
					);

					const results: Record<string, any>[] = [];
					for (const key of paginatedKeys) {
						const data = await redis.hgetall(key);
						if (data && Object.keys(data).length > 0) {
							results.push(data);
						}
					}

					return results as any;
				},
				async update({ model, update, where }) {
					// Find the key to update
					const matchingKey = await filterFirstKey(redis, model, where);

					debugLog({ method: "update" }, { matchingKey });

					if (!matchingKey) {
						return null; // No matching record found
					}

					// Convert the update object to key-value pairs for hmset
					const updateData: Record<string, string> = {};
					for (const key in update) {
						if (Object.prototype.hasOwnProperty.call(update, key)) {
							const value = update[key];
							updateData[key] = String(value); // Convert all values to strings
						}
					}

					debugLog({ method: "update" }, { updateData });

					// Update the record in Redis
					await redis.hmset(matchingKey, updateData);

					// Retrieve the updated record (optional, but good practice)
					const updatedRecord = await redis.hgetall(matchingKey);

					// Convert the updated record to the type T (if needed)
					return updatedRecord as any;
				},
				async delete({ model, where }) {
					const matchingKey = await filterFirstKey(redis, model, where);
					debugLog({ method: "delete" }, { matchingKey });
					if (!matchingKey || !matchingKey.length) return;
					await redis.del(matchingKey);
				},
				async deleteMany({ model, where }) {
					const keys = await filterKeys(redis, model, where);
					debugLog({ method: "deleteMany" }, { keys });
					if (!keys || !keys.length) return 0;
					await redis.del(keys);
					return keys.length;
				},
				async updateMany(data) {
					//TODO: vvvv
					const { model, where, update } = data;
					const keys = await filterKeys(redis, model, where);
					debugLog({ method: "updateMany" }, { keys });
					for (const key of keys) {
						const currentData = await redis.hgetall(key);
						await redis.hmset(key, update);
					}
					return keys.length;
				},
			} satisfies CustomAdapter;
		},
	});
};
