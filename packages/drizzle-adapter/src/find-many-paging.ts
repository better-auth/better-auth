/**
 * Companion LIMIT when OFFSET is present and the query is unbounded.
 *
 * MySQL rejects OFFSET without LIMIT. Drizzle's SQLite dialect omits
 * negative LIMIT values (`limit >= 0`), so `LIMIT -1` never reaches
 * SQLite and the query becomes OFFSET without LIMIT. A large positive
 * integer is valid on both and is practically unbounded.
 */
const UNBOUNDED_OFFSET_LIMIT = Number.MAX_SAFE_INTEGER;

/**
 * Limit/offset for a `findMany` call, including dialect workarounds so
 * unbounded queries with an offset stay valid SQL.
 *
 * Postgres accepts OFFSET without LIMIT. MySQL and SQLite do not.
 */
export function findManyPaging(
	provider: "pg" | "mysql" | "sqlite",
	limit: number | undefined,
	offset: number | undefined,
): { limit?: number; offset?: number } {
	const paging: { limit?: number; offset?: number } = {};
	if (typeof limit === "number") {
		paging.limit = limit;
	} else if (
		offset !== undefined &&
		(provider === "sqlite" || provider === "mysql")
	) {
		paging.limit = UNBOUNDED_OFFSET_LIMIT;
	}
	if (offset !== undefined) {
		paging.offset = offset;
	}
	return paging;
}
