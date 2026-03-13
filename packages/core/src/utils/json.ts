import { logger } from "../env";

const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function reviveDate(value: unknown): any {
	if (typeof value === "string" && iso8601Regex.test(value)) {
		const date = new Date(value);
		if (!isNaN(date.getTime())) {
			return date;
		}
	}
	return value;
}

/**
 * Recursively walk a pre-parsed object and convert ISO 8601 date strings
 * to Date instances. This handles the case where a Redis client (or similar)
 * returns already-parsed JSON objects whose date fields are still strings.
 */
function reviveDates(value: unknown): any {
	if (value === null || value === undefined) {
		return value;
	}
	if (typeof value === "string") {
		return reviveDate(value);
	}
	if (value instanceof Date) {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(reviveDates);
	}
	if (typeof value === "object") {
		const result: Record<string, any> = {};
		for (const key of Object.keys(value)) {
			result[key] = reviveDates((value as Record<string, any>)[key]);
		}
		return result;
	}
	return value;
}

export function safeJSONParse<T>(data: unknown): T | null {
	try {
		if (typeof data !== "string") {
			if (data === null || data === undefined) {
				return null;
			}
			return reviveDates(data) as T;
		}
		return JSON.parse(data, (_, value) => reviveDate(value));
	} catch (e) {
		logger.error(
			"Failed to parse JSON from secondary storage. " +
				"This can happen if your secondaryStorage.get() returns " +
				"an already-parsed object instead of a JSON string, or " +
				"if the stored value is corrupted. Received type: " +
				typeof data,
			{ error: e },
		);
		return null;
	}
}
