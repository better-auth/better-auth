import type { SecondaryStorage } from "@better-auth/core/db";
import type { Where } from "@better-auth/core/db/adapter";
import {
	getErc8128InvalidationMatchKey,
	getErc8128SignatureHash,
	getErc8128SignatureInvalidationMatchKey,
	parseErc8128KeyId,
} from "./utils";
import {
	getVerificationCacheStorageKey,
	parseVerificationCacheValue,
} from "./verification-cache";

/** Minimum TTL floor for invalidation records (30 days). */
export const DEFAULT_INVALIDATION_TTL_SEC = 30 * 24 * 60 * 60;
const INVALIDATION_MODEL = "erc8128Invalidation";
const INVALIDATION_KIND_KEY = "key";
const INVALIDATION_KIND_SIGNATURE = "signature";
const INV_KEY_PREFIX = "erc8128:inv:key:";
const INV_SIG_PREFIX = "erc8128:inv:sig:";

export interface InvalidationRecord {
	keyId?: string;
	signatureHash?: string;
	notBefore: number;
}

export interface ReplayableInvalidationState {
	keyNotBefore: number | null;
	signatureInvalidated: boolean;
	cacheHit: boolean;
}

/**
 * Abstraction over invalidation storage. Implementations back either the
 * database (`erc8128Invalidation` table) or `secondaryStorage` (Redis).
 */
export interface InvalidationOps {
	findByKeyId(keyId: string): Promise<InvalidationRecord[]>;
	findBySignature(
		signature: string,
		keyId?: string | null,
	): Promise<InvalidationRecord | null>;
	findVerificationState(
		keyId: string,
		signature: string,
		cacheKey?: string,
	): Promise<ReplayableInvalidationState>;
	upsertKeyIdNotBefore(
		keyId: string,
		notBefore: number,
		ttlSec?: number,
	): Promise<void>;
	upsertSignatureInvalidation(
		keyId: string,
		signature: string,
		ttlSec: number,
	): Promise<void>;
}

/** Minimal adapter surface used by the invalidation store. */
export interface InvalidationAdapter {
	findMany(args: {
		model: string;
		where?: Where[];
	}): Promise<Record<string, unknown>[]>;
	findOne(args: {
		model: string;
		where: Where[];
	}): Promise<Record<string, unknown> | null>;
	create(args: {
		model: string;
		data: Record<string, unknown>;
	}): Promise<Record<string, unknown>>;
	update(args: {
		model: string;
		where: Where[];
		update: Record<string, unknown>;
	}): Promise<unknown>;
	deleteMany(args: { model: string; where: Where[] }): Promise<number>;
}

type InvalidationRow = Record<string, unknown>;
type BatchReadableSecondaryStorage = SecondaryStorage & {
	getMany?: (
		keys: string[],
	) => Promise<unknown[] | null | undefined> | unknown[];
	mget?: (keys: string[]) => Promise<unknown[] | null | undefined> | unknown[];
	getMultiple?: (
		keys: string[],
	) => Promise<unknown[] | null | undefined> | unknown[];
};

function toInvalidationRecord(row: InvalidationRow): InvalidationRecord | null {
	if (typeof row.address !== "string" || typeof row.chainId !== "number") {
		return null;
	}
	return {
		keyId: `erc8128:${row.chainId}:${row.address.toLowerCase()}`,
		signatureHash:
			typeof row.signatureHash === "string" ? row.signatureHash : undefined,
		notBefore: typeof row.notBefore === "number" ? row.notBefore : 0,
	};
}

function isExpired(record: InvalidationRow) {
	if (!record.expiresAt) {
		return false;
	}
	const expiresAtMs =
		record.expiresAt instanceof Date
			? record.expiresAt.getTime()
			: new Date(record.expiresAt as string | number | Date).getTime();
	return expiresAtMs <= Date.now();
}

function getKeyInvalidationWhere(matchKey: string): Where[] {
	return [
		{ field: "kind", operator: "eq", value: INVALIDATION_KIND_KEY },
		{ field: "matchKey", operator: "eq", value: matchKey },
	];
}

function getSignatureInvalidationWhere(args: {
	signatureHash: string;
	matchKey?: string | null;
}): Where[] {
	if (args.matchKey) {
		return [
			{ field: "kind", operator: "eq", value: INVALIDATION_KIND_SIGNATURE },
			{ field: "matchKey", operator: "eq", value: args.matchKey },
		];
	}
	return [
		{ field: "kind", operator: "eq", value: INVALIDATION_KIND_SIGNATURE },
		{ field: "signatureHash", operator: "eq", value: args.signatureHash },
	];
}

