// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientConfig } from "./config.js";
import { createDynamicPathProxy } from "./proxy.js";

describe("createDynamicPathProxy", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("default atomListeners matcher covers session-rotating endpoints", () => {
		const { atomListeners } = getClientConfig();
		expect(atomListeners).toBeDefined();
		const matcher = atomListeners![0]!.matcher;

		// existing entries (regression coverage)
		expect(matcher("/sign-in/email")).toBe(true);
		expect(matcher("/sign-up/email")).toBe(true);
		expect(matcher("/sign-out")).toBe(true);
		expect(matcher("/change-email")).toBe(true);
		expect(matcher("/revoke-session")).toBe(true);
		expect(matcher("/revoke-sessions")).toBe(true);

		// session-rotating endpoints that must trigger a refetch
		expect(matcher("/change-password")).toBe(true);
		expect(matcher("/revoke-other-sessions")).toBe(true);

		// non-mutating reads should not toggle the signal
		expect(matcher("/get-session")).toBe(false);
		expect(matcher("/list-sessions")).toBe(false);
	});

	it("triggers $sessionSignal toggle through the proxy on /change-password", async () => {
		const client = vi.fn(async (path, options) => {
			if (options?.onSuccess) {
				await options.onSuccess({} as any);
			}
			return {
				data: {},
				error: null,
			};
		});

		const signalSet = vi.fn();
		const atoms = {
			$sessionSignal: {
				get: () => false,
				set: signalSet,
				subscribe: () => () => {},
				listen: () => () => {},
				off: () => {},
				value: false,
			} as any,
		};

		const { atomListeners } = getClientConfig();

		const proxy = createDynamicPathProxy(
			{ changePassword: {} },
			client as any,
			{ "/change-password": "POST" },
			atoms,
			atomListeners,
		);

		vi.useFakeTimers();
		await (proxy.changePassword as any)({
			currentPassword: "old",
			newPassword: "new",
			revokeOtherSessions: true,
		});
		vi.runAllTimers();

		expect(client).toHaveBeenCalled();
		expect(signalSet).toHaveBeenCalledTimes(1);
	});

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
