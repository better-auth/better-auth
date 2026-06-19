import type { BetterAuthOptions } from "../types";
import type { DatabaseType } from "../types/database";

/**
 * Detects the SQL engine for the built-in adapter from a raw database handle,
 * without importing Kysely. The wrapped forms (`{ dialect, type }` and
 * `{ db, type }`) carry the engine explicitly; raw driver handles are matched
 * structurally. Returns null for adapters, missing config, or handles that
 * cannot be classified (pass `{ dialect, type }` for those).
 */
export function getDatabaseType(
	database: BetterAuthOptions["database"],
): DatabaseType | null {
	if (!database || typeof database === "function") {
		return null;
	}
	if ("dialect" in database) {
		return database.type ?? null;
	}
	if ("db" in database) {
		return database.type ?? null;
	}
	if ("aggregate" in database) {
		return "sqlite";
	}
	if ("getConnection" in database) {
		return "mysql";
	}
	if ("connect" in database) {
		return "postgres";
	}
	if ("fileControl" in database) {
		return "sqlite";
	}
	if ("open" in database && "close" in database && "prepare" in database) {
		return "sqlite";
	}
	// Cloudflare D1
	if ("batch" in database && "exec" in database && "prepare" in database) {
		return "sqlite";
	}
	return null;
}
