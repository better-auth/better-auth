import type { GenericEndpointContext } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import {
	familyWasInvalidatedAfterRotation,
	invalidateRefreshFamily,
} from "./token";

describe("refresh family invalidation", () => {
	it("revokes the family before a failing refresh delete", async () => {
		const updates: Array<Record<string, unknown>> = [];
		const ctx = {
			context: {
				adapter: {
					updateMany: async (args: { update: Record<string, unknown> }) => {
						updates.push(args.update);
						return 1;
					},
					findMany: async () => [{ id: "r1" }],
					deleteMany: async (args: { model: string }) => {
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
		expect(updates[0]?.revoked).toBeInstanceOf(Date);
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
