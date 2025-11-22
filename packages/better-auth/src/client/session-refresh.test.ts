// @vitest-environment happy-dom

import { atom } from "nanostores";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalOnlineManager } from "./online-manager";
import { createSessionRefreshManager } from "./session-refresh";

describe("session-refresh", () => {
	beforeEach(() => {
		// Reset online manager state before each test
		const onlineManager = getGlobalOnlineManager();
		onlineManager.setOnline(true);
	});

	it("should trigger network fetch and update session when refetchInterval fires", async () => {
		vi.useFakeTimers();

		const sessionAtom = atom({
			data: {
				user: { id: "1", email: "old@test.com" },
				session: { id: "session-1" },
			},
			error: null,
			isPending: false,
		});
		const sessionSignal = atom(false);

		const updatedSessionData = {
			user: { id: "1", email: "new@test.com" },
			session: { id: "session-1" },
		};

		let fetchCallCount = 0;
		const mockFetch = vi.fn(async (url: string) => {
			fetchCallCount++;
			return {
				data: updatedSessionData,
				error: null,
			};
		});

		const manager = createSessionRefreshManager({
			sessionAtom,
			sessionSignal,
			$fetch: mockFetch as any,
			options: {
				sessionOptions: {
					refetchInterval: 5, // 5 seconds
				},
			},
		});

		manager.init();

		expect(fetchCallCount).toBe(0);

		await vi.advanceTimersByTimeAsync(5000);

		expect(fetchCallCount).toBe(1);
		expect(mockFetch).toHaveBeenCalledWith("/get-session");

		const updatedSession = sessionAtom.get();
		expect(updatedSession.data).toEqual(updatedSessionData);
		expect(updatedSession.error).toBeNull();

		manager.cleanup();
		vi.useRealTimers();
	});

	it("should rate limit refetch on focus if a session request was made recently", async () => {
		vi.useFakeTimers();

		const sessionAtom = atom({
			data: {
				user: { id: "1", email: "test@test.com" },
				session: { id: "session-1" },
			},
			error: null,
			isPending: false,
			isRefetching: false,
		});
		const sessionSignal = atom(false);

		let signalChangeCount = 0;
		const unsubscribeSignal = sessionSignal.subscribe(() => {
			signalChangeCount++;
		});

		const mockFetch = vi.fn(async () => ({
			data: { user: { id: "1" }, session: { id: "session-1" } },
			error: null,
		}));

		const manager = createSessionRefreshManager({
			sessionAtom,
			sessionSignal,
			$fetch: mockFetch as any,
			options: {
				sessionOptions: {
					refetchOnWindowFocus: true,
				},
			},
		});

		manager.init();

		// Trigger a poll event to set lastSessionRequest
		manager.triggerRefetch({ event: "poll" });
		await vi.runAllTimersAsync();

		const initialSignalCount = signalChangeCount;

		// Immediately trigger a focus event (within rate limit window)
		manager.triggerRefetch({ event: "visibilitychange" });

		// Signal should not change because rate limit prevents refetch
		expect(signalChangeCount).toBe(initialSignalCount);

		unsubscribeSignal();
		manager.cleanup();
		vi.useRealTimers();
	});

	it("should allow refetch on focus after rate limit window expires", async () => {
		vi.useFakeTimers();

		const sessionAtom = atom({
			data: {
				user: { id: "1", email: "test@test.com" },
				session: { id: "session-1" },
			},
			error: null,
			isPending: false,
		});
		const sessionSignal = atom(false);

		let signalChangeCount = 0;
		const unsubscribeSignal = sessionSignal.subscribe(() => {
			signalChangeCount++;
		});

		const mockFetch = vi.fn(async () => ({
			data: { user: { id: "1" }, session: { id: "session-1" } },
			error: null,
		}));

		const manager = createSessionRefreshManager({
			sessionAtom,
			sessionSignal,
			$fetch: mockFetch as any,
			options: {
				sessionOptions: {
					refetchOnWindowFocus: true,
				},
			},
		});

		manager.init();

		// Trigger a poll event to set lastSessionRequest
		manager.triggerRefetch({ event: "poll" });
		await vi.runAllTimersAsync();

		const initialSignalCount = signalChangeCount;

		// Advance time by 6 seconds (more than the 5 second rate limit)
		await vi.advanceTimersByTimeAsync(6000);

		// Now trigger a focus event (after rate limit window)
		manager.triggerRefetch({ event: "visibilitychange" });

		// Signal should change because rate limit has expired
		expect(signalChangeCount).toBeGreaterThan(initialSignalCount);

		unsubscribeSignal();
		manager.cleanup();
		vi.useRealTimers();
	});

	it("should allow refetch on focus when session is null even within rate limit", async () => {
		vi.useFakeTimers();

		const sessionAtom = atom({
			data: {
				user: { id: "1", email: "test@test.com" },
				session: { id: "session-1" },
			},
			error: null,
			isPending: false,
		});
		const sessionSignal = atom(false);

		let signalChangeCount = 0;
		const unsubscribeSignal = sessionSignal.subscribe(() => {
			signalChangeCount++;
		});

		const mockFetch = vi.fn(async () => ({
			data: { user: { id: "1" }, session: { id: "session-1" } },
			error: null,
		}));

		const manager = createSessionRefreshManager({
			sessionAtom,
			sessionSignal,
			$fetch: mockFetch as any,
			options: {
				sessionOptions: {
					refetchOnWindowFocus: true,
				},
			},
		});

		manager.init();

		// Trigger a visibilitychange event with session data to set lastSessionRequest
		manager.triggerRefetch({ event: "visibilitychange" });
		const signalCountAfterFirstFocus = signalChangeCount;
		expect(signalCountAfterFirstFocus).toBeGreaterThan(0);

		// Now set session to null and trigger another focus event
		sessionAtom.set({
			data: null as any,
			error: null,
			isPending: false,
		});

		// Immediately trigger another focus event (within rate limit window)
		manager.triggerRefetch({ event: "visibilitychange" });

		// Signal should change because session is null (rate limit bypassed)
		expect(signalChangeCount).toBeGreaterThan(signalCountAfterFirstFocus);

		unsubscribeSignal();
		manager.cleanup();
		vi.useRealTimers();
	});

	it("should allow refetch on focus when session is undefined even within rate limit", async () => {
		vi.useFakeTimers();

		const sessionAtom = atom({
			data: {
				user: { id: "1", email: "test@test.com" },
				session: { id: "session-1" },
			},
			error: null,
			isPending: false,
		});
		const sessionSignal = atom(false);

		let signalChangeCount = 0;
		const unsubscribeSignal = sessionSignal.subscribe(() => {
			signalChangeCount++;
		});

		const mockFetch = vi.fn(async () => ({
			data: { user: { id: "1" }, session: { id: "session-1" } },
			error: null,
		}));

		const manager = createSessionRefreshManager({
			sessionAtom,
			sessionSignal,
			$fetch: mockFetch as any,
			options: {
				sessionOptions: {
					refetchOnWindowFocus: true,
				},
			},
		});

		manager.init();

		// Trigger a visibilitychange event with session data to set lastSessionRequest
		manager.triggerRefetch({ event: "visibilitychange" });
		const signalCountAfterFirstFocus = signalChangeCount;
		expect(signalCountAfterFirstFocus).toBeGreaterThan(0);

		// Now set session to undefined and trigger another focus event
		sessionAtom.set({
			data: undefined as any,
			error: null,
			isPending: false,
		});

		// Immediately trigger another focus event (within rate limit window)
		manager.triggerRefetch({ event: "visibilitychange" });

		// Signal should change because session is undefined (rate limit bypassed)
		expect(signalChangeCount).toBeGreaterThan(signalCountAfterFirstFocus);

		unsubscribeSignal();
		manager.cleanup();
		vi.useRealTimers();
	});

	it("should update lastSessionRequest when poll event triggers fetch", async () => {
		vi.useFakeTimers();

		const sessionAtom = atom({
			data: {
				user: { id: "1", email: "test@test.com" },
				session: { id: "session-1" },
			},
			error: null,
			isPending: false,
		});
		const sessionSignal = atom(false);

		let signalChangeCount = 0;
		const unsubscribeSignal = sessionSignal.subscribe(() => {
			signalChangeCount++;
		});

		const mockFetch = vi.fn(async () => ({
			data: { user: { id: "1" }, session: { id: "session-1" } },
			error: null,
		}));

		const manager = createSessionRefreshManager({
			sessionAtom,
			sessionSignal,
			$fetch: mockFetch as any,
		});

		// Trigger a poll event - this will trigger a signal change
		manager.triggerRefetch({ event: "poll" });
		await vi.runAllTimersAsync();

		const signalCountAfterPoll = signalChangeCount;
		expect(signalCountAfterPoll).toBeGreaterThan(0);

		// Immediately trigger a focus event - should be rate limited
		manager.triggerRefetch({ event: "visibilitychange" });

		// Should be rate limited (no additional signal change)
		expect(signalChangeCount).toBe(signalCountAfterPoll);

		unsubscribeSignal();
		manager.cleanup();
		vi.useRealTimers();
	});

	it("should not refetch when offline unless refetchWhenOffline is true", () => {
		const onlineManager = getGlobalOnlineManager();
		// Ensure we start online, then set offline
		onlineManager.setOnline(true);
		onlineManager.setOnline(false);

		const sessionAtom = atom({
			data: {
				user: { id: "1", email: "test@test.com" },
				session: { id: "session-1" },
			},
			error: null,
			isPending: false,
		});
		const sessionSignal = atom(false);

		// Track signal changes from the start
		let signalChangeCount = 0;
		const unsubscribeSignal = sessionSignal.subscribe(() => {
			signalChangeCount++;
		});

		const mockFetch = vi.fn(async () => ({
			data: { user: { id: "1" }, session: { id: "session-1" } },
			error: null,
		}));

		const manager = createSessionRefreshManager({
			sessionAtom,
			sessionSignal,
			$fetch: mockFetch as any,
			options: {
				sessionOptions: {
					refetchWhenOffline: false,
				},
			},
		});

		// Verify we're offline
		expect(onlineManager.isOnline).toBe(false);

		// Get initial signal count (should be 0, but capture it)
		const initialSignalCount = signalChangeCount;

		// Trigger refetch - should be blocked by shouldRefetch() returning false
		manager.triggerRefetch({ event: "visibilitychange" });

		// Should not refetch when offline (shouldRefetch returns false)
		// Signal count should remain the same
		expect(signalChangeCount).toBe(initialSignalCount);
		expect(mockFetch).not.toHaveBeenCalled();

		unsubscribeSignal();
		manager.cleanup();
		onlineManager.setOnline(true);
	});
});
