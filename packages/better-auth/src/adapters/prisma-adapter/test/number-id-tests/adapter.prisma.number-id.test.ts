import { beforeEach, describe } from "vitest";
import { runNumberIdAdapterTest } from "../../../test";
import { pushPrismaSchema } from "../push-schema";
import { createTestOptions } from "../test-options";
import type { Adapter, BetterAuthOptions } from "../../../../types";
import { getAdapter } from "./get-adapter";

describe("Number Id Adapter Test", () => {
	let adapter: (options: BetterAuthOptions) => Adapter;
	beforeEach(async () => {
		pushPrismaSchema("number-id");
		const { clear, adapter: _adapter } = await getAdapter();
		adapter = _adapter;
		await clear();
	});

	runNumberIdAdapterTest({
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
