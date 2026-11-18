import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.resetModules();
	vi.stubGlobal("AsyncLocalStorage", undefined);
	Reflect.deleteProperty(globalThis, "AsyncLocalStorage");
	// Hide Node's builtin so the polyfill runs.
	if (typeof process.getBuiltinModule === "function") {
		const getBuiltinModule = process.getBuiltinModule.bind(process);
		vi.spyOn(process, "getBuiltinModule").mockImplementation((id) =>
			id === "node:async_hooks" ? undefined : getBuiltinModule(id),
		);
	}
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("pure getAsyncLocalStorage", () => {
	it("selects the runtime constructor on first use and keeps the successful result", async () => {
		const { getAsyncLocalStorage } = await import("./pure.index");
		vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
		const result = getAsyncLocalStorage();
		expect(result).toBeInstanceOf(Promise);
		await expect(result).resolves.toBe(AsyncLocalStorage);
		vi.stubGlobal("AsyncLocalStorage", undefined);
		await expect(getAsyncLocalStorage()).resolves.toBe(AsyncLocalStorage);
	});

	it.each([
		{ name: "null", value: null, expectedType: "object" },
		{ name: "undefined", value: undefined, expectedType: "undefined" },
		{ name: "object", value: {}, expectedType: "object" },
	])(
		"reports an invalid runtime constructor ($name) and recovers when it is replaced",
		async ({ value, expectedType }) => {
			vi.stubGlobal("AsyncLocalStorage", value);
			const { getAsyncLocalStorage } = await import("./pure.index");
			await expect(getAsyncLocalStorage()).rejects.toThrow(
				`Invalid globalThis.AsyncLocalStorage: expected a function, received ${expectedType}.`,
			);
			vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
			await expect(getAsyncLocalStorage()).resolves.toBe(AsyncLocalStorage);
		},
	);

	it("provides the polyfill in a browser and restores nested synchronous stores", async () => {
		vi.stubGlobal("window", {});
		const { getAsyncLocalStorage } = await import("./pure.index");
		const Storage = await getAsyncLocalStorage();
		const storage = new Storage<string>();
		expect(Storage).not.toBe(AsyncLocalStorage);
		expect(storage.getStore()).toBeUndefined();
		const result = storage.run("outer", () => {
			expect(storage.getStore()).toBe("outer");
			const inner = storage.run("inner", () => storage.getStore());
			expect(inner).toBe("inner");
			expect(storage.getStore()).toBe("outer");
			return "result";
		});
		expect(result).toBe("result");
		expect(storage.getStore()).toBeUndefined();
	});

	it("keeps a polyfill store until an asynchronous callback settles", async () => {
		const { getAsyncLocalStorage } = await import("./pure.index");
		const Storage = await getAsyncLocalStorage();
		const storage = new Storage<string>();
		const result = storage.run("request", async () => {
			await Promise.resolve();
			return storage.getStore();
		});
		await expect(result).resolves.toBe("request");
		expect(storage.getStore()).toBeUndefined();
	});

	it("restores the previous polyfill store when a callback throws synchronously", async () => {
		const { getAsyncLocalStorage } = await import("./pure.index");
		const Storage = await getAsyncLocalStorage();
		const storage = new Storage<string>();
		const error = new Error("callback failed");
		const fail = () => {
			throw error;
		};
		expect(() => storage.run("top", fail)).toThrow(error);
		expect(storage.getStore()).toBeUndefined();
		const read = storage.run("outer", () => {
			expect(() => storage.run("inner", fail)).toThrow(error);
			return storage.getStore();
		});
		expect(read).toBe("outer");
		expect(storage.getStore()).toBeUndefined();
	});

	describe("overlapping polyfill runs", () => {
		const overlap = async (firstDelay: number, secondDelay: number) => {
			const { getAsyncLocalStorage } = await import("./pure.index");
			const Storage = await getAsyncLocalStorage();
			const storage = new Storage<string>();
			const read = (store: string, delay: number) =>
				storage.run(store, async () => {
					await new Promise((resolve) => setTimeout(resolve, delay));
					return storage.getStore();
				});
			const [first, second] = await Promise.all([
				read("first", firstDelay),
				read("second", secondDelay),
			]);
			return { first, second, left: storage.getStore() };
		};

		it("leaves nothing installed when the later run settles first", async () => {
			await expect(overlap(10, 0)).resolves.toEqual({
				first: "first",
				second: "second",
				left: undefined,
			});
		});

		it("leaves nothing installed when the earlier run settles first", async () => {
			const { second, left } = await overlap(0, 10);
			expect(second).toBe("second");
			expect(left).toBeUndefined();
		});
	});

	/**
	 * @see https://nodejs.org/api/async_context.html#asynclocalstoragerunstore-callback-args
	 */
	it.runIf(typeof process.getBuiltinModule === "function")(
		"uses the runtime builtin so overlapping callbacks keep their own stores",
		async () => {
			vi.spyOn(process, "getBuiltinModule").mockReturnValue({
				AsyncLocalStorage,
			});
			const { getAsyncLocalStorage } = await import("./pure.index");
			const Storage = await getAsyncLocalStorage();
			expect(Storage).toBe(AsyncLocalStorage);
			const storage = new Storage<string>();
			const read = (store: string, delay: number) =>
				storage.run(store, async () => {
					await new Promise((resolve) => setTimeout(resolve, delay));
					return storage.getStore();
				});
			await expect(
				Promise.all([read("first", 0), read("second", 10)]),
			).resolves.toEqual(["first", "second"]);
		},
	);
});
