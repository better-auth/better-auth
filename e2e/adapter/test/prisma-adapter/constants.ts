import { fileURLToPath } from "node:url";

export type Dialect = "sqlite" | "postgresql" | "mysql";

export const DATABASE_URLS: Record<Dialect, string> = {
	sqlite: "file:./dev.db",
	postgresql: "postgres://user:password@localhost:5434/better_auth",
	mysql: "mysql://user:password@localhost:3308/better_auth",
};

export function getSqliteDatabasePath(migrationCount: number) {
	return fileURLToPath(
		new URL(`./.tmp/prisma-sqlite-${migrationCount}.db`, import.meta.url),
	);
}

export function getDatabaseUrl(dialect: Dialect, migrationCount: number) {
	if (dialect !== "sqlite") {
		return DATABASE_URLS[dialect];
	}

	return `file:${getSqliteDatabasePath(migrationCount)}`;
}
