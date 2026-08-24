import { sql } from "kysely";
import type { KyselyDatabaseType } from "./types";

/**
 * Case-insensitive ILIKE/LIKE for pattern matching.
 * Uses ILIKE on PostgreSQL, LOWER()+LIKE on MySQL/SQLite/MSSQL.
 */
export function insensitiveIlike(
	columnRef: string,
	pattern: string,
	dbType?: KyselyDatabaseType,
) {
	return dbType === "postgres"
		? sql`${sql.ref(columnRef)} ILIKE ${pattern}`
		: sql`LOWER(${sql.ref(columnRef)}) LIKE LOWER(${pattern})`;
}

/**
 * Case-insensitive IN for string arrays.
 * Returns { lhs, values } for use with eb(lhs, "in", values).
 */
export function insensitiveIn(columnRef: string, values: string[]) {
	return {
		lhs: sql`LOWER(${sql.ref(columnRef)})`,
		values: values.map((v) => v.toLowerCase()),
	};
}

/**
 * Case-insensitive NOT IN for string arrays.
 */
export function insensitiveNotIn(columnRef: string, values: string[]) {
	return {
		lhs: sql`LOWER(${sql.ref(columnRef)})`,
		values: values.map((v) => v.toLowerCase()),
	};
}

/**
 * Case-insensitive equality for strings.
 * Returns { lhs, value } for use with eb(lhs, "=", value).
 */
export function insensitiveEq(columnRef: string, value: string) {
	return {
		lhs: sql`LOWER(${sql.ref(columnRef)})`,
		value: value.toLowerCase(),
	};
}

/**
 * Case-insensitive inequality for strings.
 */
export function insensitiveNe(columnRef: string, value: string) {
	return {
		lhs: sql`LOWER(${sql.ref(columnRef)})`,
		value: value.toLowerCase(),
	};
}
