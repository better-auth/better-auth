import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { describe, expect, it, vi } from "vitest";
import { getBaseAdapter } from "./adapter-base";

function legacyAdapter(
	overrides: Partial<DBAdapter<BetterAuthOptions>> = {},
): DBAdapter<BetterAuthOptions> {
	return {
		id: "legacy",
		create: vi.fn(async ({ data }) => data),
		update: vi.fn(async () => null),
		updateMany: vi.fn(async () => 0),
		findOne: vi.fn(async () => null),
		findMany: vi.fn(async () => []),
		delete: vi.fn(async () => {}),
		deleteMany: vi.fn(async () => 0),
		count: vi.fn(async () => 0),
		...overrides,
	} as DBAdapter<BetterAuthOptions>;
}

describe("getBaseAdapter createMany patch", () => {
	it("patches createMany onto transaction-scoped adapters", async () => {
		const trx = legacyAdapter();
		const root = legacyAdapter({
			transaction: async (callback) => callback(trx),
		});
		const adapter = await getBaseAdapter(
			{
				database: () => root,
			} as BetterAuthOptions,
			async () => root,
		);

		const created = await adapter.transaction(async (transactionAdapter) => {
			return transactionAdapter.createMany({
				model: "user",
				data: [
					{ name: "Ada", email: "ada@example.com" },
					{ name: "Bob", email: "bob@example.com" },
				],
			});
		});

		expect(created).toHaveLength(2);
		expect(trx.create).toHaveBeenCalledTimes(2);
		expect(root.create).not.toHaveBeenCalled();
	});

	it("invokes a legacy transaction method with the adapter as this", async () => {
		const trx = legacyAdapter();
		const root = legacyAdapter({
			transaction: async function (
				this: DBAdapter<BetterAuthOptions>,
				callback,
			) {
				expect(this.id).toBe("legacy");
				return callback(trx);
			},
		});
		const adapter = await getBaseAdapter(
			{
				database: () => root,
			} as BetterAuthOptions,
			async () => root,
		);

		await adapter.transaction(async (transactionAdapter) => {
			return transactionAdapter.createMany({
				model: "user",
				data: [{ name: "Ada", email: "ada@example.com" }],
			});
		});
	});
});
