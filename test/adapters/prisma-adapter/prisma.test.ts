import { prismaAdapter } from "../../../src/adapters/prisma";
import { beforeAll, describe } from "vitest";
import { runAdapterTest } from "../adapter-test";

import PrismaClient from "@prisma/client";

const db = new PrismaClient.PrismaClient();

describe("adapter test", async () => {
	beforeAll(async () => {
		await clearDb();
	});
	const adapter = prismaAdapter(db);
	await runAdapterTest({
		adapter,
	});
});

async function clearDb() {
	await db.user.deleteMany();
	await db.session.deleteMany();
}
