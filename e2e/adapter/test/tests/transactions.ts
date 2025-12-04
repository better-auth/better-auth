import { expect } from "vitest";
import type { User } from "../../types";
import { createTestSuite } from "../create-test-suite";

/**
 * This test suite tests the transaction functionality of the adapter.
 */
export const transactionsTestSuite = createTestSuite(
	"transactions",
	{},
	({ adapter, generate, hardCleanup }) => ({
		"transaction - should rollback failing transaction": async ({ skip }) => {
			const isEnabled = adapter.options?.adapterConfig.transaction;
			if (!isEnabled) {
				skip(
					`Skipping test: ${adapter.options?.adapterConfig.adapterName} does not support transactions`,
				);
				return;
			}

			const user1 = await generate("user");
			const user2 = await generate("user");
			await expect(
				adapter.transaction(async (tx) => {
					await tx.create({ model: "user", data: user1, forceAllowId: true });
					const users = await tx.findMany({ model: "user" });
					expect(users).toHaveLength(1);
					throw new Error("Simulated failure");
					await tx.create({ model: "user", data: user2, forceAllowId: true });
				}),
			).rejects.toThrow("Simulated failure");
			const result = await adapter.findMany<User>({
				model: "user",
			});
			//Transactions made rows are unable to be automatically cleaned up, so we need to clean them up manually
			await hardCleanup();
			expect(result.length).toBe(0);
		},
	}),
);
