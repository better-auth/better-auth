import { beforeAll, describe, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "..";
import { runAdapterTest } from "../../test";

const db = new PrismaClient();

describe("adapter test", async () => {
	beforeAll(async () => {
		await clearDb();
	});
	const adapter = prismaAdapter({
		provider: "sqlite",
		db,
	});
	await runAdapterTest({
		adapter,
	});
});

async function clearDb() {
	await db.user.deleteMany();
}
