import { beforeAll, describe, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "./prisma";
import { runAdapterTest } from "../test";

const db = new PrismaClient();

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
