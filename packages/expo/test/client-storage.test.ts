import { logger } from "@better-auth/core/env";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { storageAdapter } from "../src/client-storage";

beforeAll(() => {
	vi.useFakeTimers();
});

afterAll(() => {
	vi.useRealTimers();
});

it("should normalize colons in secure storage name via storage adapter", async () => {
	const map = new Map<string, string>();
	const setItem = vi.fn((name: string, value: string) => {
		map.set(name, value);
	});
	const setItemAsync = vi.fn(async (name: string, value: string) => {
		map.set(name, value);
	});
	const storage = storageAdapter({
		getItem(name) {
			return map.get(name) || null;
		},
		setItem,
		async getItemAsync(name) {
			return map.get(name) || null;
		},
		setItemAsync,
	});
	storage.setItem("better-auth:session_token", "123");
	expect(map.has("better-auth_session_token")).toBe(true);
	expect(map.has("better-auth:session_token")).toBe(false);
	expect(setItem).toHaveBeenCalledWith("better-auth_session_token", "123");
	expect(setItemAsync).not.toHaveBeenCalled();

	await storage.setItemAsync("better-auth:session_token", "456");
	expect(setItemAsync).toHaveBeenCalledWith("better-auth_session_token", "456");
});

/**
 * Large provider tokens (e.g. Keycloak) overflow the device storage ceiling,
 * so the adapter must split and reassemble the value instead of dropping it.
 *
 * @see https://github.com/better-auth/better-auth/issues/9151
 * @see https://github.com/better-auth/better-auth/issues/9814
 */
it("should round-trip a value larger than the per-write storage limit", async () => {
	const WRITE_LIMIT = 2048;
	const map = new Map<string, string>();
	const storage = storageAdapter({
		getItem: (name) => map.get(name) ?? null,
		setItem: (name, value) => {
			if (value.length > WRITE_LIMIT) {
				throw new Error("value exceeds storage limit");
			}
			map.set(name, value);
		},
		getItemAsync: async (name) => map.get(name) ?? null,
		setItemAsync: async (name, value) => {
			if (value.length > WRITE_LIMIT) {
				throw new Error("value exceeds storage limit");
			}
			map.set(name, value);
		},
	});

	const large = "x".repeat(10_000);
	storage.setItem("better-auth_cookie", large);

	// No single physical write may exceed the backend limit.
	for (const value of map.values()) {
		expect(value.length).toBeLessThanOrEqual(WRITE_LIMIT);
	}
	// The value is split across several keys, not stored under the base key.
	expect(map.size).toBeGreaterThan(1);
	expect(storage.getItem("better-auth_cookie")).toBe(large);

	await storage.setItemAsync("better-auth_cookie_async", large);
	const storedValue = await storage.getItemAsync("better-auth_cookie_async");
	expect(storedValue).toBe(large);
});

/**
 * @see https://docs.expo.dev/versions/latest/sdk/securestore/#securestoresetitemasynckey-value-options
 */
it("should keep Unicode chunks within the storage byte limit", () => {
	const map = new Map<string, string>();
	const storage = storageAdapter({
		getItem: (name) => map.get(name) ?? null,
		setItem: (name, value) => map.set(name, value),
		getItemAsync: async (name) => map.get(name) ?? null,
		setItemAsync: async (name, value) => {
			map.set(name, value);
		},
	});
	const value = `${"x".repeat(1_799)}🔐${"🙂".repeat(1_000)}`;

	storage.setItem("better-auth_cookie", value);

	for (const chunk of map.values()) {
		expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(1_800);
	}
	expect(storage.getItem("better-auth_cookie")).toBe(value);
});

it.each([
	"setItem",
	"setItemAsync",
] as const)("should stop %s when a multibyte value requires chunks and the base read fails", async (method) => {
	const setItem = vi.fn();
	const setItemAsync = vi.fn(async () => {});
	const storage = storageAdapter({
		getItem: () => {
			throw new Error("read unavailable");
		},
		setItem,
		getItemAsync: async () => {
			throw new Error("read unavailable");
		},
		setItemAsync,
	});
	const error = vi.spyOn(logger, "error").mockImplementation(() => {});

	await storage[method]("better-auth_cookie", "한".repeat(700));

	expect(setItem).not.toHaveBeenCalled();
	expect(setItemAsync).not.toHaveBeenCalled();
	expect(error).toHaveBeenCalledOnce();
});

