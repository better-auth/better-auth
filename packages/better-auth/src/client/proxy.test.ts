// packages/better-auth/src/client/proxy.test.ts

import type { BetterAuthClientPlugin } from "@better-auth/core";
import { atom } from "nanostores";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDynamicPathProxy } from "./proxy";

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

		const initialValue = mockAtoms.$sessionSignal.get();

		// Make 3 concurrent API calls
		await Promise.all([
			proxy.testEndpoint(),
			proxy.testEndpoint(),
			proxy.testEndpoint(),
		]);

		// Wait for all microtasks to complete
		await new Promise((resolve) => setTimeout(resolve, 20));

		const finalValue = mockAtoms.$sessionSignal.get();

		// 3 toggles (odd number) means final value should be opposite of initial
		// false -> true -> false -> true (3 toggles from false = true)
		expect(finalValue).toBe(!initialValue);
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

	it("should deduplicate signals when multiple listeners reference the same signal", async () => {
		// Create a signal with a spied set method to track call count
		const testSignal = atom(false);
		const setSpy = vi.spyOn(testSignal, "set");

		const testAtoms = {
			$sessionSignal: testSignal,
			$testSignal: atom(0),
		};

		// Multiple listeners that all reference the same signal
		const duplicateListeners = [
			{
				matcher: (path: string) => path === "/test-endpoint",
				signal: "$sessionSignal",
			},
			{
				matcher: (path: string) => path === "/test-endpoint",
				signal: "$sessionSignal",
			},
			{
				matcher: (path: string) => path === "/test-endpoint",
				signal: "$sessionSignal",
			},
		];

		const proxy = createDynamicPathProxy(
			{},
			mockFetch,
			{ "/test-endpoint": "POST" },
			testAtoms,
			duplicateListeners,
		) as any;

		await proxy.testEndpoint();
		await new Promise((resolve) => setTimeout(resolve, 20));

		// Signal's set method should be called exactly once, not 3 times
		expect(setSpy).toHaveBeenCalledTimes(1);
	});

	it("should continue processing other signals when one signal is missing", async () => {
		const listenersWithMissingAndValid = [
			{
				matcher: (path: string) => path === "/test-endpoint",
				signal: "$nonExistentSignal" as any,
			},
			{
				matcher: (path: string) => path === "/test-endpoint",
				signal: "$sessionSignal",
			},
		];

		const proxy = createDynamicPathProxy(
			{},
			mockFetch,
			{ "/test-endpoint": "POST" },
			mockAtoms,
			listenersWithMissingAndValid,
		) as any;

		const initialValue = mockAtoms.$sessionSignal.get();

		await proxy.testEndpoint();
		await new Promise((resolve) => queueMicrotask(resolve));

		// $sessionSignal should still be toggled even though $nonExistentSignal doesn't exist
		expect(mockAtoms.$sessionSignal.get()).toBe(!initialValue);
	});
});
