import type { SQL } from "drizzle-orm";
import { ilike, sql } from "drizzle-orm";

type DrizzleColumn = Parameters<typeof ilike>[0];

type DrizzleProvider = "pg" | "mysql" | "sqlite";

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
 * Case-insensitive IN for string arrays.
 */
export function insensitiveInArray(
	column: DrizzleColumn,
	values: string[],
): SQL {
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