it("should store a value within the limit under the base key unchanged", () => {
	const map = new Map<string, string>();
	const storage = storageAdapter({
		getItem: (name) => map.get(name) ?? null,
		setItem: (name, value) => map.set(name, value),
		getItemAsync: async (name) => map.get(name) ?? null,
		setItemAsync: async (name, value) => {
			map.set(name, value);
		},
	});

	const small = JSON.stringify({ token: "abc" });
	storage.setItem("better-auth_cookie", small);

	expect(map.get("better-auth_cookie")).toBe(small);
	expect(map.size).toBe(1);
	expect(storage.getItem("better-auth_cookie")).toBe(small);
});

it("should read back a value written before chunking existed", () => {
	// Pre-fix installs stored the whole jar under the base key.
	const map = new Map<string, string>([
		["better-auth_cookie", JSON.stringify({ legacy: true })],
	]);
	const storage = storageAdapter({
		getItem: (name) => map.get(name) ?? null,
		setItem: (name, value) => map.set(name, value),
		getItemAsync: async (name) => map.get(name) ?? null,
		setItemAsync: async (name, value) => {
			map.set(name, value);
		},
	});

	expect(storage.getItem("better-auth_cookie")).toBe(
		JSON.stringify({ legacy: true }),
	);
});

it("should read values written with the legacy chunk marker", async () => {
	const map = new Map<string, string>([
		["better-auth_cookie", "\u0001ba-chunks:2"],
		["better-auth_cookie.0", "legacy-"],
		["better-auth_cookie.1", "value"],
	]);
	const storage = storageAdapter({
		getItem: (name) => map.get(name) ?? null,
		setItem: (name, value) => map.set(name, value),
		getItemAsync: async (name) => map.get(name) ?? null,
		setItemAsync: async (name, value) => {
			map.set(name, value);
		},
	});

	expect(storage.getItem("better-auth_cookie")).toBe("legacy-value");
	await expect(storage.getItemAsync("better-auth_cookie")).resolves.toBe(
		"legacy-value",
	);
});

