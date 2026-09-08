import { logger } from "@better-auth/core/env";
import type * as SecureStore from "expo-secure-store";

/**
 * Storage used by the Expo client for cookies and cached session data.
 * Async access is coordinated through the provided object, so reuse it across
 * clients that access the same stored data.
 */
export type ExpoClientStorage = Pick<
	typeof SecureStore,
	"setItem" | "setItemAsync" | "getItem" | "getItemAsync"
>;

/**
 * Expo secure store does not support colons in the keys.
 * This function replaces colons with underscores.
 *
 * @see https://github.com/better-auth/better-auth/issues/5426
 *
 * @param name cookie name to be saved in the storage
 * @returns normalized cookie name
 */
export function normalizeCookieName(name: string) {
	return name.replace(/:/g, "_");
}

/**
 * Character budget per stored chunk. Some native stores reject large values,
 * so larger strings are split across keys. This is not a byte-size guarantee.
 *
 * @see https://github.com/better-auth/better-auth/issues/9151
 */
const STORAGE_VALUE_LIMIT = 1800;
const MAX_STORAGE_CHUNKS = 100;

/**
 * Marks a base key whose value is split across multiple storage keys. Legacy
 * markers contain only the chunk count. Current markers also identify the
 * active slot and retain the previous slot's chunk count for recovery.
 *
 * @see https://github.com/better-auth/better-auth/issues/11082
 */
const CHUNK_MARKER = "\u0001ba-chunks:";

type ChunkSlot = 0 | 1;
const CHUNK_SLOTS = [null, 0, 1] as const;

interface ChunkMarker {
	count: number;
	slot: ChunkSlot | null;
	fallbackCount: number | null;
}

function parseChunkCount(value: string | undefined): number | null {
	if (value === undefined) {
		return null;
	}
	const count = Number(value);
	if (!Number.isInteger(count) || count < 1 || count > MAX_STORAGE_CHUNKS) {
		return null;
	}
	return count;
}

function parseChunkMarker(baseValue: string): ChunkMarker | null {
	const parts = baseValue.slice(CHUNK_MARKER.length).split(":");
	if (parts.length > 3) {
		return null;
	}
	const [countValue, slotValue, fallbackCountValue] = parts;
	const count = parseChunkCount(countValue);
	if (count === null) {
		return null;
	}
	if (slotValue === undefined) {
		return fallbackCountValue === undefined
			? { count, slot: null, fallbackCount: null }
			: null;
	}
	if (slotValue !== "0" && slotValue !== "1") {
		return null;
	}
	const fallbackCount = parseChunkCount(fallbackCountValue);
	if (fallbackCountValue !== undefined && fallbackCount === null) {
		return null;
	}
	return {
		count,
		slot: slotValue === "0" ? 0 : 1,
		fallbackCount,
	};
}

function getChunkKey(key: string, marker: ChunkMarker, index: number) {
	return marker.slot === null
		? `${key}.${index}`
		: `${key}.${marker.slot}.${index}`;
}

function getOtherSlot(slot: ChunkSlot): ChunkSlot {
	return slot === 0 ? 1 : 0;
}

function serializeChunkMarker(marker: ChunkMarker) {
	if (marker.slot === null) {
		return `${CHUNK_MARKER}${marker.count}`;
	}
	const fallback =
		marker.fallbackCount === null ? "" : `:${marker.fallbackCount}`;
	return `${CHUNK_MARKER}${marker.count}:${marker.slot}${fallback}`;
}

function readChunks(
	storage: Pick<ExpoClientStorage, "getItem">,
	key: string,
	marker: ChunkMarker,
): string | null {
	let value = "";
	for (let i = 0; i < marker.count; i++) {
		const chunk = storage.getItem(getChunkKey(key, marker, i));
		if (!chunk) {
			return null;
		}
		value += chunk;
	}
	return value;
}

async function readChunksAsync(
	storage: Pick<ExpoClientStorage, "getItemAsync">,
	key: string,
	marker: ChunkMarker,
): Promise<string | null> {
	let value = "";
	for (let i = 0; i < marker.count; i++) {
		const chunk = await storage.getItemAsync(getChunkKey(key, marker, i));
		if (!chunk) {
			return null;
		}
		value += chunk;
	}
	return value;
}

