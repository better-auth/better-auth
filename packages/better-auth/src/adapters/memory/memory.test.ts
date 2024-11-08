import { beforeAll, describe } from "vitest";
import { memoryAdapter } from ".";

import PrismaClient from "@prisma/client";
import { runAdapterTest } from "../test";

const db = new PrismaClient.PrismaClient();

describe("adapter test", async () => {
	beforeAll(async () => {
		await clearDb();
	});
	const db = {
		user: [],
		session: [],
		account: [],
	};
	const adapter = memoryAdapter(db);
	await runAdapterTest({
		adapter,
	});
});

async function clearDb() {
	await db.user.deleteMany();
	await db.session.deleteMany();
}
