import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "../..";

export function getAdapter() {
	const db = new PrismaClient();

	async function clearDb() {
		await db.sessions.deleteMany();
		await db.user.deleteMany();
		try {
			await db.$executeRaw`DELETE FROM sqlite_sequence WHERE name = 'User'`;
		} catch {}
		try {
			// it's `sessions` not `session` because our `createTestOptions` uses `modelName: "sessions"`
			await db.$executeRaw`DELETE FROM sqlite_sequence WHERE name = 'Sessions'`;
		} catch {}
	}

	const adapter = prismaAdapter(db, {
		provider: "sqlite",
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});

	return { adapter, clearDb };
}
