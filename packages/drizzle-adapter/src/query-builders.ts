import type { SQL } from "drizzle-orm";
import { ilike, sql } from "drizzle-orm";

type DrizzleColumn = Parameters<typeof ilike>[0];

type DrizzleProvider = "pg" | "mysql" | "sqlite" | "mssql";

/**
 * Case-insensitive LIKE/ILIKE for pattern matching.
 * Uses ILIKE on PostgreSQL, LOWER()+LIKE on MySQL/SQLite.
 */
export function insensitiveIlike(
	column: DrizzleColumn,
	pattern: string,
	provider: DrizzleProvider,
): SQL {
	return provider === "pg"
		? ilike(column, pattern)
		: sql`LOWER(${column}) LIKE LOWER(${pattern})`;
}

/**
 * LIKE/ILIKE with an explicit backslash escape character so callers can match a
 * literal `%` or `_`. SQLite has no default LIKE escape, so the ESCAPE clause is
 * always supplied. The escape character is passed as a bound parameter.
 *
 * This does not support MySQL's `NO_BACKSLASH_ESCAPES` sql_mode, under which the
 * bound backslash is rejected as a two-character ESCAPE argument.
 *
 * @see https://www.sqlite.org/lang_expr.html
 */
export function escapedLike(
	column: DrizzleColumn,
	pattern: string,
	provider: DrizzleProvider,
	mode: "sensitive" | "insensitive" = "sensitive",
): SQL {
	const escape = "\\";
	if (mode === "insensitive") {
		return provider === "pg"
			? sql`${column} ILIKE ${pattern} ESCAPE ${escape}`
			: sql`LOWER(${column}) LIKE LOWER(${pattern}) ESCAPE ${escape}`;
	}
	return sql`${column} LIKE ${pattern} ESCAPE ${escape}`;
}

/**
 * Case-insensitive IN for string arrays.
 */
export function insensitiveInArray(
	column: DrizzleColumn,
	values: string[],
): SQL {
	if (values.length === 0) {
		return sql`false`;
	}
	return sql`LOWER(${column}) IN (${sql.join(
		values.map((v) => sql`LOWER(${v})`),
		sql`, `,
	)})`;
}

/**
 * Case-insensitive NOT IN for string arrays.
 */
export function insensitiveNotInArray(
	column: DrizzleColumn,
	values: string[],
): SQL {
	if (values.length === 0) {
		return sql`true`;
	}
	return sql`LOWER(${column}) NOT IN (${sql.join(
		values.map((v) => sql`LOWER(${v})`),
		sql`, `,
	)})`;
}

/**
 * Case-insensitive equality for strings.
 */
export function insensitiveEq(column: DrizzleColumn, value: string): SQL {
	return sql`LOWER(${column}) = LOWER(${value})`;
}

/**
 * Case-insensitive inequality for strings.
 */
export function insensitiveNe(column: DrizzleColumn, value: string): SQL {
	return sql`LOWER(${column}) <> LOWER(${value})`;
}
