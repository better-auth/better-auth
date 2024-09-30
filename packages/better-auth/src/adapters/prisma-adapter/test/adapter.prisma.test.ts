import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "..";
import { runAdapterTest } from "../../test";
import { twoFactor } from "../../../plugins";
import path from "path";

const db = new PrismaClient();
describe("adapter test", async () => {
	beforeAll(async () => {
		await clearDb();
	});
	const adapter = prismaAdapter(db, {
		provider: "sqlite",
	});

	it("should create schema", async () => {
		const res = await adapter.createSchema!({
			database: {
				provider: "sqlite",
				url: ":memory:",
			},
		});
		expect(res.code).toMatchSnapshot("__snapshots__/adapter.prisma");
	});

	it("should work with plugins", async () => {
		const res = await adapter.createSchema!({
			database: {
				provider: "sqlite",
				url: ":memory:",
			},
			plugins: [twoFactor()],
		});
		expect(res.code).toMatchSnapshot(
			"__snapshots__/adapter-with-plugins.prisma",
		);
	});

	await runAdapterTest({
		adapter,
	});
});

async function clearDb() {
	await db.user.deleteMany();
}
