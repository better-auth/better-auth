import { describe, expect, it, vi } from "vitest";
import type { InvalidationAdapter } from "./invalidation-store";
import {
	createDBInvalidationOps,
	createDualInvalidationOps,
	createSecondaryStorageInvalidationOps,
} from "./invalidation-store";
import { getErc8128SignatureHash } from "./utils";
import { getVerificationCacheStorageKey } from "./verification-cache";

const KEY_ID_ABC = "erc8128:1:0x0000000000000000000000000000000000000abc";
const KEY_ID_DB_ONLY =
	"erc8128:1:0x0000000000000000000000000000000000000db0";

function createMockAdapter() {
	const rows: Array<Record<string, unknown>> = [];
	let nextId = 1;

	const adapter: InvalidationAdapter = {
		async findMany(args) {
			if (!args.where) return [...rows];
			return rows.filter((row) =>
				args.where!.every((where) => {
					if (where.operator === "in" && Array.isArray(where.value)) {
						return where.value.some(
							(value) => String(row[where.field] ?? "") === String(value ?? ""),
						);
					}
					if (where.field === "expiresAt" && where.operator === "lt") {
						return (
							row.expiresAt instanceof Date &&
							row.expiresAt < (where.value as Date)
						);
					}
					return String(row[where.field] ?? "") === String(where.value ?? "");
				}),
			);
		},
		async findOne(args) {
			return (
				rows.find((row) =>
					args.where.every(
						(where) =>
							String(row[where.field] ?? "") === String(where.value ?? ""),
					),
				) ?? null
			);
		},
		async create(args) {
			const row = { id: String(nextId++), ...args.data };
			rows.push(row);
			return row;
		},
		async update(args) {
			const row = rows.find((entry) =>
				args.where.every(
					(where) =>
						String(entry[where.field] ?? "") === String(where.value ?? ""),
				),
			);
			if (row) Object.assign(row, args.update);
			return row ?? null;
		},
		async deleteMany(args) {
			let deleted = 0;
			for (const row of [...rows]) {
				if (
					args.where.every((where) => {
						if (where.field === "expiresAt" && where.operator === "lt") {
							return (
								row.expiresAt instanceof Date &&
								row.expiresAt < (where.value as Date)
							);
						}
						return String(row[where.field] ?? "") === String(where.value ?? "");
					})
				) {
					rows.splice(rows.indexOf(row), 1);
					deleted++;
				}
			}
			return deleted;
		},
	};

	return { rows, adapter };
}

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

