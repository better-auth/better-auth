import type { Prompt } from "../types";

/**
 * Converts URLSearchParams to a plain object, preserving
 * multi-valued keys as arrays instead of discarding duplicates.
 */
export function searchParamsToQuery(
	params: URLSearchParams,
): Record<string, string | string[]> {
	const result: Record<string, string | string[]> = Object.create(null);
	for (const key of new Set(params.keys())) {
		const values = params.getAll(key);
		result[key] = values.length === 1 ? values[0]! : values;
	}
	return result;
}

/**
 * Removes a prompt value from the query and returns
 * the remaining params as a plain object.
 */
export function deleteFromPrompt(query: URLSearchParams, prompt: Prompt) {
	const prompts = query.get("prompt")?.split(" ");
	const foundPrompt = prompts?.findIndex((v) => v === prompt) ?? -1;
	if (foundPrompt >= 0) {
		prompts?.splice(foundPrompt, 1);
		prompts?.length
			? query.set("prompt", prompts.join(" "))
			: query.delete("prompt");
	}
	return searchParamsToQuery(query);
}
