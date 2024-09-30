import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "..";
import { runAdapterTest } from "../../test";

const db = new PrismaClient();

describe("adapter test", async () => {
	beforeAll(async () => {
		await clearDb();
	});
	const adapter = prismaAdapter(db, {
		provider: "sqlite",
	});

	it("should match", async () => {
		const res = await adapter.createSchema!({
			database: {
				provider: "sqlite",
				url: ":memory:",
			},
		});
		expect(res.code).toMatchSnapshot("__snapshots__/adapter.prisma");
	});

	await runAdapterTest({
		adapter,
	});
});

async function clearDb() {
	await db.user.deleteMany();
}
