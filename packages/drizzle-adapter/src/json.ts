export function tryParseJSON(value: unknown): unknown {
	if (typeof value !== "string") return value;

	const trimmed = value.trim();
	if (!trimmed) return value;

	// Fast-path: only parse JSON objects/arrays
	const first = trimmed[0];
	if (first !== "{" && first !== "[") return value;

	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

