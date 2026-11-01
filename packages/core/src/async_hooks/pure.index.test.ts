import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.resetModules();
	vi.stubGlobal("AsyncLocalStorage", undefined);
	Reflect.deleteProperty(globalThis, "AsyncLocalStorage");
});

afterEach(() => {
	vi.unstubAllGlobals();
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
});