it("should fail closed when a chunk is missing", async () => {
	const map = new Map<string, string>([
		["better-auth_cookie", "\u0001ba-chunks:2:0"],
		["better-auth_cookie.0.0", "first chunk"],
	]);
	const storage = storageAdapter({
		getItem: (name) => map.get(name) ?? null,
		setItem: (name, value) => map.set(name, value),
		getItemAsync: async (name) => map.get(name) ?? null,
		setItemAsync: async (name, value) => {
			map.set(name, value);
		},
	});
	expect(storage.getItem("better-auth_cookie")).toBeNull();
	await expect(storage.getItemAsync("better-auth_cookie")).resolves.toBeNull();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11082
 */
describe("chunked storage consistency", () => {
	function createAsyncStorage() {
		const map = new Map<string, string>();
		const nextTask = () =>
			new Promise<void>((resolve) => queueMicrotask(resolve));
		return storageAdapter({
			getItem: (name) => map.get(name) ?? null,
			setItem: (name, value) => map.set(name, value),
			getItemAsync: async (name) => {
				await nextTask();
				return map.get(name) ?? null;
			},
			setItemAsync: async (name, value) => {
				await nextTask();
				map.set(name, value);
			},
		});
	}

	it("should preserve the previous value when a sync overwrite fails", () => {
		const map = new Map<string, string>();
		let failAfter = Number.POSITIVE_INFINITY;
		let writes = 0;
		const storage = storageAdapter({
			getItem: (name) => map.get(name) ?? null,
			setItem: (name, value) => {
				if (writes++ >= failAfter) {
					throw new Error("interrupted");
				}
				map.set(name, value);
			},
			getItemAsync: async (name) => map.get(name) ?? null,
			setItemAsync: async (name, value) => {
				if (writes++ >= failAfter) {
					throw new Error("interrupted");
				}
				map.set(name, value);
			},
		});

		storage.setItem("better-auth_cookie", "a".repeat(3_000));
		const previousValue = "b".repeat(5_000);
		storage.setItem("better-auth_cookie", previousValue);
		expect(storage.getItem("better-auth_cookie")).toBe(previousValue);

		const error = vi.spyOn(logger, "error").mockImplementation(() => {});
		writes = 0;
		failAfter = 2;
		storage.setItem("better-auth_cookie", "c".repeat(5_000));

		expect(error).toHaveBeenCalledTimes(1);
		expect(storage.getItem("better-auth_cookie")).toBe(previousValue);
	});

	it.for([
		{ failedWrite: 1 },
		{ failedWrite: 2 },
		{ failedWrite: 3 },
		{ failedWrite: 4 },
		{ failedWrite: 5 },
	])("should preserve the previous value when async write $failedWrite fails", async ({
		failedWrite,
	}) => {
		const map = new Map<string, string>();
		let writeIndex = 0;
		let failing = false;
		const storage = storageAdapter({
			getItem: (name) => map.get(name) ?? null,
			setItem: (name, value) => map.set(name, value),
			getItemAsync: async (name) => map.get(name) ?? null,
			setItemAsync: async (name, value) => {
				if (failing && ++writeIndex === failedWrite) {
					throw new Error("interrupted");
				}
				map.set(name, value);
			},
		});
		await storage.setItemAsync("better-auth_cookie", "a".repeat(3_000));
		const previousValue = "b".repeat(5_000);
		await storage.setItemAsync("better-auth_cookie", previousValue);
		writeIndex = 0;
		failing = true;
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});

		await storage.setItemAsync("better-auth_cookie", "c".repeat(5_000));

		expect(error).toHaveBeenCalledTimes(1);
		await expect(storage.getItemAsync("better-auth_cookie")).resolves.toBe(
			previousValue,
		);
	});

	it("should disable fallback while its slot is being overwritten", async () => {
		const map = new Map<string, string>();
		let writeIndex = 0;
		let failing = false;
		const storage = storageAdapter({
			getItem: (name) => map.get(name) ?? null,
			setItem: (name, value) => map.set(name, value),
			getItemAsync: async (name) => map.get(name) ?? null,
			setItemAsync: async (name, value) => {
				if (failing && ++writeIndex === 3) {
					throw new Error("interrupted");
				}
				map.set(name, value);
			},
		});
		await storage.setItemAsync("better-auth_cookie", "a".repeat(3_000));
		await storage.setItemAsync("better-auth_cookie", "b".repeat(5_000));
		writeIndex = 0;
		failing = true;
		vi.spyOn(logger, "error").mockImplementation(() => {});

		await storage.setItemAsync("better-auth_cookie", "c".repeat(5_000));
		map.delete("better-auth_cookie.1.1");

		expect(storage.getItem("better-auth_cookie")).toBeNull();
		await expect(
			storage.getItemAsync("better-auth_cookie"),
		).resolves.toBeNull();
	});

	it("should fall back when the active slot is incomplete", async () => {
		const map = new Map<string, string>();
		const storage = storageAdapter({
			getItem: (name) => map.get(name) ?? null,
			setItem: (name, value) => map.set(name, value),
			getItemAsync: async (name) => map.get(name) ?? null,
			setItemAsync: async (name, value) => {
				map.set(name, value);
			},
		});
		const previousValue = "a".repeat(3_000);
		await storage.setItemAsync("better-auth_cookie", previousValue);
		await storage.setItemAsync("better-auth_cookie", "b".repeat(5_000));
		map.delete("better-auth_cookie.1.1");

		expect(storage.getItem("better-auth_cookie")).toBe(previousValue);
		await expect(storage.getItemAsync("better-auth_cookie")).resolves.toBe(
			previousValue,
		);
	});

	it("should finish an earlier read before a chunked overwrite", async () => {
		const storage = createAsyncStorage();
		await storage.setItemAsync("better-auth_cookie", "a".repeat(3_000));
		const previousValue = "b".repeat(5_000);
		await storage.setItemAsync("better-auth_cookie", previousValue);
		const newValue = "c".repeat(5_000);

		const read = storage.getItemAsync("better-auth_cookie");
		const write = storage.setItemAsync("better-auth_cookie", newValue);
		const [stored] = await Promise.all([read, write]);

		expect(stored).toBe(previousValue);
	});

	it("should serialize concurrent chunked overwrites", async () => {
		const storage = createAsyncStorage();
		const firstValue = "a".repeat(5_000);
		const secondValue = "b".repeat(5_000);
		const thirdValue = "c".repeat(5_000);

		await Promise.all([
			storage.setItemAsync("better-auth_cookie", firstValue),
			storage.setItemAsync("better-auth_cookie", secondValue),
			storage.setItemAsync("better-auth_cookie", thirdValue),
		]);

		await expect(storage.getItemAsync("better-auth_cookie")).resolves.toBe(
			thirdValue,
		);
	});

	it("should serialize writes across adapters sharing storage", async () => {
		const map = new Map<string, string>();
		let activeWrites = 0;
		let peakWrites = 0;
		const backingStorage = {
			getItem: (name: string) => map.get(name) ?? null,
			setItem: (name: string, value: string) => map.set(name, value),
			getItemAsync: async (name: string) => map.get(name) ?? null,
			setItemAsync: async (name: string, value: string) => {
				activeWrites++;
				peakWrites = Math.max(peakWrites, activeWrites);
				await new Promise<void>((resolve) => queueMicrotask(resolve));
				map.set(name, value);
				activeWrites--;
			},
		};
		const first = storageAdapter(backingStorage);
		const second = storageAdapter(backingStorage);

		await Promise.all([
			first.setItemAsync("better-auth_cookie", "a".repeat(5_000)),
			second.setItemAsync("better-auth_cookie", "b".repeat(5_000)),
		]);

		expect(peakWrites).toBe(1);

		peakWrites = 0;
		await Promise.all([
			first.setItemAsync("first_cookie", "a".repeat(5_000)),
			second.setItemAsync("second_cookie", "b".repeat(5_000)),
		]);

		expect(peakWrites).toBe(2);
	});

	it("should not coordinate independent storage backends", async () => {
		const firstMap = new Map<string, string>();
		const secondMap = new Map<string, string>();
		const first = storageAdapter({
			getItem: (name) => firstMap.get(name) ?? null,
			setItem: (name, value) => firstMap.set(name, value),
			getItemAsync: async (name) => firstMap.get(name) ?? null,
			setItemAsync: async (name, value) => {
				await new Promise<void>((resolve) => queueMicrotask(resolve));
				firstMap.set(name, value);
			},
		});
		const second = storageAdapter({
			getItem: (name) => secondMap.get(name) ?? null,
			setItem: (name, value) => secondMap.set(name, value),
			getItemAsync: async (name) => secondMap.get(name) ?? null,
			setItemAsync: async (name, value) => {
				secondMap.set(name, value);
			},
		});
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});

		const write = first.setItemAsync("better-auth_cookie", "a".repeat(5_000));
		second.setItem("better-auth_cookie", "independent");
		await write;
		const errorCalls = error.mock.calls.length;
		error.mockRestore();

		expect(errorCalls).toBe(0);
		expect(second.getItem("better-auth_cookie")).toBe("independent");
	});

	it("should not mix a sync write into a pending async write", async () => {
		const map = new Map<string, string>();
		const backingStorage = {
			getItem: (name: string) => map.get(name) ?? null,
			setItem: (name: string, value: string) => map.set(name, value),
			getItemAsync: async (name: string) => map.get(name) ?? null,
			setItemAsync: async (name: string, value: string) => {
				await new Promise<void>((resolve) => queueMicrotask(resolve));
				map.set(name, value);
			},
		};
		const asyncStorage = storageAdapter(backingStorage);
		const syncStorage = storageAdapter(backingStorage);
		const asyncValue = "a".repeat(5_000);
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});

		const write = asyncStorage.setItemAsync("better-auth_cookie", asyncValue);
		syncStorage.setItem("better-auth_cookie", "b".repeat(5_000));
		await write;

		expect(error).toHaveBeenCalledTimes(1);
		await expect(asyncStorage.getItemAsync("better-auth_cookie")).resolves.toBe(
			asyncValue,
		);
	});

	it("should keep atomic updates internal to the Expo client", () => {
		const storage = storageAdapter({
			getItem: () => null,
			setItem: () => {},
			getItemAsync: async () => null,
			setItemAsync: async () => {},
		});

		expect(storage).not.toHaveProperty("updateItemAsync");
	});

	it("should reject excessive chunk counts", async () => {
		const map = new Map<string, string>([["better-auth_cookie", "previous"]]);
		const getItem = vi.fn((name: string) => map.get(name) ?? null);
		const getItemAsync = vi.fn(async (name: string) => map.get(name) ?? null);
		const storage = storageAdapter({
			getItem,
			setItem: (name, value) => map.set(name, value),
			getItemAsync,
			setItemAsync: async (name, value) => {
				map.set(name, value);
			},
		});
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});

		await storage.setItemAsync("better-auth_cookie", "x".repeat(180_001));

		expect(error).toHaveBeenCalledTimes(1);
		await expect(storage.getItemAsync("better-auth_cookie")).resolves.toBe(
			"previous",
		);

		map.set("better-auth_cookie", "\u0001ba-chunks:101:0");
		getItem.mockClear();
		getItemAsync.mockClear();
		expect(storage.getItem("better-auth_cookie")).toBeNull();
		await expect(
			storage.getItemAsync("better-auth_cookie"),
		).resolves.toBeNull();
		expect(getItem).toHaveBeenCalledTimes(1);
		expect(getItemAsync).toHaveBeenCalledTimes(1);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11194
 */
