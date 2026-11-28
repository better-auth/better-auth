import type { DBFieldAttribute } from "./type";

/**
 * Recognizes current-date defaults when generating database schemas.
 */
export function isCurrentDateDefault(value: DBFieldAttribute["defaultValue"]) {
	if (typeof value !== "function") return false;

	const source = value.toString();

	// Preserve existing detection and accept Bun's printed arrow callback.
	return (
		source.includes("new Date()") ||
		source.split("=>")[1]?.trim() === "new Date"
	);
}
