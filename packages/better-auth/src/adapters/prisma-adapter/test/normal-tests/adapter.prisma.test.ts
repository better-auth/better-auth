import { beforeAll, beforeEach, describe } from "vitest";
import { pushPrismaSchema } from "../push-schema";
import { createTestOptions } from "../test-options";
import { runAdapterTest } from "../../../test";
import { getAdapter } from "./get-adapter";
import type { Adapter, BetterAuthOptions } from "../../../../types";

describe("Adapter tests", () => {
	let adapter: (options: BetterAuthOptions) => Adapter;
	beforeEach(async () => {
		pushPrismaSchema("normal");
		const { clear, adapter: _adapter } = await getAdapter();
		adapter = _adapter;
		await clear();
	});

	runAdapterTest({
		getAdapter: async (customOptions = {}) => {
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
