import { beforeAll, describe } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "..";
import { runAdapterTest } from "../../test";
import type { BetterAuthOptions } from "../../../types";

const db = new PrismaClient();
describe("adapter test", async () => {
	beforeAll(async () => {
		await clearDb();
	});
	const adapter = prismaAdapter(db, {
		provider: "sqlite",
	});

	await runAdapterTest({
		adapter: adapter({
			user: {
				fields: {
					email: "email_address",
				},
			},
			session: {
				modelName: "sessions",
			},
		} as BetterAuthOptions),
	});
});

async function clearDb() {
	await db.user.deleteMany();
	await db.sessions.deleteMany();
}
