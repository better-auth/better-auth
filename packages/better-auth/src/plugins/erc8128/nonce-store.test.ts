import { describe, expect, it, vi } from "vitest";
import type { Where } from "@better-auth/core/db/adapter";
import {
	createAdapterNonceStore,
	createDualNonceStore,
	createMemoryNonceStore,
	createSecondaryStorageNonceStore,
} from "./nonce-store";

type NonceAdapterMock = Parameters<typeof createAdapterNonceStore>[0];

function createDuplicateKeyError(
	message = "duplicate key value violates unique constraint",
) {
	const error = new Error(message) as Error & { code?: string };
	error.code = "23505";
	return error;
}

function createMockAdapterStore() {
	const table = new Map<
		string,
		{ id: string; nonceKey: string; expiresAt: Date }
	>();
	let nextId = 1;

	const adapter: NonceAdapterMock = {
		async findOne(args: { model: string; where: Where[] }) {
			return table.get(String(args.where[0]?.value)) ?? null;
		},
		async create(args: { model: string; data: Record<string, unknown> }) {
			const nonceKey = String(args.data.nonceKey);
			if (table.has(nonceKey)) {
				throw createDuplicateKeyError();
			}
			const row = {
				id: String(nextId++),
				nonceKey,
				expiresAt: args.data.expiresAt as Date,
			};
			table.set(row.nonceKey, row);
			return row;
		},
		async deleteMany(args: { model: string; where: Where[] }) {
			const value = String(args.where[0]?.value);
			const row =
				Array.from(table.values()).find((entry) => entry.id === value) ??
				table.get(value);
			if (row) {
				table.delete(row.nonceKey);
				return 1;
			}
			return 0;
		},
	};

	return { table, adapter };
}

