/**
 * SQLite treats a negative LIMIT as unbounded, which is required when OFFSET
 * is used without a cap.
 */
export const SQLITE_UNBOUNDED_LIMIT = -1;

/**
 * MySQL rejects OFFSET without LIMIT. `Number.MAX_SAFE_INTEGER` is a valid
 * integer cap that is practically unbounded.
 */
export const MYSQL_UNBOUNDED_LIMIT = Number.MAX_SAFE_INTEGER;

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
		paging.limit =
			provider === "sqlite" ? SQLITE_UNBOUNDED_LIMIT : MYSQL_UNBOUNDED_LIMIT;
	}
	if (offset !== undefined) {
		paging.offset = offset;
	}
	return paging;
}
