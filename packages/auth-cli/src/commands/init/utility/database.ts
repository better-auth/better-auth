import type {
	DatabaseAdapter,
	DatabasesConfig,
} from "../configs/databases.config";
import { databasesConfig } from "../configs/databases.config";

export const getDatabaseCode = <A extends DatabaseAdapter | null>(
	adapter: A,
): A extends DatabaseAdapter ? DatabasesConfig : null => {
	if (!adapter) return null as any;
	const database = databasesConfig.find(
		(database) => database.adapter === adapter,
	)!;

	return database as any;
};

/**
 * Extract ORM name from adapter string
 * Examples:
 * - "prisma-sqlite" -> "prisma"
 * - "drizzle-postgresql" -> "drizzle"
 * - "drizzle-sqlite-better-sqlite3" -> "drizzle"
 * - "sqlite-better-sqlite3" -> "kysely"
 * - "sqlite-bun" -> "kysely"
 * - "mongodb" -> "mongodb"
 */
export const getORMFromAdapter = (adapter: DatabaseAdapter): string => {
	if (adapter.includes("-")) {
		const parts = adapter.split("-");
		// Handle kysely adapters like "sqlite-better-sqlite3" or "sqlite-bun"
		if (parts[0] === "sqlite" && parts.length > 1) {
			return "kysely";
		}
		// For other adapters, return the first part (ORM name)
		return parts[0]!;
	}
	// Kysely adapters (mysql, postgresql, mssql) are grouped as "kysely"
	if (["mysql", "postgresql", "mssql"].includes(adapter)) {
		return "kysely";
	}
	// mongodb is its own ORM
	return adapter;
};

/**
 * Check if an adapter is a kysely dialect
 */
export const isKyselyDialect = (adapter: string): boolean => {
	return (
		adapter.startsWith("sqlite-") ||
		["mysql", "postgresql", "mssql"].includes(adapter)
	);
};

/**
 * Check if an adapter should be returned directly without dialect selection
 * (Kysely dialects and MongoDB don't have sub-dialects)
 */
export const isDirectAdapter = (adapter: string): boolean => {
	return isKyselyDialect(adapter) || adapter === "mongodb";
};

/**
 * Format adapter name for display
 */
const formatAdapterLabel = (adapter: DatabaseAdapter): string => {
	// Handle kysely sqlite variants
	if (adapter === "sqlite-better-sqlite3") {
		return "SQLite (better-sqlite3)";
	}
	if (adapter === "sqlite-bun") {
		return "SQLite (bun)";
	}
	if (adapter === "sqlite-node") {
		return "SQLite (node:sqlite)";
	}
	// Handle drizzle sqlite variants
	if (adapter === "drizzle-sqlite-better-sqlite3") {
		return "SQLite (better-sqlite3)";
	}
	if (adapter === "drizzle-sqlite-bun") {
		return "SQLite (bun)";
	}
	if (adapter === "drizzle-sqlite-node") {
		return "SQLite (node:sqlite)";
	}
	// Default: capitalize first letter
	return adapter.charAt(0).toUpperCase() + adapter.slice(1);
};

/**
 * Get all unique ORMs from the database config
 * SQLite variants are grouped under a single "SQLite" option
 */
export const getAvailableORMs = (): Array<{
	value: string;
	label: string;
	adapter?: DatabaseAdapter;
}> => {
	const options: Array<{
		value: string;
		label: string;
		adapter?: DatabaseAdapter;
	}> = [];
	const seenORMs = new Set<string>();
	const seenSQLite = false;

	for (const db of databasesConfig) {
		const dbORM = getORMFromAdapter(db.adapter);

		// Group all SQLite variants under a single "SQLite" option
		if (db.adapter.startsWith("sqlite-")) {
			if (!seenORMs.has("sqlite")) {
				seenORMs.add("sqlite");
				options.push({
					value: "sqlite",
					label: "SQLite",
				});
			}
		} else if (dbORM === "kysely" || dbORM === "mongodb") {
			// For non-SQLite kysely dialects and mongodb, add them directly
			options.push({
				value: db.adapter,
				label: formatAdapterLabel(db.adapter),
				adapter: db.adapter,
			});
		} else if (!seenORMs.has(dbORM)) {
			// For other ORMs, add them once
			seenORMs.add(dbORM);
			options.push({
				value: dbORM,
				label: dbORM.charAt(0).toUpperCase() + dbORM.slice(1),
			});
		}
	}

	// Custom sort order: SQLite, PostgreSQL, MySQL, Drizzle, Prisma, MongoDB, MSSQL
	const sortOrder = [
		"sqlite",
		"postgresql",
		"mysql",
		"drizzle",
		"prisma",
		"mongodb",
		"mssql",
	];

	return options.sort((a, b) => {
		const aIndex = sortOrder.indexOf(a.value);
		const bIndex = sortOrder.indexOf(b.value);
		if (aIndex !== -1 && bIndex !== -1) {
			return aIndex - bIndex;
		}
		if (aIndex !== -1) return -1;
		if (bIndex !== -1) return 1;
		return a.value.localeCompare(b.value);
	});
};

/**
 * Get available dialects for a specific ORM
 */
export const getDialectsForORM = (
	orm: string,
): Array<{ value: string; label: string; adapter: DatabaseAdapter }> => {
	const dialects: Array<{
		value: string;
		label: string;
		adapter: DatabaseAdapter;
	}> = [];

	for (const db of databasesConfig) {
		const dbORM = getORMFromAdapter(db.adapter);
		if (dbORM === orm) {
			let label: string;

			if (db.adapter.includes("-")) {
				const parts = db.adapter.split("-");
				// Handle drizzle sqlite variants: "drizzle-sqlite-better-sqlite3" -> "SQLite (better-sqlite3)"
				if (orm === "drizzle" && parts[1] === "sqlite") {
					label = formatAdapterLabel(db.adapter);
				} else {
					// Standard case: "drizzle-mysql" -> "MySQL", "drizzle-postgresql" -> "PostgreSQL"
					const dialectName = parts.slice(1).join("-");
					label = dialectName.charAt(0).toUpperCase() + dialectName.slice(1);
				}
			} else {
				// For mongodb, the adapter itself is the dialect
				label = formatAdapterLabel(db.adapter);
			}
			dialects.push({
				value: db.adapter,
				label,
				adapter: db.adapter,
			});
		}
	}

	return dialects.sort((a, b) => a.value.localeCompare(b.value));
};
