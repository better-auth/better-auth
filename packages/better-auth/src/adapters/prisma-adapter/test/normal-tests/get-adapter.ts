import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "../..";

export function getAdapter() {
	const db = new PrismaClient();

	async function clearDb() {
		await db.sessions.deleteMany();
		await db.user.deleteMany();
	}

	const adapter = prismaAdapter(db, {
		provider: "sqlite",
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});

	return { adapter, clearDb };
}
