import { fileURLToPath } from "node:url";
import type { Dialect } from "./constants";
import { DATABASE_URLS } from "./constants";

type PC = {
	$disconnect(): Promise<void>;
};

async function createAdapter(dialect: Dialect) {
	if (dialect === "sqlite") {
		const { PrismaBetterSqlite3 } = await import(
			"@prisma/adapter-better-sqlite3"
		);
		return new PrismaBetterSqlite3({ url: DATABASE_URLS[dialect] });
	}
	if (dialect === "postgresql") {
		const { PrismaPg } = await import("@prisma/adapter-pg");
		return new PrismaPg({ connectionString: DATABASE_URLS[dialect] });
	}
	// mysql — use object config instead of URL string to avoid
	// mariadb driver hanging on URL-based connection strings.
	const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
	return new PrismaMariaDb({
		host: "localhost",
		port: 3308,
		user: "user",
		password: "password",
		database: "better_auth",
	});
}

let migrationCount = 0;
const clientMap = new Map<string, PC>();
export const getPrismaClient = async (dialect: Dialect) => {
	if (clientMap.has(`${dialect}-${migrationCount}`)) {
		return clientMap.get(`${dialect}-${migrationCount}`) as PC;
	}
	const { PrismaClient } = await import(
		fileURLToPath(
			new URL(
				migrationCount === 0
					? "./.tmp/prisma-client-base/client.ts"
					: `./.tmp/prisma-client-${dialect}-${migrationCount}/client.ts`,
				import.meta.url,
			),
		)
	);
	// For migrationCount === 0, @prisma/client is generated from base.prisma (sqlite).
	// Use sqlite adapter regardless of dialect since this client is only used for
	// schema generation, not actual database queries.
	const adapter =
		migrationCount === 0
			? await createAdapter("sqlite")
			: await createAdapter(dialect);
	const db = new PrismaClient({ adapter });
	clientMap.set(`${dialect}-${migrationCount}`, db);
	return db as PC;
};

export const incrementMigrationCount = () => {
	migrationCount++;
	return migrationCount;
};

export const destroyPrismaClient = ({
	migrationCount,
	dialect,
}: {
	migrationCount: number;
	dialect: Dialect;
}) => {
	const db = clientMap.get(`${dialect}-${migrationCount}`);
	if (db) {
		db.$disconnect();
	}
	clientMap.delete(`${dialect}-${migrationCount}`);
};
