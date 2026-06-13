import { describe, expect, it } from "vitest";
import { createOauthDpopReplayStore } from "./dpop";

describe("createOauthDpopReplayStore", () => {
	it("reserves a fresh jti and rejects a replayed one", async () => {
		const inserted = new Set<string>();
		const adapter = {
			create: async ({
				data,
			}: {
				model: string;
				data: Record<string, unknown>;
			}) => {
				const id = data.replayId as string;
				if (inserted.has(id)) {
					throw new Error("UNIQUE constraint failed: oauthDpopProof.replayId");
				}
				inserted.add(id);
				return data;
			},
		};
		const store = createOauthDpopReplayStore(adapter);
		const reservation = {
			key: "replay-key",
			expiresAt: new Date(Date.now() + 300_000),
			now: new Date(),
		};

		expect(await store.reserve(reservation)).toBe(true);
		expect(await store.reserve(reservation)).toBe(false);
	});

	it("rethrows adapter errors that are not unique-constraint violations", async () => {
		const adapter = {
			create: async () => {
				throw new Error("connection refused");
			},
		};
		const store = createOauthDpopReplayStore(adapter);

		await expect(
			store.reserve({
				key: "replay-key",
				expiresAt: new Date(Date.now() + 300_000),
				now: new Date(),
			}),
		).rejects.toThrow("connection refused");
	});
});
