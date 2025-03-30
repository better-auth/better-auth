import { beforeAll, describe } from "vitest";
import { pushPrismaSchema } from "../push-schema";
import { createTestOptions } from "../test-options";
import { runAdapterTest } from "../../../test";

describe("Adapter tests", async () => {
	beforeAll(async () => {
		await pushPrismaSchema("normal");
		console.log("Successfully pushed normal Prisma Schema using pnpm...");
		const { getAdapter } = await import("./get-adapter");
		const { clearDb } = getAdapter();
		await clearDb();
	});

	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			const { getAdapter } = await import("./get-adapter");
			const { adapter } = getAdapter();
			const { advanced, database, session, user } = createTestOptions(adapter);
			return adapter({
				...customOptions,
				user: {
					...user,
					...customOptions.user,
				},
				session: {
					...session,
					...customOptions.session,
				},
				advanced: {
					...advanced,
					...customOptions.advanced,
				},
				database,
			});
		},
	});
});
