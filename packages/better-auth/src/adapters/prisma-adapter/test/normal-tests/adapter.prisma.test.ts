import { beforeAll, describe } from "vitest";
import { pushPrismaSchema } from "../push-schema";
import { createTestOptions } from "../test-options";
import { runAdapterTest } from "../../../test";

describe("Adapter tests", async () => {
	beforeAll(async () => {
		await pushPrismaSchema("normal");
		console.log("Pushed normal Prisma Schema using pnpm...");
		const { getAdapter } = await import("./get-adapter");
		const { clearDb } = getAdapter();
		await clearDb();
	});

	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			const { getAdapter } = await import("./get-adapter");
			const { adapter } = getAdapter();
			const opts = createTestOptions(adapter);
			return adapter({ ...opts, ...customOptions });
		},
	});
});
