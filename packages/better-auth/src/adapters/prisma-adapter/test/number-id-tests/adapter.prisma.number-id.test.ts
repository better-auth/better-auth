import { beforeAll, describe } from "vitest";
import { runNumberIdAdapterTest } from "../../../test";
import { pushPrismaSchema } from "../push-schema";
import { createTestOptions } from "../test-options";
import * as fs from "node:fs";
import { getState, stateFilePath } from "../state";

describe("Number Id Adapter Test", async () => {
	beforeAll(async () => {
		await new Promise(async (resolve) => {
			await new Promise((r) => setTimeout(r, 500));
			if (getState() === "IDLE") {
				resolve(true);
				return;
			}
			console.log(`Waiting for state to be IDLE...`);
			fs.watch(stateFilePath, () => {
				if (getState() === "IDLE") {
					resolve(true);
					return;
				}
			});
		});
		console.log(`Now running Number ID Prisma adapter test...`);
		await pushPrismaSchema("number-id");
		console.log(`Successfully pushed number id Prisma Schema using pnpm...`);
		const { getAdapter } = await import("./get-adapter");
		const { clearDb } = getAdapter();
		await clearDb();
	}, Number.POSITIVE_INFINITY);

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
	});
});
