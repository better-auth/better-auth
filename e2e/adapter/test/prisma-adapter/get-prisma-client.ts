import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

type PC = InstanceType<typeof PrismaClient>;

const DATABASE_URLS: Record<string, string> = {
	sqlite: "file:./dev.db",
	postgresql: "postgres://user:password@localhost:5434/better_auth",
	mysql: "mysql://user:password@localhost:3308/better_auth",
};

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
						`./.tmp/prisma-client-${dialect}-${migrationCount}`,
						import.meta.url,
					),
				)
	);
	const db = new PrismaClient({
		datasourceUrl: DATABASE_URLS[dialect],
	});
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
