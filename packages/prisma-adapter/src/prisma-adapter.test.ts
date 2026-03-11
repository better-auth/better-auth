import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { prismaAdapter } from "./prisma-adapter";

describe("prisma-adapter", () => {
	const createTestAdapter = (prisma: Record<string, unknown>) =>
		prismaAdapter(prisma as never, {
			provider: "sqlite",
		})({} as BetterAuthOptions);

	it("should create prisma adapter", () => {
		const prisma = {
			$transaction: vi.fn(),
		};
		const adapter = prismaAdapter(prisma as never, {
			provider: "sqlite",
		});
		expect(adapter).toBeDefined();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8365
	 */
	it("should fall back to updateMany for non-unique verification identifiers", async () => {
		const update = vi.fn();
		const updateMany = vi.fn().mockResolvedValue({ count: 1 });
		const findFirst = vi.fn().mockResolvedValue({
			id: "verification-id",
			identifier: "magic-link-token",
			value: "updated-value",
		});
		const adapter = createTestAdapter({
			$transaction: vi.fn(),
			verification: {
				findFirst,
				update,
				updateMany,
			},
		});

		const result = await adapter.update({
			model: "verification",
			where: [{ field: "identifier", value: "magic-link-token" }],
			update: { value: "updated-value" },
		});

		expect(update).not.toHaveBeenCalled();
		expect(updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					identifier: { equals: "magic-link-token" },
				},
				data: expect.objectContaining({
					value: "updated-value",
					updatedAt: expect.any(Date),
				}),
			}),
		);
		expect(findFirst).toHaveBeenCalledWith({
			where: {
				identifier: { equals: "magic-link-token" },
			},
		});
		expect(result).toEqual({
			id: "verification-id",
			identifier: "magic-link-token",
			value: "updated-value",
		});
	});

	it("should keep using update for unique non-id fields", async () => {
		const update = vi.fn().mockResolvedValue({
			id: "session-id",
			token: "session-token",
			userId: "user-id",
		});
		const updateMany = vi.fn();
		const findFirst = vi.fn();
		const adapter = createTestAdapter({
			$transaction: vi.fn(),
			session: {
				findFirst,
				update,
				updateMany,
			},
		});

		const result = await adapter.update({
			model: "session",
			where: [{ field: "token", value: "session-token" }],
			update: { userId: "user-id" },
		});

		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					token: "session-token",
				},
				data: expect.objectContaining({
					userId: "user-id",
					updatedAt: expect.any(Date),
				}),
			}),
		);
		expect(updateMany).not.toHaveBeenCalled();
		expect(findFirst).not.toHaveBeenCalled();
		expect(result).toEqual({
			id: "session-id",
			token: "session-token",
			userId: "user-id",
		});
	});
});
