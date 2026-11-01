import { AsyncLocalStorage } from "node:async_hooks";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";

function mockNativeConstructorError(error: Error) {
	vi.doMock("node:async_hooks", () => ({
		get AsyncLocalStorage() {
			throw error;
		},
	}));
}

beforeEach(() => {
	vi.resetModules();
});

afterEach(() => {
	vi.doUnmock("node:async_hooks");
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("getAsyncLocalStorage", () => {
	it("returns the native constructor through the existing asynchronous API", async () => {
		const { getAsyncLocalStorage } = await import("./index");
		const result = getAsyncLocalStorage();
		expectTypeOf(result).toEqualTypeOf<Promise<typeof AsyncLocalStorage>>();
		expect(result).toBeInstanceOf(Promise);
		expect(await result).toBe(AsyncLocalStorage);
	});

	it.runIf(typeof process.getBuiltinModule === "function")(
		"uses builtin lookup when reading dynamic module exports would fail",
		async () => {
			vi.spyOn(process, "getBuiltinModule").mockReturnValue({
				AsyncLocalStorage,
			});
			mockNativeConstructorError(new Error("Native export is unavailable"));
			const { getAsyncLocalStorage } = await import("./index");
			await expect(getAsyncLocalStorage()).resolves.toBe(AsyncLocalStorage);
		},
	);

	it.runIf(typeof process.getBuiltinModule === "function")(
		"uses dynamic import when builtin lookup throws",
		async () => {
			vi.spyOn(process, "getBuiltinModule").mockImplementation(() => {
				throw new Error("Builtin lookup is unavailable");
			});
			const { getAsyncLocalStorage } = await import("./index");
			await expect(getAsyncLocalStorage()).resolves.toBe(AsyncLocalStorage);
		},
	);

	describe("dynamic import fallback", () => {
		beforeEach(() => {
			if (typeof process.getBuiltinModule === "function") {
				const getBuiltinModule = process.getBuiltinModule.bind(process);
				vi.spyOn(process, "getBuiltinModule").mockImplementation((id) =>
					id === "node:async_hooks" ? undefined : getBuiltinModule(id),
				);
			}
		});

		it("keeps a successful constructor when later loading becomes unavailable", async () => {
			const { getAsyncLocalStorage } = await import("./index");
			expect(await getAsyncLocalStorage()).toBe(AsyncLocalStorage);
			mockNativeConstructorError(new Error("Native export is unavailable"));
			await expect(getAsyncLocalStorage()).resolves.toBe(AsyncLocalStorage);
		});

		it("uses the runtime-provided constructor without availability warnings", async () => {
			mockNativeConstructorError(new Error("Native export is unavailable"));
			vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { getAsyncLocalStorage } = await import("./index");
			await expect(getAsyncLocalStorage()).resolves.toBe(AsyncLocalStorage);
			expect(warn).not.toHaveBeenCalled();
		});

		it("can recover after an unsuccessful load", async () => {
			const error = new Error("Native export is unavailable");
			mockNativeConstructorError(error);
			vi.spyOn(console, "warn").mockImplementation(() => {});
			const { getAsyncLocalStorage } = await import("./index");
			await expect(getAsyncLocalStorage()).rejects.toBe(error);
			vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
			await expect(getAsyncLocalStorage()).resolves.toBe(AsyncLocalStorage);
		});

		describe("unavailable runtime constructor", () => {
			it.each([undefined, null])(
				"forwards the native error when the global is %s and recovers later",
				async (constructor) => {
					const error = new Error("Native export is unavailable");
					mockNativeConstructorError(error);
					vi.stubGlobal("AsyncLocalStorage", constructor);
					const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
					const { getAsyncLocalStorage } = await import("./index");
					await expect(getAsyncLocalStorage()).rejects.toBe(error);
					expect(warn).toHaveBeenCalledWith(
						expect.stringContaining("AsyncLocalStorage is not available"),
					);
					vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
					await expect(getAsyncLocalStorage()).resolves.toBe(AsyncLocalStorage);
				},
			);

			it.each([undefined, null])(
				"rejects browser calls without warnings when the global is %s",
				async (constructor) => {
					mockNativeConstructorError(new Error("Native export is unavailable"));
					vi.stubGlobal("AsyncLocalStorage", constructor);
					vi.stubGlobal("window", {});
					const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
					const { getAsyncLocalStorage } = await import("./index");
					await expect(getAsyncLocalStorage()).rejects.toThrow(
						"getAsyncLocalStorage is only available in server code",
					);
					expect(warn).not.toHaveBeenCalled();
				},
			);
		});

		it("preserves the server-only error for unsupported browser calls", async () => {
			mockNativeConstructorError(new Error("Native export is unavailable"));
			vi.stubGlobal("window", {});
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { getAsyncLocalStorage } = await import("./index");
			await expect(getAsyncLocalStorage()).rejects.toThrow(
				"getAsyncLocalStorage is only available in server code",
			);
			expect(warn).not.toHaveBeenCalled();
		});

		it("forwards the native error and reports unavailable storage only once", async () => {
			const error = new Error("Native export is unavailable");
			mockNativeConstructorError(error);
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { getAsyncLocalStorage } = await import("./index");
			await expect(getAsyncLocalStorage()).rejects.toBe(error);
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("AsyncLocalStorage is not available"),
			);
			const initialWarnings = warn.mock.calls.slice();
			await expect(getAsyncLocalStorage()).rejects.toBe(error);
			expect(warn.mock.calls).toEqual(initialWarnings);
		});
	});
});
