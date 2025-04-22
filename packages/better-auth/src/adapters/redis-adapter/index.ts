import {
	filterFirstKey,
	filterKeys,
	findOneWithWhere,
	findWithWhere,
	sort,
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
					await redis.hmset(key, data);
					return data;
				},
				async count({ model, where }) {
					const keys = await findWithWhere(redis, model, where);
					debugLog({ method: "count" }, { keys });
					return keys.length;
				},
				async findOne({ model, where, select }) {
					const keys = await findOneWithWhere(redis, model, where);
					debugLog({ method: "findOne" }, { keys });
					return keys as any;
				},
				async findMany({ model, where, limit, sortBy, offset }) {
					let matchingKeys = await filterKeys(redis, model, where);
					debugLog({ method: "findMany" }, { matchingKeys });
					if (sortBy) {
						matchingKeys = await sort({
							getFieldAttributes,
							model,
							matchingKeys,
							sortBy,
							redis,
							debugLog,
						});
					}
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
					const matchingKey = await filterFirstKey(redis, model, where);
					debugLog({ method: "update" }, { matchingKey });
					if (!matchingKey) return null;

					const updateData: Record<string, string> = {};
					for (const key in update) {
						if (Object.prototype.hasOwnProperty.call(update, key)) {
							const value = update[key];
							updateData[key] = String(value); // Convert all values to strings for Redis hashes.
						}
					}
					debugLog({ method: "update" }, { updateData });
					await redis.hmset(matchingKey, updateData);
					const updatedRecord = await redis.hgetall(matchingKey);
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
				async updateMany({ model, where, update }) {
					const keys = await filterKeys(redis, model, where);
					debugLog({ method: "updateMany" }, { keys });
					for (const key of keys) {
						await redis.hmset(key, update);
					}
					return keys.length;
				},
			} satisfies CustomAdapter;
		},
	});
};
