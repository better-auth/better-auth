import type { GenericEndpointContext } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import {
	familyWasInvalidatedAfterRotation,
	invalidateRefreshFamily,
} from "./token";

describe("refresh family invalidation", () => {
	it("revokes the family before a failing refresh delete", async () => {
		const updates: Array<Record<string, unknown>> = [];
		const calls: string[] = [];
		const ctx = {
			context: {
				adapter: {
					updateMany: async (args: { update: Record<string, unknown> }) => {
						calls.push("update");
						updates.push(args.update);
						return 1;
					},
					findMany: async () => [{ id: "r1" }],
					deleteMany: async (args: { model: string }) => {
						calls.push(`delete:${args.model}`);
						if (args.model === "oauthRefreshToken") {
							throw new Error("refresh delete failed");
						}
						return 1;
					},
				},
			},
		} as unknown as GenericEndpointContext;

		await expect(
			invalidateRefreshFamily(ctx, "client", "user"),
		).rejects.toThrow("refresh delete failed");
		expect(calls.indexOf("update")).toBeLessThan(
			calls.indexOf("delete:oauthRefreshToken"),
		);
		expect(updates[0]?.revoked).toBeInstanceOf(Date);
		expect((updates[0]?.revoked as Date).getTime()).toBeGreaterThan(Date.now());
		expect(updates[0]?.rotationReplayExpiresAt).toBeNull();
		expect(updates[0]?.rotationReplayResponse).toBeNull();
	});

	it("treats a later revoke or a missing parent as family invalidation", () => {
		const rotatedAt = new Date("2026-10-08T00:00:00Z");
		expect(
			familyWasInvalidatedAfterRotation({
				revoked: rotatedAt,
				rotatedAt,
			}),
		).toBe(false);
		expect(
			familyWasInvalidatedAfterRotation({
				revoked: new Date("2026-10-08T00:00:01Z"),
				rotatedAt,
			}),
		).toBe(true);
		expect(familyWasInvalidatedAfterRotation(null)).toBe(true);
	});
});