function readStoredValue(
	storage: Pick<ExpoClientStorage, "getItem">,
	key: string,
	baseValue: string | null,
): string | null {
	if (baseValue == null || !baseValue.startsWith(CHUNK_MARKER)) {
		return baseValue;
	}
	const marker = parseChunkMarker(baseValue);
	if (!marker) {
		return null;
	}
	const value = readChunks(storage, key, marker);
	if (value !== null || marker.slot === null || marker.fallbackCount === null) {
		return value;
	}
	return readChunks(storage, key, {
		count: marker.fallbackCount,
		slot: getOtherSlot(marker.slot),
		fallbackCount: null,
	});
}

async function readStoredValueAsync(
	storage: Pick<ExpoClientStorage, "getItemAsync">,
	key: string,
	baseValue: string | null,
): Promise<string | null> {
	if (baseValue == null || !baseValue.startsWith(CHUNK_MARKER)) {
		return baseValue;
	}
	const marker = parseChunkMarker(baseValue);
	if (!marker) {
		return null;
	}
	const value = await readChunksAsync(storage, key, marker);
	if (value !== null || marker.slot === null || marker.fallbackCount === null) {
		return value;
	}
	return readChunksAsync(storage, key, {
		count: marker.fallbackCount,
		slot: getOtherSlot(marker.slot),
		fallbackCount: null,
	});
}

interface ChunkCleanupRange {
	prefix: string;
	start: number;
	end: number;
}

function getStorageWritePlan(
	key: string,
	value: string,
	currentBaseValue: string | null,
): { writes: [key: string, value: string][]; cleanup: ChunkCleanupRange[] } {
	const currentMarker = currentBaseValue?.startsWith(CHUNK_MARKER)
		? parseChunkMarker(currentBaseValue)
		: null;
	if (value.length <= STORAGE_VALUE_LIMIT) {
		return {
			writes: [[key, value]],
			cleanup: getUnusedChunkRanges(key, currentMarker, null),
		};
	}

	const count = Math.ceil(value.length / STORAGE_VALUE_LIMIT);
	if (count > MAX_STORAGE_CHUNKS) {
		throw new Error(
			`Storage value requires ${count} chunks, exceeding the limit of ${MAX_STORAGE_CHUNKS}`,
		);
	}
	const slot: ChunkSlot = currentMarker?.slot === 0 ? 1 : 0;
	const marker: ChunkMarker = {
		count,
		slot,
		fallbackCount: currentMarker?.slot == null ? null : currentMarker.count,
	};
	const writes: [string, string][] = [];
	if (currentMarker?.slot != null && currentMarker.fallbackCount !== null) {
		// The fallback slot becomes the next write target.
		// Stop readers from using it until the new value is complete.
		writes.push([
			key,
			serializeChunkMarker({ ...currentMarker, fallbackCount: null }),
		]);
	}
	for (let i = 0; i < count; i++) {
		const start = i * STORAGE_VALUE_LIMIT;
		writes.push([
			getChunkKey(key, marker, i),
			value.slice(start, start + STORAGE_VALUE_LIMIT),
		]);
	}
	writes.push([key, serializeChunkMarker(marker)]);
	return { writes, cleanup: getUnusedChunkRanges(key, currentMarker, marker) };
}

function getSlotChunkCount(marker: ChunkMarker | null, slot: ChunkSlot | null) {
	if (!marker) return 0;
	if (marker.slot === slot) return marker.count;
	if (marker.slot === null || slot === null) return 0;
	return marker.fallbackCount ?? 0;
}

function getUnusedChunkRanges(
	key: string,
	previousMarker: ChunkMarker | null,
	marker: ChunkMarker | null,
): ChunkCleanupRange[] {
	return CHUNK_SLOTS.map((slot) => ({
		prefix: slot === null ? key : `${key}.${slot}`,
		start: getSlotChunkCount(marker, slot),
		end: getSlotChunkCount(previousMarker, slot),
	}));
}

interface StorageRead {
	snapshot: { value: string | null } | null;
}