function getKeyTarget(keyId: string) {
	const parsed = parseErc8128KeyId(keyId);
	const matchKey = getErc8128InvalidationMatchKey(keyId);
	if (!parsed || !matchKey) {
		return null;
	}
	return {
		parsed,
		matchKey,
		address: parsed.address.toLowerCase(),
		chainId: parsed.chainId,
	};
}

function getSignatureTarget(keyId: string, signature: string) {
	const keyTarget = getKeyTarget(keyId);
	if (!keyTarget) {
		return null;
	}
	const signatureHash = getErc8128SignatureHash(signature);
	const signatureMatchKey = getErc8128SignatureInvalidationMatchKey(
		keyId,
		signatureHash,
	);
	if (!signatureMatchKey) {
		return null;
	}
	return {
		...keyTarget,
		signatureHash,
		signatureMatchKey,
	};
}

function createKeyInvalidationRecordData(
	target: NonNullable<ReturnType<typeof getKeyTarget>>,
	notBefore: number,
	expiresAt: Date,
) {
	return {
		kind: INVALIDATION_KIND_KEY,
		matchKey: target.matchKey,
		address: target.address,
		chainId: target.chainId,
		notBefore,
		expiresAt,
	};
}

function createSignatureInvalidationRecordData(
	target: NonNullable<ReturnType<typeof getSignatureTarget>>,
	expiresAt: Date,
) {
	return {
		kind: INVALIDATION_KIND_SIGNATURE,
		matchKey: target.signatureMatchKey,
		address: target.address,
		chainId: target.chainId,
		signatureHash: target.signatureHash,
		expiresAt,
	};
}

function createStoredKeyInvalidationRecord(
	matchKey: string,
	notBefore: number,
): InvalidationRecord {
	return {
		keyId: matchKey,
		notBefore,
	};
}

function createStoredSignatureInvalidationRecord(
	keyId: string,
	signatureHash: string,
): InvalidationRecord {
	return {
		keyId: getErc8128InvalidationMatchKey(keyId) ?? undefined,
		signatureHash,
		notBefore: 0,
	};
}

function createReplayableInvalidationState(args: {
	keyMatchKey: string;
	signatureMatchKey: string;
	rows: InvalidationRow[];
}): ReplayableInvalidationState {
	let keyNotBefore: number | null = null;
	let signatureInvalidated = false;

	for (const row of args.rows) {
		if (isExpired(row)) {
			continue;
		}
		const matchKey = String(row.matchKey ?? "");
		if (matchKey === args.keyMatchKey) {
			keyNotBefore =
				typeof row.notBefore === "number" ? row.notBefore : keyNotBefore;
			continue;
		}
		if (matchKey === args.signatureMatchKey) {
			signatureInvalidated = true;
		}
	}

	return {
		cacheHit: false,
		keyNotBefore,
		signatureInvalidated,
	};
}

async function readSecondaryStorageValues(
	storage: SecondaryStorage,
	keys: string[],
): Promise<(unknown | null)[]> {
	const batchStorage = storage as BatchReadableSecondaryStorage;
	const readers = [
		batchStorage.getMany,
		batchStorage.mget,
		batchStorage.getMultiple,
	].filter((reader): reader is NonNullable<typeof reader> => {
		return typeof reader === "function";
	});

	for (const readMany of readers) {
		try {
			const values = await readMany.call(batchStorage, keys);
			if (Array.isArray(values)) {
				return keys.map((_, index) => values[index] ?? null);
			}
		} catch {}
	}

	return Promise.all(
		keys.map(async (key) => {
			try {
				return (await storage.get(key)) ?? null;
			} catch {
				return null;
			}
		}),
	);
}

async function findSingleInvalidationRow(
	adapter: InvalidationAdapter,
	where: Where[],
): Promise<InvalidationRow | null> {
	return adapter.findOne({
		model: INVALIDATION_MODEL,
		where,
	});
}

async function findSignatureRows(args: {
	adapter: InvalidationAdapter;
	where: Where[];
	exactMatchKey?: string | null;
}): Promise<InvalidationRow[]> {
	if (args.exactMatchKey) {
		const row = await findSingleInvalidationRow(args.adapter, args.where);
		return row ? [row] : [];
	}
	return args.adapter.findMany({
		model: INVALIDATION_MODEL,
		where: args.where,
	});
}

