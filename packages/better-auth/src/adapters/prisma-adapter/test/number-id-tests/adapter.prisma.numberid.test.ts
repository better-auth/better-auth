import { beforeAll, describe } from "vitest";
import { runNumberIdAdapterTest } from "../../../test";
import { pushPrismaSchema } from "../push-schema";
import { createTestOptions } from "../test-options";

describe("Number Id Adapter Test", async () => {
	beforeAll(async () => {
		await pushPrismaSchema("number-id");
		const { getAdapter } = await import("./get-adapter");
		const { clearDb } = getAdapter();
		await clearDb();
	});

	await runNumberIdAdapterTest({
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
		async cleanUp() {
			const { getAdapter } = await import("./get-adapter");
			const { clearDb } = getAdapter();
			await clearDb();
		},
	});
});
