import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

type PC = InstanceType<typeof PrismaClient>;

const DATABASE_URLS: Record<string, string> = {
	sqlite: "file:./dev.db",
	postgresql: "postgres://user:password@localhost:5434/better_auth",
	mysql: "mysql://user:password@localhost:3308/better_auth",
};

async function createAdapter(dialect: "sqlite" | "postgresql" | "mysql") {
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
	// mysql
	const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
	return new PrismaMariaDb({ url: DATABASE_URLS[dialect] });
}

let migrationCount = 0;
const clientMap = new Map<string, PC>();
export const getPrismaClient = async (
	dialect: "sqlite" | "postgresql" | "mysql",
) => {
	if (clientMap.has(`${dialect}-${migrationCount}`)) {
		return clientMap.get(`${dialect}-${migrationCount}`) as PC;
	}
	const { PrismaClient } = await import(
		migrationCount === 0
			? "@prisma/client"
			: fileURLToPath(
					new URL(
						`./.tmp/prisma-client-${dialect}-${migrationCount}/client.ts`,
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
	dialect: "sqlite" | "postgresql" | "mysql";
}) => {
	const db = clientMap.get(`${dialect}-${migrationCount}`);
	if (db) {
		db.$disconnect();
	}
	clientMap.delete(`${dialect}-${migrationCount}`);
};