interface StorageKeyState {
	pending: Promise<unknown> | null;
	pendingWrites: number;
	activeRead: StorageRead | null;
	cleanupComplete: boolean;
}

const storageStates = new WeakMap<
	ExpoClientStorage,
	Map<string, StorageKeyState>
>();

function getStorageState(storage: ExpoClientStorage, key: string) {
	let states = storageStates.get(storage);
	if (!states) {
		states = new Map();
		storageStates.set(storage, states);
	}
	let state = states.get(key);
	if (!state) {
		state = {
			pending: null,
			pendingWrites: 0,
			activeRead: null,
			cleanupComplete: false,
		};
		states.set(key, state);
	}
	return state;
}

function enqueueStorageOperation<Result>(
	state: StorageKeyState,
	operation: () => Promise<Result>,
): Promise<Result> {
	const previous = state.pending ?? Promise.resolve();
	const queued = previous.then(operation, operation);
	state.pending = queued;

	const cleanup = () => {
		if (state.pending === queued) state.pending = null;
	};
	void queued.then(cleanup, cleanup);
	return queued;
}

function enqueueStorageWrite<Result>(
	state: StorageKeyState,
	operation: () => Promise<Result>,
): Promise<Result> {
	state.pendingWrites++;
	return enqueueStorageOperation(state, async () => {
		try {
			return await operation();
		} finally {
			state.pendingWrites--;
		}
	});
}

interface ExpoStorageAdapter {
	getItem(name: string): string | null;
	getItemAsync(name: string): Promise<string | null>;
	setItem(name: string, value: string): void;
	setItemAsync(name: string, value: string): Promise<void>;
}

interface StoredUpdate {
	previousValue: string | null;
	value: string;
}

