import { describe, beforeAll } from "vitest";
import { runNumberIdAdapterTest } from "../../../test";
import { prismaAdapter } from "../../prisma-adapter";
import { PrismaClient } from "@prisma/client";

describe("Number Id Adapter Test", async () => {
	const db = new PrismaClient();

	async function clearDb() {
		await db.sessions.deleteMany();
		await db.user.deleteMany();
		try {
			await db.$executeRaw`DELETE FROM sqlite_sequence WHERE name = 'User'`;
		} catch {}
		try {
			await db.$executeRaw`DELETE FROM sqlite_sequence WHERE name = 'Sessions'`;
		} catch {}
	}

	const adapter = prismaAdapter(db, {
		provider: "sqlite",
	});

	beforeAll(async () => {
		await clearDb();
	});

	await runNumberIdAdapterTest({
		getAdapter: async () => {
			return adapter({
				database: adapter,
				user: {
					fields: { email: "email_address" },
					additionalFields: {
						test: {
							type: "string",
							defaultValue: "test",
						},
					},
				},
				session: {
					modelName: "sessions",
				},
				advanced: {
					database: {
						useNumberId: true,
					},
				},
			});
		},
	});
});