async function upsertInvalidationRow(args: {
	adapter: InvalidationAdapter;
	where: Where[];
	create: Record<string, unknown>;
	update: Record<string, unknown>;
}) {
	const existing = await findSingleInvalidationRow(args.adapter, args.where);
	if (existing) {
		await args.adapter.update({
			model: INVALIDATION_MODEL,
			where: [{ field: "id", operator: "eq", value: String(existing.id) }],
			update: args.update,
		});
		return;
	}
	await args.adapter.create({
		model: INVALIDATION_MODEL,
		data: args.create,
	});
}

export function createDBInvalidationOps(
	adapter: InvalidationAdapter,
): InvalidationOps {
	return {
		async findByKeyId(keyId: string): Promise<InvalidationRecord[]> {
			const matchKey = getErc8128InvalidationMatchKey(keyId);
			if (!matchKey) {
				return [];
			}
			const row = await findSingleInvalidationRow(
				adapter,
				getKeyInvalidationWhere(matchKey),
			);
			const record = row && !isExpired(row) ? toInvalidationRecord(row) : null;
			return record ? [record] : [];
		},

		async findBySignature(
			signature: string,
			keyId?: string | null,
		): Promise<InvalidationRecord | null> {
			const signatureHash = getErc8128SignatureHash(signature);
			const signatureMatchKey =
				keyId && getErc8128SignatureInvalidationMatchKey(keyId, signatureHash);
			const where = getSignatureInvalidationWhere({
				signatureHash,
				matchKey: signatureMatchKey,
			});
			const rows = await findSignatureRows({
				adapter,
				where,
				exactMatchKey: signatureMatchKey,
			});
			const validRows = rows.filter((row) => !isExpired(row));
			if (!validRows.length) {
				return null;
			}
			return toInvalidationRecord(validRows[0]!);
		},

		async findVerificationState(
			keyId: string,
			signature: string,
			cacheKey?: string,
		): Promise<ReplayableInvalidationState> {
			const target = getSignatureTarget(keyId, signature);
			if (!target) {
				return {
					keyNotBefore: null,
					signatureInvalidated: false,
					cacheHit: false,
				};
			}
			const rows = await adapter.findMany({
				model: INVALIDATION_MODEL,
				where: [
					{
						field: "matchKey",
						operator: "in",
						value: [target.matchKey, target.signatureMatchKey],
					},
				],
			});
			let cacheHit = false;
			if (cacheKey) {
				try {
					const cacheRow = await adapter.findOne({
						model: "erc8128VerificationCache",
						where: [{ field: "cacheKey", operator: "eq", value: cacheKey }],
					});
					if (cacheRow) {
						const expiresAt = new Date(
							cacheRow.expiresAt as string | number | Date,
						);
						cacheHit = expiresAt.getTime() > Date.now();
					}
				} catch {}
			}

			return {
				...createReplayableInvalidationState({
					keyMatchKey: target.matchKey,
					signatureMatchKey: target.signatureMatchKey,
					rows,
				}),
				cacheHit,
			};
		},

		async upsertKeyIdNotBefore(
			keyId: string,
			notBefore: number,
			ttlSec?: number,
		) {
			const target = getKeyTarget(keyId);
			if (!target) {
				return;
			}
			const expirationWindowSec = ttlSec ?? DEFAULT_INVALIDATION_TTL_SEC;
			const expiresAt = new Date((notBefore + expirationWindowSec) * 1000);
			await upsertInvalidationRow({
				adapter,
				where: getKeyInvalidationWhere(target.matchKey),
				create: createKeyInvalidationRecordData(target, notBefore, expiresAt),
				update: { notBefore, expiresAt },
			});
		},

		async upsertSignatureInvalidation(
			keyId: string,
			signature: string,
			ttlSec: number,
		) {
			const target = getSignatureTarget(keyId, signature);
			if (!target) {
				return;
			}
			const expiresAt = new Date(Date.now() + ttlSec * 1000);
			await upsertInvalidationRow({
				adapter,
				where: getSignatureInvalidationWhere({
					signatureHash: target.signatureHash,
					matchKey: target.signatureMatchKey,
				}),
				create: createSignatureInvalidationRecordData(target, expiresAt),
				update: { expiresAt },
			});
		},
	};
}

/**
 * Invalidation ops backed by `secondaryStorage` (e.g. Redis).
 *
 * Storage layout:
 * - `erc8128:inv:key:<matchKey>` -> JSON `{ keyId, notBefore }`
 * - `erc8128:inv:sig:<matchKey>:<signatureHash>` -> JSON `{ keyId, signatureHash, notBefore }`
 */
