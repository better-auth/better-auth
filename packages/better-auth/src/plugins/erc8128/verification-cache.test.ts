import { describe, expect, it } from "vitest";
import type {
	CacheValue,
	VerificationCacheAdapter,
} from "./verification-cache";
import { createVerificationCacheOps } from "./verification-cache";

const val = (overrides?: Partial<CacheValue>): CacheValue => ({
	verified: true,
	expires: Math.floor(Date.now() / 1000) + 300,
	...overrides,
});

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

function createMockAdapter() {
	const rows = new Map<
		string,
		{
			id: string;
			cacheKey: string;
			address: string;
			chainId: number;
			signatureHash: string;
			expiresAt: Date;
		}
	>();
	let nextId = 1;

	const adapter: VerificationCacheAdapter = {
		async findOne(args) {
			if (args.where.some((where) => where.field === "id")) {
				const id = String(
					args.where.find((where) => where.field === "id")?.value,
				);
				return Array.from(rows.values()).find((row) => row.id === id) ?? null;
			}
			const cacheKey = String(
				args.where.find((where) => where.field === "cacheKey")?.value,
			);
			return rows.get(cacheKey) ?? null;
		},
		async create(args) {
			const row = {
				id: String(nextId++),
				cacheKey: String(args.data.cacheKey),
				address: String(args.data.address),
				chainId: Number(args.data.chainId),
				signatureHash: String(args.data.signatureHash),
				expiresAt: args.data.expiresAt as Date,
			};
			rows.set(row.cacheKey, row);
			return row;
		},
		async update(args) {
			const id = String(
				args.where.find((where) => where.field === "id")?.value,
			);
			const row = Array.from(rows.values()).find((entry) => entry.id === id);
			if (row) {
				Object.assign(row, args.update);
			}
			return row ?? null;
		},
		async deleteMany(args) {
			const cacheKey = String(
				args.where.find((where) => where.field === "cacheKey")?.value,
			);
			return rows.delete(cacheKey) ? 1 : 0;
		},
	};

	return { rows, adapter };
}

describe("secondaryStorage cache ops", () => {
	it("stores and retrieves a value", async () => {
		const { storage } = createMockStorage();
		const ops = createVerificationCacheOps(
			"secondary-storage",
			storage,
			createMockAdapter().adapter,
		);

		const v = val();
		await ops.set({
			key: "sig1",
			value: v,
			ttlSec: 300,
			address: "0xabc",
			chainId: 1,
			signatureHash: "0xhash",
			expiresAt: new Date(v.expires * 1000),
		});
		expect(await ops.get("sig1")).toEqual(v);
	});

	it("returns null for missing key", async () => {
		const { storage } = createMockStorage();
		const ops = createVerificationCacheOps(
			"secondary-storage",
			storage,
			createMockAdapter().adapter,
		);

		expect(await ops.get("missing")).toBeNull();
	});

	it("deletes a value", async () => {
		const { storage } = createMockStorage();
		const ops = createVerificationCacheOps(
			"secondary-storage",
			storage,
			createMockAdapter().adapter,
		);

		await ops.set({
			key: "sig1",
			value: val(),
			ttlSec: 300,
			address: "0xabc",
			chainId: 1,
			signatureHash: "0xhash",
			expiresAt: new Date(Date.now() + 300_000),
		});
		await ops.delete("sig1");
		expect(await ops.get("sig1")).toBeNull();
	});

	it("sweep is a no-op for TTL-backed storage", () => {
		const { storage } = createMockStorage();
		const ops = createVerificationCacheOps(
			"secondary-storage",
			storage,
			createMockAdapter().adapter,
		);

		ops.sweep();
	});

	it("swallows errors gracefully", async () => {
		const brokenStorage = {
			async get() {
				throw new Error("fail");
			},
			async set() {
				throw new Error("fail");
			},
			async delete() {
				throw new Error("fail");
			},
		};
		const ops = createVerificationCacheOps(
			"secondary-storage",
			brokenStorage,
			createMockAdapter().adapter,
		);

		await ops.set({
			key: "sig1",
			value: val(),
			ttlSec: 300,
			address: "0xabc",
			chainId: 1,
			signatureHash: "0xhash",
			expiresAt: new Date(Date.now() + 300_000),
		});
		expect(await ops.get("sig1")).toBeNull();
		await ops.delete("sig1");
	});
});

describe("database cache ops", () => {
	it("stores and retrieves a value directly from DB", async () => {
		const { adapter, rows } = createMockAdapter();
		const ops = createVerificationCacheOps("database", undefined, adapter);

		const v = val();
		await ops.set({
			key: "sig1",
			value: v,
			ttlSec: 300,
			address: "0xabc",
			chainId: 1,
			signatureHash: "0xhash",
			expiresAt: new Date(v.expires * 1000),
		});

		expect(rows.has("sig1")).toBe(true);
		expect(await ops.get("sig1")).toEqual(v);
	});

	it("returns null for missing key", async () => {
		const ops = createVerificationCacheOps(
			"database",
			undefined,
			createMockAdapter().adapter,
		);

		expect(await ops.get("missing")).toBeNull();
	});

	it("returns null for expired DB rows", async () => {
		const { adapter, rows } = createMockAdapter();
		const ops = createVerificationCacheOps("database", undefined, adapter);

		rows.set("sig1", {
			id: "1",
			cacheKey: "sig1",
			address: "0xabc",
			chainId: 1,
			signatureHash: "0xhash",
			expiresAt: new Date(Date.now() - 1_000),
		});

		expect(await ops.get("sig1")).toBeNull();
	});

	it("returns null for DB rows with invalid expiresAt values", async () => {
		const { adapter, rows } = createMockAdapter();
		const ops = createVerificationCacheOps("database", undefined, adapter);

		rows.set("sig1", {
			id: "1",
			cacheKey: "sig1",
			address: "0xabc",
			chainId: 1,
			signatureHash: "0xhash",
			expiresAt: new Date("invalid"),
		});

		expect(await ops.get("sig1")).toBeNull();
	});

	it("deletes a DB value", async () => {
		const { adapter, rows } = createMockAdapter();
		const ops = createVerificationCacheOps("database", undefined, adapter);

		await ops.set({
			key: "sig1",
			value: val(),
			ttlSec: 300,
			address: "0xabc",
			chainId: 1,
			signatureHash: "0xhash",
			expiresAt: new Date(Date.now() + 300_000),
		});
		await ops.delete("sig1");

		expect(rows.has("sig1")).toBe(false);
	});

	it("sweep is a no-op for DB-backed cache ops", () => {
		const ops = createVerificationCacheOps(
			"database",
			undefined,
			createMockAdapter().adapter,
		);

		ops.sweep();
	});

	it("swallows DB errors gracefully", async () => {
		const brokenAdapter: VerificationCacheAdapter = {
			async findOne() {
				throw new Error("DB down");
			},
			async create() {
				throw new Error("DB down");
			},
			async update() {
				throw new Error("DB down");
			},
			async deleteMany() {
				throw new Error("DB down");
			},
		};
		const ops = createVerificationCacheOps(
			"database",
			undefined,
			brokenAdapter,
		);

		const v = val();
		await ops.set({
			key: "sig1",
			value: v,
			ttlSec: 300,
			address: "0xabc",
			chainId: 1,
			signatureHash: "0xhash",
			expiresAt: new Date(v.expires * 1000),
		});
		expect(await ops.get("sig1")).toBeNull();
		await ops.delete("sig1");
	});
});
