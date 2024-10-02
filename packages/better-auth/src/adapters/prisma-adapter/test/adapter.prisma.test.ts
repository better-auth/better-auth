import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "..";
import { runAdapterTest } from "../../test";
import { twoFactor } from "../../../plugins";
import path from "path";
import Database from "better-sqlite3";
import { generatePrismaSchema } from "../generate-cli";

const db = new PrismaClient();
describe("adapter test", async () => {
	beforeAll(async () => {
		await clearDb();
	});
	const adapter = prismaAdapter(db, {
		provider: "sqlite",
	});
	const database = new Database(path.join(__dirname, "test.db"));
	it("should create schema", async () => {
		const res = await generatePrismaSchema({
			provider: "sqlite",
			options: {
				database,
			},
		});
		expect(res.code).toMatchSnapshot("__snapshots__/adapter.prisma");
	});

	it("should work with plugins", async () => {
		const res = await generatePrismaSchema({
			provider: "sqlite",
			options: {
				database,
				plugins: [twoFactor()],
			},
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
