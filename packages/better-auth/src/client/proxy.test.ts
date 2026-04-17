// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { twoFactorClient } from "../plugins/two-factor/client";
import { getClientConfig } from "./config";
import { createDynamicPathProxy } from "./proxy";

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

	it("should not toggle $sessionSignal for paused two-factor challenges", async () => {
		const client = vi.fn(async (path, options) => {
			const challengeData = {
				type: "challenge",
				challenge: {
					type: "two-factor",
					attemptId: "attempt-id",
					availableMethods: ["otp"],
				},
			};
			if (options?.onSuccess) {
				await options.onSuccess({
					data: challengeData,
				} as any);
			}
			return {
				data: challengeData,
				error: null,
			};
		});
		const knownPathMethods = {
			"/test": "POST",
		} as const;

		const sessionSignalSet = vi.fn();
		const otherSignalSet = vi.fn();

		const atoms = {
			$sessionSignal: {
				get: vi.fn(() => false),
				set: sessionSignalSet,
				subscribe: () => () => {},
				listen: () => () => {},
				off: () => {},
				value: false,
			} as any,
			otherSignal: {
				get: vi.fn(() => false),
				set: otherSignalSet,
				subscribe: () => () => {},
				listen: () => () => {},
				off: () => {},
				value: false,
			} as any,
		};
		const atomListeners = [
			{
				matcher: (path: string) => path === "/test",
				signal: "$sessionSignal",
			},
			{
				matcher: (path: string) => path === "/test",
				signal: "otherSignal",
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
		vi.runAllTimers();

		expect(sessionSignalSet).not.toHaveBeenCalled();
		expect(otherSignalSet).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});

	it("should not toggle $sessionSignal for session-neutral two-factor actions", async () => {
		const client = vi.fn(async (_path, options) => {
			if (options?.onSuccess) {
				await options.onSuccess({
					data: {
						status: true,
					},
				} as any);
			}
			return {
				data: {
					status: true,
				},
				error: null,
			};
		});
		const plugin = twoFactorClient();
		const signalSet = vi.fn();
		const atoms = {
			$sessionSignal: {
				get: vi.fn(() => false),
				set: signalSet,
				subscribe: () => () => {},
				listen: () => () => {},
				off: () => {},
				value: false,
			} as any,
		};

		const proxy = createDynamicPathProxy(
			{
				twoFactor: {
					sendOtp: {},
				},
			},
			client as any,
			plugin.pathMethods ?? {},
			atoms,
			plugin.atomListeners ?? [],
		);

		vi.useFakeTimers();

		await (proxy.twoFactor.sendOtp as any)();
		vi.runAllTimers();

		expect(signalSet).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	it("should still toggle $sessionSignal when two-factor verification finalizes auth", async () => {
		const client = vi.fn(async (_path, options) => {
			if (options?.onSuccess) {
				await options.onSuccess({
					data: {
						token: "session-token",
						user: {
							id: "user-id",
						},
					},
				} as any);
			}
			return {
				data: {
					token: "session-token",
					user: {
						id: "user-id",
					},
				},
				error: null,
			};
		});
		const plugin = twoFactorClient();
		const signalSet = vi.fn();
		const atoms = {
			$sessionSignal: {
				get: vi.fn(() => false),
				set: signalSet,
				subscribe: () => () => {},
				listen: () => () => {},
				off: () => {},
				value: false,
			} as any,
		};

		const proxy = createDynamicPathProxy(
			{
				twoFactor: {
					verifyOtp: {},
				},
			},
			client as any,
			plugin.pathMethods ?? {},
			atoms,
			plugin.atomListeners ?? [],
		);

		vi.useFakeTimers();

		await (proxy.twoFactor.verifyOtp as any)();
		vi.runAllTimers();

		expect(signalSet).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});
});