describe("DB invalidation ops", () => {
	it("upserts and finds per-keyId notBefore", async () => {
		const { adapter } = createMockAdapter();
		const ops = createDBInvalidationOps(adapter);
		const nowSec = Math.floor(Date.now() / 1000);

		await ops.upsertKeyIdNotBefore(KEY_ID_ABC, nowSec);
		const records = await ops.findByKeyId(KEY_ID_ABC);
		expect(records).toHaveLength(1);
		expect(records[0]!.notBefore).toBe(nowSec);
		expect(records[0]!.keyId).toBe(KEY_ID_ABC);
	});

	it("updates existing per-keyId notBefore on second upsert", async () => {
		const { adapter } = createMockAdapter();
		const ops = createDBInvalidationOps(adapter);
		const nowSec = Math.floor(Date.now() / 1000);

		await ops.upsertKeyIdNotBefore(KEY_ID_ABC, nowSec);
		await ops.upsertKeyIdNotBefore(KEY_ID_ABC, nowSec + 1000);
		const records = await ops.findByKeyId(KEY_ID_ABC);
		expect(records).toHaveLength(1);
		expect(records[0]!.notBefore).toBe(nowSec + 1000);
	});

	it("ignores expired per-keyId invalidations", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date(1000 * 1000));
			const { adapter } = createMockAdapter();
			const ops = createDBInvalidationOps(adapter);

			await ops.upsertKeyIdNotBefore(KEY_ID_ABC, 1000, 1);
			expect(await ops.findByKeyId(KEY_ID_ABC)).toHaveLength(1);

			vi.setSystemTime(new Date((1000 + 2) * 1000));
			expect(await ops.findByKeyId(KEY_ID_ABC)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("upserts and finds per-signature invalidation", async () => {
		const { adapter } = createMockAdapter();
		const ops = createDBInvalidationOps(adapter);

		await ops.upsertSignatureInvalidation(KEY_ID_ABC, "0xsig1", 300);
		const record = await ops.findBySignature("0xsig1", KEY_ID_ABC);
		expect(record).not.toBeNull();
		expect(record?.notBefore).toBe(0);
		expect(record?.signatureHash).toBe(getErc8128SignatureHash("0xsig1"));
	});

	it("returns null for non-existent signature", async () => {
		const { adapter } = createMockAdapter();
		const ops = createDBInvalidationOps(adapter);
		expect(await ops.findBySignature("0xmissing", KEY_ID_ABC)).toBeNull();
	});

	it("loads replayable verification state in one DB query", async () => {
		const { adapter } = createMockAdapter();
		const ops = createDBInvalidationOps(adapter);
		const findManySpy = vi.spyOn(adapter, "findMany");
		const nowSec = Math.floor(Date.now() / 1000);

		await ops.upsertKeyIdNotBefore(KEY_ID_ABC, nowSec);
		await ops.upsertSignatureInvalidation(KEY_ID_ABC, "0xsig1", 300);

		await expect(
			ops.findVerificationState(KEY_ID_ABC, "0xsig1"),
		).resolves.toEqual({
			cacheHit: false,
			keyNotBefore: nowSec,
			signatureInvalidated: true,
		});
		expect(findManySpy).toHaveBeenCalledWith({
			model: "erc8128Invalidation",
			where: [
				{
					field: "matchKey",
					operator: "in",
					value: [
						KEY_ID_ABC,
						`${KEY_ID_ABC}:${getErc8128SignatureHash("0xsig1")}`,
					],
				},
			],
		});
	});

	it("ignores expired signature invalidations", async () => {
		vi.useFakeTimers();
		try {
			const { adapter } = createMockAdapter();
			const ops = createDBInvalidationOps(adapter);

			await ops.upsertSignatureInvalidation(KEY_ID_ABC, "0xsig1", 1);
			expect(await ops.findBySignature("0xsig1", KEY_ID_ABC)).not.toBeNull();
			vi.advanceTimersByTime(1100);
			expect(await ops.findBySignature("0xsig1", KEY_ID_ABC)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("secondaryStorage invalidation ops", () => {
	it("stores and retrieves per-keyId notBefore", async () => {
		const { storage } = createMockStorage();
		const ops = createSecondaryStorageInvalidationOps(storage, 3600);

		await ops.upsertKeyIdNotBefore(KEY_ID_ABC, 1500);
		const records = await ops.findByKeyId(KEY_ID_ABC);
		expect(records).toHaveLength(1);
		expect(records[0]!.notBefore).toBe(1500);
	});

	it("stores and retrieves per-signature invalidation", async () => {
		const { storage } = createMockStorage();
		const ops = createSecondaryStorageInvalidationOps(storage, 3600);

		await ops.upsertSignatureInvalidation(KEY_ID_ABC, "0xsig1", 300);
		const record = await ops.findBySignature("0xsig1", KEY_ID_ABC);
		expect(record).not.toBeNull();
		expect(record?.signatureHash).toBe(getErc8128SignatureHash("0xsig1"));
	});

	it("returns empty array for missing keyId", async () => {
		const { storage } = createMockStorage();
		const ops = createSecondaryStorageInvalidationOps(storage, 3600);
		expect(await ops.findByKeyId("missing")).toEqual([]);
	});

	it("returns null for missing signature", async () => {
		const { storage } = createMockStorage();
		const ops = createSecondaryStorageInvalidationOps(storage, 3600);
		expect(await ops.findBySignature("0xmissing", KEY_ID_ABC)).toBeNull();
	});

	it("uses batched secondaryStorage reads for replayable verification state when available", async () => {
		const store = new Map<string, { value: string; expiresAt: number }>();
		const getMany = vi.fn(async (keys: string[]) =>
			keys.map((key) => {
				const entry = store.get(key);
				if (!entry || entry.expiresAt <= Date.now()) {
					store.delete(key);
					return null;
				}
				return entry.value;
			}),
		);
		const get = vi.fn(async (key: string) => {
			const entry = store.get(key);
			if (!entry || entry.expiresAt <= Date.now()) {
				store.delete(key);
				return null;
			}
			return entry.value;
		});
		const storage = {
			get,
			getMany,
			async set(key: string, value: string, ttl?: number) {
				store.set(key, {
					value,
					expiresAt: Date.now() + (ttl ?? 3600) * 1000,
				});
			},
			async delete(key: string) {
				store.delete(key);
			},
		};
		const ops = createSecondaryStorageInvalidationOps(storage, 3600);
		store.set(getVerificationCacheStorageKey("cache-key"), {
			value: JSON.stringify({
				verified: true,
				expires: Math.floor(Date.now() / 1000) + 300,
			}),
			expiresAt: Date.now() + 300_000,
		});

		await ops.upsertKeyIdNotBefore(KEY_ID_ABC, 1500);
		await ops.upsertSignatureInvalidation(KEY_ID_ABC, "0xsig1", 300);

		await expect(
			ops.findVerificationState(KEY_ID_ABC, "0xsig1", "cache-key"),
		).resolves.toEqual({
			cacheHit: true,
			keyNotBefore: 1500,
			signatureInvalidated: true,
		});
		expect(getMany).toHaveBeenCalledWith([
			getVerificationCacheStorageKey("cache-key"),
			`erc8128:inv:key:${KEY_ID_ABC}`,
			`erc8128:inv:sig:${KEY_ID_ABC}:${getErc8128SignatureHash("0xsig1")}`,
		]);
		expect(get).not.toHaveBeenCalled();
	});

	it("swallows errors gracefully", async () => {
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
		const ops = createSecondaryStorageInvalidationOps(storage, 3600);

		await ops.upsertKeyIdNotBefore("key", 1000);
		await ops.upsertSignatureInvalidation(KEY_ID_ABC, "0xsig", 300);
		expect(await ops.findByKeyId("key")).toEqual([]);
		expect(await ops.findBySignature("0xsig", KEY_ID_ABC)).toBeNull();
	});

	it("respects TTL expiry", async () => {
		vi.useFakeTimers();
		try {
			const { storage } = createMockStorage();
			const ops = createSecondaryStorageInvalidationOps(storage, 1);

			await ops.upsertKeyIdNotBefore(KEY_ID_ABC, 1000, 1);
			expect(await ops.findByKeyId(KEY_ID_ABC)).toHaveLength(1);

			vi.advanceTimersByTime(1100);
			expect(await ops.findByKeyId(KEY_ID_ABC)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("dual invalidation ops", () => {
	it("writes to both DB and secondaryStorage", async () => {
		const { adapter } = createMockAdapter();
		const { storage } = createMockStorage();
		const nowSec = Math.floor(Date.now() / 1000);

		const dbOps = createDBInvalidationOps(adapter);
		const ssOps = createSecondaryStorageInvalidationOps(storage, 3600);
		const dualOps = createDualInvalidationOps(dbOps, ssOps);

		await dualOps.upsertKeyIdNotBefore(KEY_ID_ABC, nowSec);
		expect(await dbOps.findByKeyId(KEY_ID_ABC)).toHaveLength(1);
		expect(await ssOps.findByKeyId(KEY_ID_ABC)).toHaveLength(1);
	});

	it("reads from secondaryStorage first, falls back to DB", async () => {
		const { adapter } = createMockAdapter();
		const { storage } = createMockStorage();
		const nowSec = Math.floor(Date.now() / 1000);

		const dbOps = createDBInvalidationOps(adapter);
		const ssOps = createSecondaryStorageInvalidationOps(storage, 3600);
		const dualOps = createDualInvalidationOps(dbOps, ssOps);

		await dbOps.upsertKeyIdNotBefore(KEY_ID_DB_ONLY, nowSec);
		const records = await dualOps.findByKeyId(KEY_ID_DB_ONLY);
		expect(records).toHaveLength(1);
		expect(records[0]!.notBefore).toBe(nowSec);
	});

	it("prefers secondaryStorage over DB on read", async () => {
		const { adapter } = createMockAdapter();
		const { storage } = createMockStorage();

		const dbOps = createDBInvalidationOps(adapter);
		const ssOps = createSecondaryStorageInvalidationOps(storage, 3600);
		const dualOps = createDualInvalidationOps(dbOps, ssOps);

		await dbOps.upsertKeyIdNotBefore(KEY_ID_ABC, 100);
		await ssOps.upsertKeyIdNotBefore(KEY_ID_ABC, 200);

		const records = await dualOps.findByKeyId(KEY_ID_ABC);
		expect(records[0]!.notBefore).toBe(200);
	});

	it("uses one fused DB fallback lookup for replayable verification state", async () => {
		const { adapter } = createMockAdapter();
		const { storage } = createMockStorage();
		const nowSec = Math.floor(Date.now() / 1000);

		const dbOps = createDBInvalidationOps(adapter);
		const ssOps = createSecondaryStorageInvalidationOps(storage, 3600);
		const dualOps = createDualInvalidationOps(dbOps, ssOps);
		const dbFindVerificationState = vi.spyOn(dbOps, "findVerificationState");
		const dbFindByKeyId = vi.spyOn(dbOps, "findByKeyId");
		const dbFindBySignature = vi.spyOn(dbOps, "findBySignature");

		await dbOps.upsertKeyIdNotBefore(KEY_ID_ABC, nowSec);
		await dbOps.upsertSignatureInvalidation(KEY_ID_ABC, "0xsig1", 300);

		await expect(
			dualOps.findVerificationState(KEY_ID_ABC, "0xsig1"),
		).resolves.toEqual({
			cacheHit: false,
			keyNotBefore: nowSec,
			signatureInvalidated: true,
		});

		expect(dbFindVerificationState).toHaveBeenCalledTimes(1);
		expect(dbFindByKeyId).not.toHaveBeenCalled();
		expect(dbFindBySignature).not.toHaveBeenCalled();
	});
});