describe("obsolete storage chunks", () => {
	beforeEach(() => vi.clearAllTimers());
	afterEach(() => vi.clearAllTimers());
	const key = "scenecutai_cookie";
	const previousValue = JSON.stringify({
		"better-auth.session_token": { value: "old-session-token" },
		"better-auth.session_data": { value: "x".repeat(2_000) },
	});
	function createBackingStorage(map: Map<string, string>) {
		return {
			getItem: (name: string) => map.get(name) ?? null,
			setItem: (name: string, value: string) => {
				map.set(name, value);
			},
			getItemAsync: async (name: string) => map.get(name) ?? null,
			setItemAsync: async (name: string, value: string) => {
				map.set(name, value);
			},
		};
	}

	function pauseNextStorageRead(
		backing: ReturnType<typeof createBackingStorage>,
		chunkKey: string,
	) {
		let resume = () => {};
		let started = () => {};
		const paused = new Promise<void>((resolve) => {
			resume = resolve;
		});
		const reading = new Promise<void>((resolve) => {
			started = resolve;
		});
		const getItemAsync = backing.getItemAsync;
		let pauseRead = true;
		backing.getItemAsync = async (name) => {
			if (name === chunkKey && pauseRead) {
				pauseRead = false;
				started();
				await paused;
			}
			return getItemAsync(name);
		};
		return { reading, resume };
	}

	describe.each(["setItem", "setItemAsync"] as const)("%s", (method) => {
		it("retries orphan cleanup without leaving an unscannable gap", async () => {
			const map = new Map<string, string>([
				[key, "\u0001ba-chunks:2:0"],
				[`${key}.0.0`, "first"],
				[`${key}.0.1`, "second"],
				[`${key}.0.2`, "old-secret"],
			]);
			const backing = createBackingStorage(map);
			let failing = true;
			const write = (name: string, value: string) => {
				if (failing && name === `${key}.0.2`) throw new Error("cleanup failed");
				map.set(name, value);
			};
			backing.setItem = write;
			backing.setItemAsync = async (name, value) => write(name, value);
			const storage = storageAdapter(backing);
			const error = vi.spyOn(logger, "error").mockImplementation(() => {});

			await storage[method](key, "{}");
			await vi.runAllTimersAsync();
			expect(map.get(key)).toBe("{}");
			expect(map.get(`${key}.0.0`)).toBe("first");
			expect(map.get(`${key}.0.1`)).toBe("second");
			expect(map.get(`${key}.0.2`)).toBe("old-secret");
			expect(error).toHaveBeenCalledOnce();

			failing = false;
			await storage[method](key, "{}");
			await vi.runAllTimersAsync();
			expect(map.get(`${key}.0.0`)).toBe("");
			expect(map.get(`${key}.0.1`)).toBe("");
			expect(map.get(`${key}.0.2`)).toBe("");
		});

		it("persists a short value when reading the previous marker fails", async () => {
			const map = new Map<string, string>();
			const backing = createBackingStorage(map);
			backing.getItem = () => {
				throw new Error("read unavailable");
			};
			backing.getItemAsync = async () => {
				throw new Error("read unavailable");
			};
			const storage = storageAdapter(backing);
			const error = vi.spyOn(logger, "error").mockImplementation(() => {});

			await storage[method](key, "{}");

			expect(map.get(key)).toBe("{}");
			await vi.runAllTimersAsync();
			expect(error).toHaveBeenCalledOnce();
		});

		it("clears known chunks beyond a missing chunk", async () => {
			const map = new Map<string, string>([
				[key, "\u0001ba-chunks:3"],
				[`${key}.0`, "old-first"],
				[`${key}.2`, "old-secret"],
			]);
			const storage = storageAdapter(createBackingStorage(map));
			await storage[method](key, "{}");
			expect(map.get(`${key}.2`) ?? "").toBe("");
		});

		it("uses the marker to clear incomplete chunks after the initial sweep", async () => {
			const map = new Map<string, string>();
			const backing = createBackingStorage(map);
			const storage = storageAdapter(backing);
			await storage[method](key, "a".repeat(5_000));
			await vi.runAllTimersAsync();
			map.delete(`${key}.0.1`);
			const getItem = vi.spyOn(backing, "getItem");
			const getItemAsync = vi.spyOn(backing, "getItemAsync");

			await storage[method](key, "{}");

			expect(getItem.mock.calls.length + getItemAsync.mock.calls.length).toBe(
				1,
			);
			expect(map.get(`${key}.0.0`)).toBe("");
			expect(map.get(`${key}.0.2`)).toBe("");
		});

		it.each([
			{
				name: "legacy migration",
				marker: "\u0001ba-chunks:2",
				initialValue: previousValue,
				chunkKeys: [`${key}.0`, `${key}.1`],
				value: previousValue.replace("old-session-token", "new-session-token"),
			},
			{
				name: "legacy clear",
				marker: "\u0001ba-chunks:2",
				initialValue: previousValue,
				chunkKeys: [`${key}.0`, `${key}.1`],
				value: "{}",
			},
			{
				name: "slotted clear with fallback",
				marker: "\u0001ba-chunks:2:1:2",
				initialValue: previousValue,
				chunkKeys: [`${key}.1.0`, `${key}.1.1`, `${key}.0.0`, `${key}.0.1`],
				value: "{}",
			},
			{
				name: "a lost legacy marker",
				marker: "{}",
				initialValue: "{}",
				chunkKeys: [`${key}.0`, `${key}.1`],
				value: "{}",
			},
			{
				name: "a lost slotted marker",
				marker: "{}",
				initialValue: "{}",
				chunkKeys: [`${key}.1.0`, `${key}.1.1`, `${key}.0.0`, `${key}.0.1`],
				value: "{}",
			},
		])("clears obsolete bytes after $name", async ({
			marker,
			initialValue,
			chunkKeys,
			value,
		}) => {
			const map = new Map<string, string>([[key, marker]]);
			for (const [index, chunkKey] of chunkKeys.entries()) {
				const start = (index % 2) * 1_800;
				map.set(chunkKey, previousValue.slice(start, start + 1_800));
			}
			const storage = storageAdapter(createBackingStorage(map));

			expect(storage.getItem(key)).toBe(initialValue);
			await storage[method](key, value);
			expect(storage.getItem(key)).toBe(value);
			await vi.runAllTimersAsync();
			expect(chunkKeys.map((chunkKey) => map.get(chunkKey) ?? "")).toEqual(
				chunkKeys.map(() => ""),
			);
		});

		it("clears a reused slot's tail while preserving recovery", async () => {
			const map = new Map<string, string>();
			const storage = storageAdapter(createBackingStorage(map));
			await storage[method](key, "a".repeat(5_000));
			await storage[method](key, previousValue);
			const nextValue = "b".repeat(2_000);
			await storage[method](key, nextValue);

			expect(storage.getItem(key)).toBe(nextValue);
			expect(map.get(`${key}.0.2`)).toBe("");
			map.delete(`${key}.0.0`);
			expect(storage.getItem(key)).toBe(previousValue);
		});

		it("preserves legacy chunks when the replacement cannot be committed", async () => {
			const map = new Map<string, string>([
				[key, "\u0001ba-chunks:2"],
				[`${key}.0`, previousValue.slice(0, 1_800)],
				[`${key}.1`, previousValue.slice(1_800)],
			]);
			const backing = createBackingStorage(map);
			const write = (name: string, value: string) => {
				if (name === key) throw new Error("interrupted commit");
				map.set(name, value);
			};
			backing.setItem = write;
			backing.setItemAsync = async (name, value) => write(name, value);
			const storage = storageAdapter(backing);
			const error = vi.spyOn(logger, "error").mockImplementation(() => {});

			await storage[method](key, "b".repeat(3_000));

			expect(error).toHaveBeenCalledOnce();
			expect(storage.getItem(key)).toBe(previousValue);
		});

		it("retries interrupted cleanup without losing the committed value", async () => {
			const map = new Map<string, string>([
				[key, "\u0001ba-chunks:2"],
				[`${key}.0`, previousValue.slice(0, 1_800)],
				[`${key}.1`, previousValue.slice(1_800)],
			]);
			const backing = createBackingStorage(map);
			let interrupted = false;
			const write = (name: string, value: string) => {
				if (name === `${key}.0` && !interrupted) {
					interrupted = true;
					throw new Error("interrupted cleanup");
				}
				map.set(name, value);
			};
			backing.setItem = write;
			backing.setItemAsync = async (name, value) => write(name, value);
			const storage = storageAdapter(backing);
			const error = vi.spyOn(logger, "error").mockImplementation(() => {});

			await storage[method](key, "{}");
			expect(error).toHaveBeenCalledOnce();
			expect(storage.getItem(key)).toBe("{}");
			expect(map.get(`${key}.1`)).toBe("");

			await storage[method](key, "{}");
			await vi.runAllTimersAsync();
			expect(map.get(`${key}.0`)).toBe("");
			expect(map.get(`${key}.1`)).toBe("");
		});

		it("stops orphan probing at the first empty chunk", async () => {
			const map = new Map<string, string>();
			const backing = createBackingStorage(map);
			const getItem = vi.spyOn(backing, "getItem");
			const getItemAsync = vi.spyOn(backing, "getItemAsync");
			const storage = storageAdapter(backing);

			await storage[method](key, "{}");
			expect(getItem.mock.calls.length + getItemAsync.mock.calls.length).toBe(
				4,
			);

			getItem.mockClear();
			getItemAsync.mockClear();
			await storageAdapter(backing)[method](key, "{}");
			expect(getItem.mock.calls.length + getItemAsync.mock.calls.length).toBe(
				1,
			);

			const nextBacking = createBackingStorage(map);
			const nextGetItem = vi.spyOn(nextBacking, "getItem");
			const nextGetItemAsync = vi.spyOn(nextBacking, "getItemAsync");
			await storageAdapter(nextBacking)[method](key, "{}");
			expect(
				nextGetItem.mock.calls.length + nextGetItemAsync.mock.calls.length,
			).toBe(4);
		});
	});

	it("retries partially cleared orphan chunks on the next write", async () => {
		const map = new Map<string, string>([
			[`${key}.0`, "first"],
			[`${key}.1`, "second"],
			[`${key}.2`, "third"],
		]);
		const backing = createBackingStorage(map);
		let failing = true;
		backing.setItemAsync = async (name, value) => {
			if (name === `${key}.1` && failing) throw new Error("cleanup failed");
			map.set(name, value);
		};
		const storage = storageAdapter(backing);
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});
		await storage.setItemAsync(key, "{}");
		expect(map.get(`${key}.0`)).toBe("first");
		expect(map.get(`${key}.1`)).toBe("second");
		expect(map.get(`${key}.2`)).toBe("");
		expect(error).toHaveBeenCalledOnce();

		failing = false;
		await storage.setItemAsync(key, "next");
		expect(map.get(`${key}.0`)).toBe("");
		expect(map.get(`${key}.1`)).toBe("");
		expect(map.get(key)).toBe("next");
	});

	it("allows a synchronous write while only an async read is pending", async () => {
		const map = new Map<string, string>([[key, "previous"]]);
		const storage = storageAdapter(createBackingStorage(map));
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});
		const read = storage.getItemAsync(key);
		storage.setItem(key, "next");
		expect(map.get(key)).toBe("next");
		await expect(read).resolves.toBe("next");
		expect(error).not.toHaveBeenCalled();
	});

	it("keeps a complete read when synchronous writes reuse its slot", async () => {
		const map = new Map<string, string>();
		const backing = createBackingStorage(map);
		const storage = storageAdapter(backing);
		const other = storageAdapter(backing);
		await storage.setItemAsync(key, previousValue);
		const { reading, resume } = pauseNextStorageRead(backing, `${key}.0.1`);
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});
		const read = storage.getItemAsync(key);
		await reading;
		try {
			other.setItem(key, "b".repeat(3_000));
			other.setItem(key, "c".repeat(3_000));
			expect(storage.getItem(key)).toBe("c".repeat(3_000));
		} finally {
			resume();
		}
		await expect(read).resolves.toBe("c".repeat(3_000));
		expect(error).not.toHaveBeenCalled();

		map.delete(`${key}.0.1`);
		await expect(storage.getItemAsync(key)).resolves.toBe("b".repeat(3_000));
	});

	it.each([
		{ failure: "write", expected: previousValue, errors: 1 },
		{ failure: "read", expected: "b".repeat(3_000), errors: 0 },
	])("keeps a complete async read after a synchronous $failure failure", async ({
		failure,
		expected,
		errors,
	}) => {
		const map = new Map<string, string>([
			[key, "\u0001ba-chunks:2:1:2"],
			[`${key}.0.0`, previousValue.slice(0, 1_800)],
			[`${key}.0.1`, previousValue.slice(1_800)],
		]);
		const backing = createBackingStorage(map);
		backing.getItem = (name) => {
			if (failure === "read" && name === `${key}.0.0`)
				throw new Error("read failed");
			return map.get(name) ?? null;
		};
		backing.setItem = (name, value) => {
			if (failure === "write" && name === `${key}.0.1`)
				throw new Error("write failed");
			map.set(name, value);
		};
		const { reading, resume } = pauseNextStorageRead(backing, `${key}.0.0`);
		const storage = storageAdapter(backing);
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});
		const read = storage.getItemAsync(key);
		await reading;
		try {
			storage.setItem(key, "b".repeat(3_000));
		} finally {
			resume();
		}
		await expect(read).resolves.toBe(expected);
		expect(error).toHaveBeenCalledTimes(errors);
	});

	it("continues queued writes after a read fails", async () => {
		const map = new Map<string, string>();
		const backing = createBackingStorage(map);
		vi.spyOn(backing, "getItemAsync").mockRejectedValueOnce(
			new Error("read failed"),
		);
		const storage = storageAdapter(backing);
		const read = storage.getItemAsync(key);
		const write = storage.setItemAsync(key, "next");
		await expect(read).rejects.toThrow("read failed");
		await write;
		expect(storage.getItem(key)).toBe("next");
	});

	it("finishes reading before another adapter can reuse its slot", async () => {
		const map = new Map<string, string>();
		const backing = createBackingStorage(map);
		const storage = storageAdapter(backing);
		const other = storageAdapter(backing);
		await storage.setItemAsync(key, previousValue);
		const { reading, resume } = pauseNextStorageRead(backing, `${key}.0.1`);
		const writes = vi.spyOn(backing, "setItemAsync");
		const read = storage.getItemAsync(key);
		await reading;
		const firstWrite = other.setItemAsync(key, "b".repeat(3_000));
		const secondWrite = other.setItemAsync(key, "c".repeat(3_000));
		let overlappingWrites = 0;
		try {
			await other.setItemAsync("independent_cookie", "{}");
			overlappingWrites = writes.mock.calls.filter(([name]) =>
				name.startsWith(key),
			).length;
		} finally {
			resume();
		}
		const value = await read;
		await Promise.all([firstWrite, secondWrite]);
		expect(overlappingWrites).toBe(0);
		expect(value).toBe(previousValue);
	});

	it.each([
		{ name: "legacy", marker: "\u0001ba-chunks:2", prefix: key },
		{ name: "active", marker: "\u0001ba-chunks:2:0", prefix: `${key}.0` },
		{ name: "fallback", marker: "\u0001ba-chunks:2:1:2", prefix: `${key}.0` },
	])("finishes a $name read before cleanup", async ({ marker, prefix }) => {
		const map = new Map<string, string>([
			[key, marker],
			[`${prefix}.0`, previousValue.slice(0, 1_800)],
			[`${prefix}.1`, previousValue.slice(1_800)],
		]);
		const backing = createBackingStorage(map);
		const { reading, resume } = pauseNextStorageRead(backing, `${prefix}.1`);
		const storage = storageAdapter(backing);

		const read = storage.getItemAsync(key);
		await reading;
		const write = storage.setItemAsync(key, "{}");
		resume();
		await expect(read).resolves.toBe(previousValue);
		await write;
		expect(storage.getItem(key)).toBe("{}");
	});
});

it("should shrink from chunked to a single value without bleeding stale chunks", () => {
	const map = new Map<string, string>();
	const storage = storageAdapter({
		getItem: (name) => map.get(name) ?? null,
		setItem: (name, value) => map.set(name, value),
		getItemAsync: async (name) => map.get(name) ?? null,
		setItemAsync: async (name, value) => {
			map.set(name, value);
		},
	});

	storage.setItem("better-auth_cookie", "z".repeat(5_000));
	storage.setItem("better-auth_cookie", "small");

	expect(storage.getItem("better-auth_cookie")).toBe("small");
});

it("should log instead of throw when the backend rejects a write", async () => {
	const error = vi.spyOn(logger, "error").mockImplementation(() => {});
	const storage = storageAdapter({
		getItem: () => null,
		setItem: () => {
			throw new Error("keychain rejected write");
		},
		getItemAsync: async () => null,
		setItemAsync: async () => {
			throw new Error("keychain rejected write");
		},
	});

	expect(() => storage.setItem("better-auth_cookie", "value")).not.toThrow();
	await expect(
		storage.setItemAsync("better-auth_cookie", "value"),
	).resolves.toBeUndefined();
	expect(error).toHaveBeenCalledTimes(2);
	error.mockRestore();
});
