import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "../..";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";

export async function getAdapter() {
	const dbFile = `${crypto.randomUUID()}.db`;
	await copyFile(
		join(import.meta.dirname, "./.db/dev.db"),
		join(import.meta.dirname, `./.db/${dbFile}`),
	);
	const db = new PrismaClient({
		datasourceUrl: `file:./.db/${dbFile}`,
	});

	const adapter = prismaAdapter(db, {
		provider: "sqlite",
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});

	return {
		adapter,
		clear: async function clearDb() {
			await db.sessions.deleteMany();
			await db.user.deleteMany();
			try {
				await db.$executeRaw`DELETE FROM sqlite_sequence WHERE name = 'User'`;
			} catch {}
			try {
				// it's `sessions` not `session` because our `createTestOptions` uses `modelName: "sessions"`
				await db.$executeRaw`DELETE FROM sqlite_sequence WHERE name = 'Sessions'`;
			} catch {}
		},
	};
}
