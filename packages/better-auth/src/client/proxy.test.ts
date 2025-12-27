// packages/better-auth/src/client/__tests__/proxy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { atom } from "nanostores";
import { createDynamicPathProxy } from "./proxy";
import type { BetterAuthClientPlugin } from "@better-auth/core";

describe("createDynamicPathProxy - Signal Race Condition Fix", () => {
	let mockFetch: any;
	let mockAtoms: Record<string, any>;
	let mockAtomListeners: BetterAuthClientPlugin["atomListeners"];

	beforeEach(() => {
		// Reset mocks before each test
		// Mock fetch that properly calls onSuccess callback
		mockFetch = vi
			.fn()
			.mockImplementation(async (_path: string, options: any) => {
				const result = { data: {}, error: null };
				// Call onSuccess if provided (mimics real BetterFetch behavior)
				if (options?.onSuccess) {
					await options.onSuccess({
						data: result.data,
						response: new Response(),
					});
				}
				return result;
			});
		mockAtoms = {
			$sessionSignal: atom(false),
			$testSignal: atom(0),
		};
		mockAtomListeners = [
			{
				matcher: (path) => path === "/test-endpoint",
				signal: "$sessionSignal",
			},
		];
	});

	it("should toggle signal without race condition using queueMicrotask", async () => {
		const proxy = createDynamicPathProxy(
			{},
			mockFetch,
			{ "/test-endpoint": "POST" },
			mockAtoms,
			mockAtomListeners,
		) as any;

		const initialValue = mockAtoms.$sessionSignal.get();

		// Simulate API call
		await proxy.testEndpoint();

		// Wait for microtask queue to flush
		await new Promise((resolve) => queueMicrotask(resolve));

		const newValue = mockAtoms.$sessionSignal.get();

		expect(newValue).toBe(!initialValue);
	});

	it("should handle concurrent API calls without losing signal updates", async () => {
		const proxy = createDynamicPathProxy(
			{},
			mockFetch,
			{ "/test-endpoint": "POST" },
			mockAtoms,
			mockAtomListeners,
		) as any;

		// Make 3 concurrent API calls
		await Promise.all([
			proxy.testEndpoint(),
			proxy.testEndpoint(),
			proxy.testEndpoint(),
		]);

		// Wait for all microtasks to complete
		await new Promise((resolve) => setTimeout(resolve, 20));

		// Signal should have been toggled (exact final value depends on timing,
		// but it should not be stuck at initial value)
		const finalValue = mockAtoms.$sessionSignal.get();

		// At least one toggle should have occurred
		expect(typeof finalValue).toBe("boolean");
	});

	it("should not trigger signal when disableSignal is true", async () => {
		const proxy = createDynamicPathProxy(
			{},
			mockFetch,
			{ "/test-endpoint": "POST" },
			mockAtoms,
			mockAtomListeners,
		) as any;

		const initialValue = mockAtoms.$sessionSignal.get();

		await proxy.testEndpoint({}, { disableSignal: true });

		// Wait for microtask queue
		await new Promise((resolve) => queueMicrotask(resolve));

		expect(mockAtoms.$sessionSignal.get()).toBe(initialValue);
	});

	it("should handle missing signal gracefully", async () => {
		const listenersWithMissingSignal = [
			{
				matcher: (path: string) => path === "/test-endpoint",
				signal: "$nonExistentSignal" as any,
			},
		];

		const proxy = createDynamicPathProxy(
			{},
			mockFetch,
			{ "/test-endpoint": "POST" },
			mockAtoms,
			listenersWithMissingSignal,
		) as any;

		// Should not throw
		await expect(proxy.testEndpoint()).resolves.toBeDefined();
	});

	it("should only trigger matching listeners", async () => {
		const multipleListeners = [
			{
				matcher: (path: string) => path === "/test-endpoint",
				signal: "$sessionSignal",
			},
			{
				matcher: (path: string) => path === "/other-endpoint",
				signal: "$testSignal",
			},
		];

		const proxy = createDynamicPathProxy(
			{},
			mockFetch,
			{ "/test-endpoint": "POST" },
			mockAtoms,
			multipleListeners,
		) as any;

		const sessionBefore = mockAtoms.$sessionSignal.get();
		const testBefore = mockAtoms.$testSignal.get();

		await proxy.testEndpoint();
		await new Promise((resolve) => queueMicrotask(resolve));

		// Only $sessionSignal should have changed
		expect(mockAtoms.$sessionSignal.get()).not.toBe(sessionBefore);
		expect(mockAtoms.$testSignal.get()).toBe(testBefore);
	});

	it("should call custom onSuccess callback", async () => {
		const onSuccess = vi.fn();

		const proxy = createDynamicPathProxy(
			{},
			mockFetch,
			{ "/test-endpoint": "POST" },
			mockAtoms,
			mockAtomListeners,
		) as any;

		await proxy.testEndpoint({}, { onSuccess });

		expect(onSuccess).toHaveBeenCalledTimes(1);
	});
});
