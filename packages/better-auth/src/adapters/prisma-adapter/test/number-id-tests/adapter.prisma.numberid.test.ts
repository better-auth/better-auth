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
			const opts = createTestOptions(adapter);
			return adapter({ ...opts, ...customOptions });
		},
		async cleanUp() {
			const { getAdapter } = await import("./get-adapter");
			const { clearDb } = getAdapter();
			await clearDb();
		},
	});
});