export function createSecondaryStorageInvalidationOps(
	storage: SecondaryStorage,
	defaultTtlSec: number = DEFAULT_INVALIDATION_TTL_SEC,
): InvalidationOps {
	return {
		async findByKeyId(keyId: string): Promise<InvalidationRecord[]> {
			const matchKey = getErc8128InvalidationMatchKey(keyId);
			if (!matchKey) {
				return [];
			}
			try {
				const raw = await storage.get(`${INV_KEY_PREFIX}${matchKey}`);
				if (!raw) return [];
				return [JSON.parse(raw as string) as InvalidationRecord];
			} catch {
				return [];
			}
		},

		async findBySignature(
			signature: string,
			keyId?: string | null,
		): Promise<InvalidationRecord | null> {
			const signatureHash = getErc8128SignatureHash(signature);
			const signatureMatchKey =
				keyId && getErc8128SignatureInvalidationMatchKey(keyId, signatureHash);
			if (!signatureMatchKey) {
				return null;
			}
			try {
				const raw = await storage.get(`${INV_SIG_PREFIX}${signatureMatchKey}`);
				if (!raw) return null;
				return JSON.parse(raw as string) as InvalidationRecord;
			} catch {
				return null;
			}
		},

		async findVerificationState(
			keyId: string,
			signature: string,
			cacheKey?: string,
		): Promise<ReplayableInvalidationState> {
			const target = getSignatureTarget(keyId, signature);
			if (!target) {
				return {
					keyNotBefore: null,
					signatureInvalidated: false,
					cacheHit: false,
				};
			}

			try {
				const lookupKeys = [
					`${INV_KEY_PREFIX}${target.matchKey}`,
					`${INV_SIG_PREFIX}${target.signatureMatchKey}`,
				];
				if (cacheKey) {
					lookupKeys.unshift(getVerificationCacheStorageKey(cacheKey));
				}
				const values = await readSecondaryStorageValues(storage, lookupKeys);
				const [cacheRaw, keyRaw, signatureRaw] = cacheKey
					? values
					: [null, values[0] ?? null, values[1] ?? null];

				return {
					cacheHit: parseVerificationCacheValue(cacheRaw) !== null,
					keyNotBefore:
						keyRaw && typeof keyRaw === "string"
							? ((JSON.parse(keyRaw) as InvalidationRecord).notBefore ?? null)
							: null,
					signatureInvalidated:
						signatureRaw != null && String(signatureRaw).length > 0,
				};
			} catch {
				return {
					keyNotBefore: null,
					signatureInvalidated: false,
					cacheHit: false,
				};
			}
		},

		async upsertKeyIdNotBefore(
			keyId: string,
			notBefore: number,
			ttlSec?: number,
		) {
			const matchKey = getErc8128InvalidationMatchKey(keyId);
			if (!matchKey) {
				return;
			}
			try {
				const expirationWindowSec = ttlSec ?? defaultTtlSec;
				const ttlUntilExpiry = Math.max(
					notBefore + expirationWindowSec - Math.floor(Date.now() / 1000),
					1,
				);
				await storage.set(
					`${INV_KEY_PREFIX}${matchKey}`,
					JSON.stringify(
						createStoredKeyInvalidationRecord(matchKey, notBefore),
					),
					ttlUntilExpiry,
				);
			} catch {}
		},

		async upsertSignatureInvalidation(
			keyId: string,
			signature: string,
			ttlSec: number,
		) {
			const target = getSignatureTarget(keyId, signature);
			if (!target) {
				return;
			}
			try {
				await storage.set(
					`${INV_SIG_PREFIX}${target.signatureMatchKey}`,
					JSON.stringify(
						createStoredSignatureInvalidationRecord(
							keyId,
							target.signatureHash,
						),
					),
					ttlSec,
				);
			} catch {}
		},
	};
}