describe("erc8128 nonce store", () => {
	it("consumes nonce only once", async () => {
		const { adapter } = createMockAdapterStore();
		const store = createAdapterNonceStore(adapter);

		const first = await store.consume("nonce-key", 60);
		const second = await store.consume("nonce-key", 60);

		expect(first).toBe(true);
		expect(second).toBe(false);
	});

	it("fails closed and logs when adapter create throws", async () => {
		const logger = {
			error: vi.fn(),
		};
		const adapter = {
			async create() {
				throw new Error("DB down");
			},
			async findOne() {
				throw new Error("findOne should not be called");
			},
			async deleteMany() {
				throw new Error("deleteMany should not be called");
			},
		};

		const store = createAdapterNonceStore(adapter, logger);
		const result = await store.consume("fallback-key", 60);

		expect(result).toBe(false);
		expect(logger.error).toHaveBeenCalledWith(
			"ERC8128 nonce database consume failed",
			expect.any(Error),
		);
	});

	it("allows nonce reuse after ttl expiry", async () => {
		vi.useFakeTimers();
		try {
			const { adapter } = createMockAdapterStore();
			const store = createAdapterNonceStore(adapter);

			expect(await store.consume("nonce-with-ttl", 1)).toBe(true);
			expect(await store.consume("nonce-with-ttl", 1)).toBe(false);

			vi.advanceTimersByTime(1100);
			expect(await store.consume("nonce-with-ttl", 1)).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("consumes a nonce at most once under concurrent requests", async () => {
		const { table } = createMockAdapterStore();
		let nextId = 1;
		const adapter: NonceAdapterMock = {
			async findOne(args: { model: string; where: Where[] }) {
				return table.get(String(args.where[0]?.value)) ?? null;
			},
			async create(args: { model: string; data: Record<string, unknown> }) {
				await Promise.resolve();
				const nonceKey = String(args.data.nonceKey);
				if (table.has(nonceKey)) {
					throw createDuplicateKeyError();
				}
				const row = {
					id: String(nextId++),
					nonceKey,
					expiresAt: args.data.expiresAt as Date,
				};
				table.set(nonceKey, row);
				return row;
			},
			async deleteMany(args: { model: string; where: Where[] }) {
				return table.delete(String(args.where[0]?.value)) ? 1 : 0;
			},
		};
		const store = createAdapterNonceStore(adapter);

		const [first, second] = await Promise.all([
			store.consume("race-nonce", 60),
			store.consume("race-nonce", 60),
		]);

		expect([first, second].sort()).toEqual([false, true]);
		expect(table.size).toBe(1);
	});
});

describe("secondaryStorage nonce store", () => {
	function createMockStorage() {
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

	it("consumes nonce only once", async () => {
		const { storage } = createMockStorage();
		const nonceStore = createSecondaryStorageNonceStore(storage);

		expect(await nonceStore.consume("ss-nonce-1", 60)).toBe(true);
		expect(await nonceStore.consume("ss-nonce-1", 60)).toBe(false);
	});

	it("allows reuse after TTL expiry", async () => {
		vi.useFakeTimers();
		try {
			const { storage } = createMockStorage();
			const nonceStore = createSecondaryStorageNonceStore(storage);

			expect(await nonceStore.consume("ss-ttl-nonce", 1)).toBe(true);
			expect(await nonceStore.consume("ss-ttl-nonce", 1)).toBe(false);

			vi.advanceTimersByTime(1100);
			expect(await nonceStore.consume("ss-ttl-nonce", 1)).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("returns false when storage throws", async () => {
		const logger = {
			error: vi.fn(),
		};
		const storage = {
			async get() {
				throw new Error("Redis down");
			},
			async set() {
				throw new Error("Redis down");
			},
			async delete() {
				throw new Error("Redis down");
			},
		};

		const nonceStore = createSecondaryStorageNonceStore(storage, logger);
		expect(await nonceStore.consume("err-nonce", 60)).toBe(false);
		expect(logger.error).toHaveBeenCalledWith(
			"ERC8128 nonce secondary storage consume failed",
			expect.any(Error),
		);
	});

	it("uses atomic setIfNotExists when storage provides it", async () => {
		const setIfNotExists = vi.fn();
		setIfNotExists.mockResolvedValueOnce(true);
		setIfNotExists.mockResolvedValueOnce(false);
		const storage = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			setIfNotExists,
		};

		const nonceStore = createSecondaryStorageNonceStore(storage);

		expect(await nonceStore.consume("atomic-nonce", 60)).toBe(true);
		expect(await nonceStore.consume("atomic-nonce", 60)).toBe(false);
		expect(setIfNotExists).toHaveBeenCalledTimes(2);
		expect(storage.get).not.toHaveBeenCalled();
		expect(storage.set).not.toHaveBeenCalled();
	});
});

describe("memory nonce store", () => {
	it("consumes nonce only once", async () => {
		const store = createMemoryNonceStore();
		expect(await store.consume("mem-nonce", 60)).toBe(true);
		expect(await store.consume("mem-nonce", 60)).toBe(false);
	});

	it("allows nonce reuse after ttl expiry", async () => {
		vi.useFakeTimers();
		try {
			const store = createMemoryNonceStore();
			expect(await store.consume("mem-ttl", 1)).toBe(true);
			expect(await store.consume("mem-ttl", 1)).toBe(false);
			vi.advanceTimersByTime(1100);
			expect(await store.consume("mem-ttl", 1)).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("dual nonce store", () => {
	function createMockStorage() {
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

	it("consumes in both stores", async () => {
		const { adapter } = createMockAdapterStore();
		const { storage, store } = createMockStorage();

		const dbStore = createAdapterNonceStore(adapter);
		const ssStore = createSecondaryStorageNonceStore(storage);
		const dual = createDualNonceStore(dbStore, ssStore);

		expect(await dual.consume("dual-nonce", 60)).toBe(true);
		expect(store.size).toBeGreaterThan(0);
		expect(await dual.consume("dual-nonce", 60)).toBe(false);
	});

	it("rejects if already consumed in secondaryStorage", async () => {
		const { adapter } = createMockAdapterStore();
		const { storage } = createMockStorage();

		const ssStore = createSecondaryStorageNonceStore(storage);
		const dual = createDualNonceStore(
			createAdapterNonceStore(adapter),
			ssStore,
		);

		await ssStore.consume("pre-consumed", 60);
		expect(await dual.consume("pre-consumed", 60)).toBe(false);
	});
});
