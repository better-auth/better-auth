import type { Redis } from "ioredis";
import type { CleanedWhere } from "../create-adapter";
import type { FieldType } from "../../db";
import { logger } from "../../utils";

export async function filterFirstKey(
	redis: Redis,
	modelName: string,
	where: CleanedWhere[],
): Promise<string | null> {
	const pattern = `${modelName}:*`;
	let cursor = "0";

	do {
		const [newCursor, keys] = await redis.scan(cursor, "MATCH", pattern);
		cursor = newCursor;

		for (const key of keys) {
			let match = true;
			for (const condition of where) {
				const { field, operator, value } = condition;
				const item = await redis.hget(key, field);

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
					default:
						conditionMatch = true; // or false if no operator means no match
				}

				if (!conditionMatch) {
					match = false;
					break;
				}
			}

			if (match) {
				return key; // Found a match, return the key immediately
			}
		}
	} while (cursor !== "0");

	return null; // No match found
}
export async function getAll(
	redis: Redis,
	modelName: string,
): Promise<Record<string, any>[]> {
	const pattern = `${modelName}:*`;
	let cursor = "0";
	const allKeys: string[] = [];
	do {
		const [newCursor, keys] = await redis.scan(cursor, "MATCH", pattern);
		cursor = newCursor;
		allKeys.push(...keys);
	} while (cursor !== "0");

	const results: Record<string, any>[] = [];
	for (const key of allKeys) {
		const data = await redis.hgetall(key);
		if (data && Object.keys(data).length > 0) {
			results.push(data);
		}
	}
	return results;
}
export async function filterKeys(
	redis: Redis,
	modelName: string,
	where?: CleanedWhere[],
): Promise<string[]> {
	const pattern = `${modelName}:*`;
	let cursor = "0";
	let allKeys: string[] = [];

	do {
		const [newCursor, keys] = await redis.scan(cursor, "MATCH", pattern);
		cursor = newCursor;
		allKeys = allKeys.concat(keys);
	} while (cursor !== "0");

	if (!where || where.length === 0) {
		return allKeys;
	}

	const filteredKeys: string[] = [];

	for (const key of allKeys) {
		let match = true;
		for (const condition of where) {
			const { field, operator, value } = condition;
			const item = await redis.hget(key, field);

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
				default:
					conditionMatch = true; // or false if no operator means no match
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
	redis: Redis,
	modelName: string,
	where?: CleanedWhere[],
): Promise<Record<string, any>[]> {
	if (!where || where.length === 0) {
		// Return all if where is undefined or empty
		return getAll(redis, modelName);
	}

	const matchingKeys = await filterKeys(redis, modelName, where);

	const results: Record<string, any>[] = [];
	for (const key of matchingKeys) {
		const data = await redis.hgetall(key);
		if (data && Object.keys(data).length > 0) {
			results.push(data);
		}
	}

	return results;
}
export async function findOneWithWhere(
	redis: Redis,
	modelName: string,
	where?: CleanedWhere[],
): Promise<Record<string, any> | null> {
	if (!where || where.length === 0) {
		// If no where clause, return the first one found
		const allResults = await getAll(redis, modelName);
		return allResults.length > 0 ? allResults[0] : null;
	}

	const matchingKey = await filterFirstKey(redis, modelName, where);

	if (matchingKey) {
		const data = await redis.hgetall(matchingKey);
		if (data && Object.keys(data).length > 0) {
			return data;
		}
	}

	return null;
}
