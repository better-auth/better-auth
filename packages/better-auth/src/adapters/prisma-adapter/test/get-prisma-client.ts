import { fileURLToPath } from "node:url";
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
						`./.tmp/prisma-client-${dialect}-${migrationCount}`,
						import.meta.url,
					),
				)
	);
	const db = new PrismaClient();
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
