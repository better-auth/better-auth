import type { CleanedWhere } from "../create-adapter";
import type { FieldAttribute } from "../../db";
import type { RedisClientType } from "redis";

export async function filterFirstKey(
	redis: RedisClientType<any, any, any>,
	modelName: string,
	where: CleanedWhere[],
): Promise<string | null> {
	const keys = await filterKeys(redis, modelName, where);
	return keys.length > 0 ? keys[0] : null;
}

export async function getAll(
	redis: RedisClientType<any, any, any>,
	modelName: string,
	select?: string[],
): Promise<Record<string, any>[]> {
	const pattern = `${modelName}:*`;
	let cursor = 0;
	const allModels: string[] = [];

	do {
		const res = await redis.scan(cursor, {
			MATCH: pattern,
			COUNT: 100,
		});
		cursor = Number(res.cursor);
		allModels.push(...res.keys);
	} while (cursor !== 0);

	const results: Record<string, any>[] = [];
	for (const model of allModels) {
		if (!select?.length) {
			const data = await redis.hGetAll(model);
			if (data && Object.keys(data).length > 0) {
				results.push(data);
			}
		} else {
			const data: Record<string, string> = {};
			for (const key of select) {
				const value = await redis.hGet(model, key);
				if (value) {
					data[key] = value;
				}
			}
			if (Object.keys(data).length > 0) {
				results.push(data);
			}
		}
	}
	return results;
}
export async function filterKeys(
	redis: RedisClientType<any, any, any>,
	modelName: string,
	where?: CleanedWhere[],
): Promise<string[]> {
	const pattern = `${modelName}:*`;
	let cursor = 0;
	let allKeys: string[] = [];

	do {
		const res = await redis.scan(cursor, {
			MATCH: pattern,
			COUNT: 100,
		});
		cursor = Number(res.cursor);
		allKeys = allKeys.concat(res.keys);
	} while (cursor !== 0);

	if (!where || where.length === 0) {
		return allKeys;
	}

	const filteredKeys: string[] = [];

	for (const key of allKeys) {
		let match = true;
		for (const condition of where) {
			const { field, operator, value } = condition;
			const item = await redis.hGet(key, field);

			if (!item) {
				match = false;
				break;
			}

			let conditionMatch = false;

			switch (operator) {
				case "eq":
					conditionMatch = item === String(value);
					break;
				case "ne":
					conditionMatch = item !== String(value);
					break;
				case "lt":
					conditionMatch = Number(item) < Number(value);
					break;
				case "lte":
					conditionMatch = Number(item) <= Number(value);
					break;
				case "gt":
					conditionMatch = Number(item) > Number(value);
					break;
				case "gte":
					conditionMatch = Number(item) >= Number(value);
					break;
				case "in":
					if (Array.isArray(value)) {
						conditionMatch = value.map(String).includes(item);
					}
					break;
				case "contains":
					conditionMatch = item.includes(String(value));
					break;
				case "starts_with":
					conditionMatch = item.startsWith(String(value));
					break;
				case "ends_with":
					conditionMatch = item.endsWith(String(value));
					break;
			}
			if (!conditionMatch) {
				match = false;
				break;
			}
		}
		if (match) {
			filteredKeys.push(key);
		}
	}

	return filteredKeys;
}

export async function findWithWhere(
	redis: RedisClientType<any, any, any>,
	modelName: string,
	where?: CleanedWhere[],
	select?: string[],
): Promise<Record<string, any>[]> {
	if (!where || where.length === 0) {
		// Return all if where is undefined or empty
		return getAll(redis, modelName, select);
	}

	const matchingKeys = await filterKeys(redis, modelName, where);

	const results: Record<string, any>[] = [];
	for (const key of matchingKeys) {
		if (!select?.length) {
			const data = await redis.hGetAll(key);
			if (data && Object.keys(data).length > 0) {
				results.push(data);
			}
		} else {
			const data: Record<string, string> = {};
			for (const field of select) {
				const value = await redis.hGet(key, field);
				if (value) {
					data[field] = value;
				}
			}
			if (Object.keys(data).length > 0) {
				results.push(data);
			}
		}
	}

	return results;
}

export async function findOneWithWhere(
	redis: RedisClientType<any, any, any>,
	modelName: string,
	where?: CleanedWhere[],
	select?: string[],
): Promise<Record<string, any> | null> {
	if (!where || where.length === 0) {
		// If no where clause, return the first one found
		const allResults = await getAll(redis, modelName, select);
		return allResults.length > 0 ? allResults[0] : null;
	}
	const matchingKey = await filterFirstKey(redis, modelName, where);
	if (!matchingKey) return null;

	// now we return the data
	// if `select` is not provided, we return the whole data
	if (!select?.length) {
		const data = await redis.hGetAll(matchingKey);
		if (data && Object.keys(data).length > 0) {
			return data;
		}
		return null;
	}

	// if `select` is provided, we return the data with only the selected fields
	const data: Record<string, string> = {};
	for (const key of select) {
		const value = await redis.hGet(matchingKey, key);
		if (value) {
			data[key] = value;
		}
	}
	if (Object.keys(data).length > 0) {
		return data;
	}
	return null;
}

export async function sort({
	getFieldAttributes,
	model,
	matchingKeys,
	sortBy,
	redis,
	debugLog,
}: {
	getFieldAttributes: ({
		model,
		field,
	}: {
		model: string;
		field: string;
	}) => FieldAttribute;
	model: string;
	matchingKeys: string[];
	sortBy: { field: string; direction: "asc" | "desc" };
	redis: RedisClientType<any, any, any>;
	debugLog: (message: string, ...args: any[]) => void;
}) {
	const fieldAttributes = getFieldAttributes({
		model,
		field: sortBy.field,
	});

	// Pre-fetch all field values for sorting
	const keyFieldPairs = await Promise.all(
		matchingKeys.map(async (key) => {
			const value = await redis.hGet(key, sortBy.field);
			return { key, value };
		}),
	);

	keyFieldPairs.sort((a, b) => {
		let aValue = a.value;
		let bValue = b.value;

		if (aValue === undefined && bValue === undefined) {
			return 0;
		}
		if (aValue === undefined) {
			return 1;
		}
		if (bValue === undefined) {
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

	return keyFieldPairs.map((pair) => pair.key);
}
