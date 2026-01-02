import { describe, expect, it, vi } from "vitest";
import { createDynamicPathProxy } from "./proxy";

describe("createDynamicPathProxy", () => {
	it("should avoid duplicate signal processing", async () => {
		const client = vi.fn(async (path, options) => {
			if (options?.onSuccess) {
				await options.onSuccess({} as any);
			}
			return {
				data: {},
				error: null,
			};
		});
		const knownPathMethods = {
			"/test": "POST",
		} as const;

		const signalSet = vi.fn();
		const signalGet = vi.fn(() => false);

		const atoms = {
			testSignal: {
				get: signalGet,
				set: signalSet,
				subscribe: () => () => {},
				listen: () => () => {},
				off: () => {},
				value: false,
			} as any,
		};
		const atomListeners = [
			{
				matcher: (path: string) => path === "/test",
				signal: "testSignal",
			},
			{
				matcher: (path: string) => path === "/test",
				signal: "testSignal",
			},
		];

		const proxy = createDynamicPathProxy(
			{
				test: {},
			},
			client as any,
			knownPathMethods,
			atoms,
			atomListeners,
		);

		vi.useFakeTimers();

		await (proxy.test as any)();

		expect(client).toHaveBeenCalled();

		vi.runAllTimers();

		expect(signalSet).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});
});
