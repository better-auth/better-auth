import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { prismaAdapter } from "./prisma-adapter";

describe("prisma-adapter", () => {
	const createTestAdapter = (prisma: Record<string, unknown>) =>
		prismaAdapter(prisma as never, {
			provider: "sqlite",
		})({} as BetterAuthOptions);

	// incrementOne mutates numeric counters; declare the fields it touches on an
	// existing model so the factory's where/input transforms recognize them.
	const createCounterAdapter = (prisma: Record<string, unknown>) =>
		prismaAdapter(prisma as never, {
			provider: "sqlite",
		})({
			verification: {
				additionalFields: {
					remaining: { type: "number" },
					lastRefill: { type: "number", required: false },
				},
			},
		} as BetterAuthOptions);

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

	it("should fall back to updateMany when where has insensitive mode on a supporting provider", async () => {
		const update = vi.fn();
		const updateMany = vi.fn().mockResolvedValue({ count: 1 });
		const findFirst = vi.fn().mockResolvedValue({
			id: "user-id",
			email: "Test@Example.COM",
			name: "Updated",
		});
		const adapter = prismaAdapter(
			{
				$transaction: vi.fn(),
				user: {
					findFirst,
					update,
					updateMany,
				},
			},
			{ provider: "postgresql" },
		)({});

		const result = await adapter.update({
			model: "user",
			where: [
				{
					field: "email",
					value: "test@example.com",
					mode: "insensitive",
				},
			],
			update: { name: "Updated" },
		});

		expect(update).not.toHaveBeenCalled();
		expect(updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					email: { equals: "test@example.com", mode: "insensitive" },
				},
				data: expect.objectContaining({
					name: "Updated",
					updatedAt: expect.any(Date),
				}),
			}),
		);
		expect(findFirst).toHaveBeenCalledWith({
			where: {
				email: { equals: "test@example.com", mode: "insensitive" },
			},
		});
		expect(result).toEqual({
			id: "user-id",
			email: "Test@Example.COM",
			name: "Updated",
		});
	});

	it("should use update (not updateMany) for insensitive mode on unsupported providers", async () => {
		const update = vi.fn().mockResolvedValue({
			id: "user-id",
			email: "Test@Example.COM",
			name: "Updated",
		});
		const updateMany = vi.fn();
		const findFirst = vi.fn();
		const adapter = createTestAdapter({
			$transaction: vi.fn(),
			user: {
				findFirst,
				update,
				updateMany,
			},
		});

		const result = await adapter.update({
			model: "user",
			where: [
				{
					field: "email",
					value: "test@example.com",
					mode: "insensitive",
				},
			],
			update: { name: "Updated" },
		});

		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { email: "test@example.com" },
				data: expect.objectContaining({
					name: "Updated",
					updatedAt: expect.any(Date),
				}),
			}),
		);
		expect(updateMany).not.toHaveBeenCalled();
		expect(findFirst).not.toHaveBeenCalled();
		expect(result).toEqual({
			id: "user-id",
			email: "Test@Example.COM",
			name: "Updated",
		});
	});

	it("consumeOne rechecks non-unique predicates before deleting", async () => {
		const target = {
			id: "verification-id",
			identifier: "magic-link-token",
			value: "otp",
		};
		const txClient = {
			verification: {
				findFirst: vi.fn().mockResolvedValue(target),
				deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
		};
		const transaction = vi.fn(async (cb) => cb(txClient));
		const adapter = createTestAdapter({
			$transaction: transaction,
			verification: {
				delete: vi.fn(),
			},
		});

		const result = await adapter.consumeOne({
			model: "verification",
			where: [{ field: "identifier", value: "magic-link-token" }],
		});

		expect(result).toEqual(target);
		expect(transaction).toHaveBeenCalledTimes(1);
		expect(txClient.verification.deleteMany).toHaveBeenCalledWith({
			where: {
				AND: [
					{ identifier: { equals: "magic-link-token" } },
					{ id: { equals: "verification-id" } },
				],
			},
		});
	});

	// A delete that fails for any reason other than the record not existing
	// (constraint violation, connection loss, permission denial) must surface
	// the error. Reporting success would hide real data-integrity failures.
	it("delete propagates non-not-found errors instead of swallowing them", async () => {
		const failure = Object.assign(new Error("connection refused"), {
			code: "P1001",
		});
		const del = vi.fn().mockRejectedValue(failure);
		const adapter = createTestAdapter({
			$transaction: vi.fn(),
			user: {
				delete: del,
			},
		});

		await expect(
			adapter.delete({
				model: "user",
				where: [{ field: "id", value: "user-id" }],
			}),
		).rejects.toThrow("connection refused");
		expect(del).toHaveBeenCalledTimes(1);
	});

	// Prisma raises P2025 when the targeted row no longer exists. Deletes are
	// idempotent, so this specific case is a no-op rather than an error.
	it("delete treats a not-found (P2025) error as an idempotent no-op", async () => {
		const failure = Object.assign(
			new Error("Record to delete does not exist."),
			{ code: "P2025" },
		);
		const del = vi.fn().mockRejectedValue(failure);
		const adapter = createTestAdapter({
			$transaction: vi.fn(),
			user: {
				delete: del,
			},
		});

		await expect(
			adapter.delete({
				model: "user",
				where: [{ field: "id", value: "user-id" }],
			}),
		).resolves.toBeUndefined();
		expect(del).toHaveBeenCalledTimes(1);
	});

	it("incrementOne applies a positive delta via Prisma's increment operator", async () => {
		const target = { id: "counter-id", remaining: 3 };
		const txClient = {
			verification: {
				findFirst: vi
					.fn()
					.mockResolvedValueOnce(target)
					.mockResolvedValueOnce({ id: "counter-id", remaining: 4 }),
				updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
		};
		const transaction = vi.fn(async (cb) => cb(txClient));
		const adapter = createCounterAdapter({
			$transaction: transaction,
			verification: {},
		});

		const result = await adapter.incrementOne({
			model: "verification",
			where: [{ field: "id", value: "counter-id" }],
			increment: { remaining: 1 },
		});

		expect(result).toEqual({ id: "counter-id", remaining: 4 });
		expect(txClient.verification.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { remaining: { increment: 1 } },
			}),
		);
	});

	it("incrementOne decrements with a negative delta and applies set values", async () => {
		const target = { id: "counter-id", remaining: 2 };
		const txClient = {
			verification: {
				findFirst: vi.fn().mockResolvedValueOnce(target).mockResolvedValueOnce({
					id: "counter-id",
					remaining: 1,
					lastRefill: 1700,
				}),
				updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
		};
		const transaction = vi.fn(async (cb) => cb(txClient));
		const adapter = createCounterAdapter({
			$transaction: transaction,
			verification: {},
		});

		const result = await adapter.incrementOne({
			model: "verification",
			where: [{ field: "remaining", value: 0, operator: "gt" }],
			increment: { remaining: -1 },
			set: { lastRefill: 1700 },
		});

		expect(result).toEqual({
			id: "counter-id",
			remaining: 1,
			lastRefill: 1700,
		});
		expect(txClient.verification.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					lastRefill: 1700,
					remaining: { increment: -1 },
				}),
				where: {
					AND: [{ remaining: { gt: 0 } }, { id: { equals: "counter-id" } }],
				},
			}),
		);
	});

	it("incrementOne returns null when the guard matches no row", async () => {
		const txClient = {
			verification: {
				findFirst: vi.fn().mockResolvedValue(null),
				updateMany: vi.fn(),
			},
		};
		const transaction = vi.fn(async (cb) => cb(txClient));
		const adapter = createCounterAdapter({
			$transaction: transaction,
			verification: {},
		});

		const result = await adapter.incrementOne({
			model: "verification",
			where: [{ field: "remaining", value: 0, operator: "gt" }],
			increment: { remaining: -1 },
		});

		expect(result).toBeNull();
		expect(txClient.verification.updateMany).not.toHaveBeenCalled();
	});

	it("incrementOne returns null when a racer invalidated the guard between read and write", async () => {
		const target = { id: "counter-id", remaining: 1 };
		const txClient = {
			verification: {
				findFirst: vi.fn().mockResolvedValue(target),
				// The guarded updateMany matches no row because a concurrent caller
				// already drove `remaining` to 0 after the read.
				updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			},
		};
		const transaction = vi.fn(async (cb) => cb(txClient));
		const adapter = createCounterAdapter({
			$transaction: transaction,
			verification: {},
		});

		const result = await adapter.incrementOne({
			model: "verification",
			where: [{ field: "remaining", value: 0, operator: "gt" }],
			increment: { remaining: -1 },
		});

		expect(result).toBeNull();
		expect(txClient.verification.updateMany).toHaveBeenCalledTimes(1);
	});

	it("consumeOne does not open a nested transaction from a transaction adapter", async () => {
		const target = {
			id: "verification-id",
			identifier: "magic-link-token",
		};
		const txClient = {
			verification: {
				findFirst: vi.fn().mockResolvedValue(target),
				deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
		};
		const transaction = vi.fn(async (cb) => cb(txClient));
		const adapter = prismaAdapter(
			{
				$transaction: transaction,
			} as never,
			{
				provider: "sqlite",
				transaction: true,
			},
		)({} as BetterAuthOptions);

		await adapter.transaction(async (trx) => {
			await trx.consumeOne({
				model: "verification",
				where: [{ field: "identifier", value: "magic-link-token" }],
			});
		});

		expect(transaction).toHaveBeenCalledTimes(1);
	});
});
