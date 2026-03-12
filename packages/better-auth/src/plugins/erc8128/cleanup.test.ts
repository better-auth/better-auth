import { describe, expect, it, vi } from "vitest";
import {
	cleanupExpiredErc8128Storage,
	createErc8128CleanupScheduler,
} from "./cleanup";

function createMockCleanupAdapter() {
	const rows = new Map<string, Array<Record<string, unknown>>>([
		["erc8128Nonce", []],
		["erc8128VerificationCache", []],
		["erc8128Invalidation", []],
	]);
	const deleteMany = vi.fn(
		async (args: {
			model: string;
			where: Array<{
				field: string;
				operator?: string;
				value: unknown;
			}>;
		}) => {
			const table = rows.get(args.model) ?? [];
			let deleted = 0;
			for (const row of [...table]) {
				const matches = args.where.every((where) => {
					if (where.field === "expiresAt" && where.operator === "lt") {
						return (
							row.expiresAt instanceof Date &&
							row.expiresAt < (where.value as Date)
						);
					}
					return row[where.field] === where.value;
				});
				if (matches) {
					table.splice(table.indexOf(row), 1);
					deleted += 1;
				}
			}
			return deleted;
		},
	);

	return {
		rows,
		adapter: {
			deleteMany,
		},
		deleteMany,
	};
}

function createMockSecondaryStorage() {
	const store = new Map<string, { value: string; expiresAt: number }>();
	return {
		store,
		storage: {
			async get(key: string) {
				const entry = store.get(key);
				if (!entry) return null;
				if (entry.expiresAt <= Date.now()) {
					store.delete(key);
					return null;
				}
				return entry.value;
			},
			async set(key: string, value: string, ttl?: number) {
				store.set(key, {
					value,
					expiresAt: Date.now() + (ttl ?? 3600) * 1000,
				});
			},
			async delete(key: string) {
				store.delete(key);
			},
		},
	};
}

describe("cleanupExpiredErc8128Storage", () => {
	it("deletes expired rows across all ERC-8128 tables", async () => {
		const { rows, adapter } = createMockCleanupAdapter();
		const now = new Date("2026-01-01T00:00:00.000Z");
		rows
			.get("erc8128Nonce")
			?.push(
				{ id: "n1", expiresAt: new Date("2025-12-31T23:59:00.000Z") },
				{ id: "n2", expiresAt: new Date("2026-01-01T00:01:00.000Z") },
			);
		rows.get("erc8128VerificationCache")?.push({
			id: "c1",
			expiresAt: new Date("2025-12-31T23:59:00.000Z"),
		});
		rows.get("erc8128Invalidation")?.push({
			id: "i1",
			expiresAt: new Date("2025-12-31T23:59:00.000Z"),
		});

		const result = await cleanupExpiredErc8128Storage({
			adapter,
			now,
		});

		expect(result).toEqual({
			nonceDeleted: 1,
			verificationCacheDeleted: 1,
			invalidationDeleted: 1,
			totalDeleted: 3,
		});
		expect(rows.get("erc8128Nonce")).toHaveLength(1);
		expect(rows.get("erc8128VerificationCache")).toHaveLength(0);
		expect(rows.get("erc8128Invalidation")).toHaveLength(0);
	});
});

describe("createErc8128CleanupScheduler", () => {
	it("throttles cleanup runs", async () => {
		vi.useFakeTimers();
		try {
			const { deleteMany, adapter } = createMockCleanupAdapter();
			const { storage } = createMockSecondaryStorage();
			const scheduler = createErc8128CleanupScheduler({
				adapter,
				secondaryStorage: storage,
				strategy: "auto",
				throttleSec: 5 * 60,
			});

			await scheduler.schedule();
			await scheduler.schedule();

			expect(deleteMany).toHaveBeenCalledTimes(3);

			vi.advanceTimersByTime(5 * 60 * 1000);
			await scheduler.schedule();

			expect(deleteMany).toHaveBeenCalledTimes(6);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does nothing when strategy is off", async () => {
		const { deleteMany, adapter } = createMockCleanupAdapter();
		const { storage } = createMockSecondaryStorage();
		const scheduler = createErc8128CleanupScheduler({
			adapter,
			secondaryStorage: storage,
			strategy: "off",
		});

		await scheduler.schedule();

		expect(deleteMany).not.toHaveBeenCalled();
	});

	it("does nothing without secondaryStorage", async () => {
		const { deleteMany, adapter } = createMockCleanupAdapter();
		const scheduler = createErc8128CleanupScheduler({
			adapter,
			strategy: "auto",
		});

		await scheduler.schedule();

		expect(deleteMany).not.toHaveBeenCalled();
	});
});
