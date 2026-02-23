import { describe, expect, it } from "vitest";
import { createAdapterFactory } from "../adapter/factory";
import type { JoinConfig } from "../adapter";

describe("adapter factory joins", () => {
	it("builds account join config when user modelName is account", async () => {
		let capturedJoin: JoinConfig | undefined;
		const adapterFactory = createAdapterFactory({
			config: {
				adapterId: "test",
			},
			adapter: () => ({
				create: async ({ data }) => data as any,
				update: async () => null,
				updateMany: async () => 0,
				findOne: async ({ join }) => {
					capturedJoin = join;
					return null;
				},
				findMany: async () => [],
				delete: async () => {},
				deleteMany: async () => 0,
				count: async () => 0,
			}),
		});

		const adapter = adapterFactory({
			experimental: {
				joins: {
					enabled: true,
				},
			},
			user: {
				modelName: "account",
			},
			account: {
				modelName: "identity",
			},
		} as any);

		await expect(
			adapter.findOne({
				model: "user",
				where: [{ field: "id", value: "u1" }],
				join: {
					account: true,
				},
			}),
		).resolves.toBeNull();

		expect(capturedJoin).toBeDefined();
		expect(capturedJoin?.identity?.on.from).toBe("id");
		expect(capturedJoin?.identity?.on.to).toBe("userId");
	});
});
