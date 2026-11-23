import { sql } from "kysely";
import type { KyselyDatabaseType } from "./types";

/**
 * LIKE with a backslash ESCAPE clause, so a pattern built with
 * {@link escapeLikePattern} matches `%` and `_` literally. Insensitive mode uses
 * ILIKE on PostgreSQL and LOWER()+LIKE on MySQL/SQLite/MSSQL.
 */
export function escapedLike(
	columnRef: string,
	pattern: string,
	dbType: KyselyDatabaseType | undefined,
	mode: "sensitive" | "insensitive",
) {
	const column = sql.ref(columnRef);
	const escape = "\\";
	if (mode === "sensitive") {
		return sql<boolean>`${column} LIKE ${pattern} ESCAPE ${escape}`;
	}
	return dbType === "postgres"
		? sql<boolean>`${column} ILIKE ${pattern} ESCAPE ${escape}`
		: sql<boolean>`LOWER(${column}) LIKE LOWER(${pattern}) ESCAPE ${escape}`;
}

/**
 * Escapes the LIKE metacharacters in `value` so it matches literally under
 * {@link escapedLike}'s backslash ESCAPE clause. MSSQL also treats `[` as a
 * character-class wildcard.
 */
export function escapeLikePattern(value: unknown, dbType?: KyselyDatabaseType) {
	// Backslash first so the escapes added below are not escaped again.
	const escaped = String(value ?? "")
		.replace(/\\/g, "\\\\")
		.replace(/%/g, "\\%")
		.replace(/_/g, "\\_");
	return dbType === "mssql" ? escaped.replace(/\[/g, "\\[") : escaped;
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