/** @internal */
export function createManagedStorage(storage: ExpoClientStorage) {
	const logWriteError = (key: string, error: unknown) => {
		logger.error(
			`[better-auth/expo] failed to persist "${key}" to storage`,
			error,
		);
	};
	const logCleanupError = (key: string, error: unknown) => {
		logger.error(
			`[better-auth/expo] failed to clear unused chunks for "${key}"`,
			error,
		);
	};
	const getItem = (name: string): string | null => {
		const key = normalizeCookieName(name);
		return readStoredValue(storage, key, storage.getItem(key));
	};
	const getItemAsync = (name: string): Promise<string | null> => {
		const key = normalizeCookieName(name);
		const state = getStorageState(storage, key);
		return enqueueStorageOperation(state, async () => {
			const read: StorageRead = { snapshot: null };
			state.activeRead = read;
			try {
				const baseValue = await storage.getItemAsync(key);
				const value = await readStoredValueAsync(storage, key, baseValue);
				return read.snapshot ? read.snapshot.value : value;
			} finally {
				state.activeRead = null;
			}
		});
	};
	const writeItem = (
		key: string,
		value: string,
		currentBaseValue: string | null,
	) => {
		const state = getStorageState(storage, key);
		const { writes, cleanup } = getStorageWritePlan(
			key,
			value,
			currentBaseValue,
		);
		for (const [writeKey, writeValue] of writes) {
			storage.setItem(writeKey, writeValue);
		}
		try {
			const scanContiguousOrphans = !state.cleanupComplete;
			for (const { prefix, start, end } of cleanup) {
				if (scanContiguousOrphans) {
					const orphanStart = Math.max(start, end);
					let orphanEnd = orphanStart;
					for (; orphanEnd < MAX_STORAGE_CHUNKS; orphanEnd++) {
						if (!storage.getItem(`${prefix}.${orphanEnd}`)) break;
					}
					for (let i = orphanEnd - 1; i >= orphanStart; i--) {
						storage.setItem(`${prefix}.${i}`, "");
					}
				}
				for (let i = end - 1; i >= start; i--) {
					storage.setItem(`${prefix}.${i}`, "");
				}
			}
			state.cleanupComplete = true;
		} catch (error) {
			state.cleanupComplete = false;
			logCleanupError(key, error);
		}
	};
	const writeItemAsync = async (
		key: string,
		value: string,
		currentBaseValue: string | null,
	) => {
		const state = getStorageState(storage, key);
		const { writes, cleanup } = getStorageWritePlan(
			key,
			value,
			currentBaseValue,
		);
		for (const [writeKey, writeValue] of writes) {
			await storage.setItemAsync(writeKey, writeValue);
		}
		try {
			const scanContiguousOrphans = !state.cleanupComplete;
			for (const { prefix, start, end } of cleanup) {
				if (scanContiguousOrphans) {
					const orphanStart = Math.max(start, end);
					let orphanEnd = orphanStart;
					for (; orphanEnd < MAX_STORAGE_CHUNKS; orphanEnd++) {
						const chunk = await storage.getItemAsync(`${prefix}.${orphanEnd}`);
						if (!chunk) break;
					}
					for (let i = orphanEnd - 1; i >= orphanStart; i--) {
						await storage.setItemAsync(`${prefix}.${i}`, "");
					}
				}
				for (let i = end - 1; i >= start; i--) {
					await storage.setItemAsync(`${prefix}.${i}`, "");
				}
			}
			state.cleanupComplete = true;
		} catch (error) {
			state.cleanupComplete = false;
			logCleanupError(key, error);
		}
	};
	const setItem = (name: string, value: string): void => {
		const key = normalizeCookieName(name);
		const state = getStorageState(storage, key);
		if (state.pendingWrites > 0) {
			logWriteError(
				key,
				new Error("Cannot write synchronously while an async write is pending"),
			);
			return;
		}

		let currentBaseValue: string | null = null;
		try {
			currentBaseValue = storage.getItem(key);
		} catch (error) {
			state.cleanupComplete = false;
			if (value.length > STORAGE_VALUE_LIMIT) {
				logWriteError(key, error);
				return;
			}
		}

		const read = state.activeRead;
		if (read && read.snapshot === null) {
			// Preserve the reader's value before its chunks can be overwritten.
			try {
				read.snapshot = {
					value: readStoredValue(storage, key, currentBaseValue),
				};
			} catch {
				read.snapshot = { value: null };
			}
		}

		try {
			writeItem(key, value, currentBaseValue);
		} catch (error) {
			state.cleanupComplete = false;
			logWriteError(key, error);
			return;
		}
		if (read) {
			read.snapshot = { value };
		}
	};
	const setItemAsync = (name: string, value: string): Promise<void> => {
		const key = normalizeCookieName(name);
		const state = getStorageState(storage, key);
		return enqueueStorageWrite(state, async () => {
			let currentBaseValue: string | null = null;
			try {
				currentBaseValue = await storage.getItemAsync(key);
			} catch (error) {
				state.cleanupComplete = false;
				if (value.length > STORAGE_VALUE_LIMIT) {
					logWriteError(key, error);
					return;
				}
			}

			try {
				await writeItemAsync(key, value, currentBaseValue);
			} catch (error) {
				state.cleanupComplete = false;
				logWriteError(key, error);
			}
		});
	};
	const updateItemAsync = (
		name: string,
		update: (currentValue: string | null) => string,
	): Promise<StoredUpdate | null> => {
		const key = normalizeCookieName(name);
		const state = getStorageState(storage, key);
		return enqueueStorageWrite(state, async () => {
			try {
				const currentBaseValue = await storage.getItemAsync(key);
				const previousValue = await readStoredValueAsync(
					storage,
					key,
					currentBaseValue,
				);
				const value = update(previousValue);
				await writeItemAsync(key, value, currentBaseValue);
				return { previousValue, value };
			} catch (error) {
				state.cleanupComplete = false;
				logWriteError(key, error);
				return null;
			}
		});
	};

	return { getItem, getItemAsync, setItem, setItemAsync, updateItemAsync };
}

/**
 * Wraps Expo storage with chunking, recoverable writes, and serialized async
 * access.
 */
export function storageAdapter(storage: ExpoClientStorage): ExpoStorageAdapter {
	const managedStorage = createManagedStorage(storage);
	return {
		getItem: managedStorage.getItem,
		getItemAsync: managedStorage.getItemAsync,
		setItem: managedStorage.setItem,
		setItemAsync: managedStorage.setItemAsync,
	};
}
