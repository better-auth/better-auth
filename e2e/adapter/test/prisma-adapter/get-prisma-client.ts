import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient } from "@prisma/client";

type PC = InstanceType<typeof PrismaClient>;

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

	// Create the appropriate adapter based on dialect
	let adapter: PrismaPg | PrismaMariaDb | PrismaBetterSqlite3;
	if (dialect === "postgresql") {
		adapter = new PrismaPg({
			connectionString: "postgres://user:password@localhost:5434/better_auth",
		});
	} else if (dialect === "mysql") {
		adapter = new PrismaMariaDb({
			host: "localhost",
			port: 3308,
			user: "user",
			password: "password",
			database: "better_auth",
			timezone: "Z",
		});
	} else if (dialect === "sqlite") {
		// Use a file-based database instead of :memory: because in-memory
		// databases don't persist across PrismaClient reconnections
		const dbPath = fileURLToPath(new URL("./dev.db", import.meta.url));
		adapter = new PrismaBetterSqlite3({
			url: `file:${dbPath}`,
		});
	} else {
		throw new Error(`Unsupported dialect: ${dialect}`);
	}

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
