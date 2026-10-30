import type { Where } from "@better-auth/core/db/adapter";

/**
 * Builds the `where` that rereads a row after a MySQL update, which has no
 * `RETURNING`. An equality match on an updated field must use the new value,
 * but a range guard such as `expiresAt > now` keeps its original value:
 * swapping in the new value would turn it into `expiresAt > newValue` and miss
 * the updated row.
 */
export function updatedRowWhere(
	where: Where[],
	update: Record<string, unknown>,
): Where[] {
	return where.map((w) =>
		update[w.field] !== undefined && (!w.operator || w.operator === "eq")
			? { ...w, value: update[w.field] as Where["value"] }
			: w,
	);
}