export function createMemoryInvalidationOps(
	defaultTtlSec: number = DEFAULT_INVALIDATION_TTL_SEC,
): InvalidationOps {
	const keyIdStore = new Map<
		string,
		{ record: InvalidationRecord; expiresAt: number }
	>();
	const sigStore = new Map<
		string,
		{ record: InvalidationRecord; expiresAt: number }
	>();

	const sweep = () => {
		const nowSec = Math.floor(Date.now() / 1000);
		for (const [k, v] of keyIdStore) {
			if (v.expiresAt <= nowSec) keyIdStore.delete(k);
		}
		for (const [k, v] of sigStore) {
			if (v.expiresAt <= nowSec) sigStore.delete(k);
		}
	};

	return {
		async findByKeyId(keyId: string): Promise<InvalidationRecord[]> {
			sweep();
			const matchKey = getErc8128InvalidationMatchKey(keyId);
			if (!matchKey) {
				return [];
			}
			const row = keyIdStore.get(matchKey);
			return row ? [row.record] : [];
		},

		async findBySignature(
			signature: string,
			keyId?: string | null,
		): Promise<InvalidationRecord | null> {
			sweep();
			const signatureHash = getErc8128SignatureHash(signature);
			const matchKey =
				keyId && getErc8128SignatureInvalidationMatchKey(keyId, signatureHash);
			if (!matchKey) {
				return null;
			}
			return sigStore.get(matchKey)?.record ?? null;
		},

		async findVerificationState(
			keyId: string,
			signature: string,
			_cacheKey?: string,
		): Promise<ReplayableInvalidationState> {
			sweep();
			const keyMatchKey = getErc8128InvalidationMatchKey(keyId);
			const signatureTarget = getSignatureTarget(keyId, signature);

			return {
				cacheHit: false,
				keyNotBefore: keyMatchKey
					? (keyIdStore.get(keyMatchKey)?.record.notBefore ?? null)
					: null,
				signatureInvalidated: signatureTarget
					? sigStore.has(signatureTarget.signatureMatchKey)
					: false,
			};
		},

		async upsertKeyIdNotBefore(
			keyId: string,
			notBefore: number,
			ttlSec?: number,
		): Promise<void> {
			sweep();
			const matchKey = getErc8128InvalidationMatchKey(keyId);
			if (!matchKey) {
				return;
			}
			keyIdStore.set(matchKey, {
				record: createStoredKeyInvalidationRecord(matchKey, notBefore),
				expiresAt: notBefore + (ttlSec ?? defaultTtlSec),
			});
		},

		async upsertSignatureInvalidation(
			keyId: string,
			signature: string,
			ttlSec: number,
		): Promise<void> {
			sweep();
			const target = getSignatureTarget(keyId, signature);
			if (!target) {
				return;
			}
			sigStore.set(target.signatureMatchKey, {
				record: createStoredSignatureInvalidationRecord(
					keyId,
					target.signatureHash,
				),
				expiresAt: Math.floor(Date.now() / 1000) + ttlSec,
			});
		},
	};
}

export function createDualInvalidationOps(
	db: InvalidationOps,
	ss: InvalidationOps,
): InvalidationOps {
	return {
		async findByKeyId(keyId: string): Promise<InvalidationRecord[]> {
			const ssResult = await ss.findByKeyId(keyId);
			if (ssResult.length > 0) return ssResult;
			return db.findByKeyId(keyId);
		},

		async findBySignature(
			signature: string,
			keyId?: string | null,
		): Promise<InvalidationRecord | null> {
			const ssResult = await ss.findBySignature(signature, keyId);
			if (ssResult) return ssResult;
			return db.findBySignature(signature, keyId);
		},

		async findVerificationState(
			keyId: string,
			signature: string,
			cacheKey?: string,
		): Promise<ReplayableInvalidationState> {
			const ssState = await ss.findVerificationState(
				keyId,
				signature,
				cacheKey,
			);
			if (ssState.keyNotBefore !== null && ssState.signatureInvalidated) {
				return ssState;
			}

			const dbState = await db.findVerificationState(keyId, signature);

			return {
				cacheHit: ssState.cacheHit,
				keyNotBefore: ssState.keyNotBefore ?? dbState.keyNotBefore,
				signatureInvalidated:
					ssState.signatureInvalidated || dbState.signatureInvalidated,
			};
		},

		async upsertKeyIdNotBefore(
			keyId: string,
			notBefore: number,
			ttlSec?: number,
		) {
			await Promise.all([
				db.upsertKeyIdNotBefore(keyId, notBefore, ttlSec),
				ss.upsertKeyIdNotBefore(keyId, notBefore, ttlSec),
			]);
		},

		async upsertSignatureInvalidation(
			keyId: string,
			signature: string,
			ttlSec: number,
		) {
			await Promise.all([
				db.upsertSignatureInvalidation(keyId, signature, ttlSec),
				ss.upsertSignatureInvalidation(keyId, signature, ttlSec),
			]);
		},
	};
}
