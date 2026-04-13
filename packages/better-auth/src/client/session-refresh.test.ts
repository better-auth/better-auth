// @vitest-environment happy-dom

import { atom } from "nanostores";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalBroadcastChannel } from "./broadcast-channel";
import { getGlobalOnlineManager } from "./online-manager";
import { createSessionRefreshManager } from "./session-refresh";

describe("session-refresh", () => {
	beforeEach(() => {
		const onlineManager = getGlobalOnlineManager();
		onlineManager.setOnline(true);
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		delete (globalThis as any)[Symbol.for("better-auth:broadcast-channel")];
		delete (globalThis as any)[Symbol.for("better-auth:focus-manager")];
		delete (globalThis as any)[Symbol.for("better-auth:online-manager")];
	});

	it("should call fetchSession when refetchInterval fires", async () => {
		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
			options: {
				sessionOptions: {
					refetchInterval: 5,
				},
			},
		});

		manager.init();
		expect(mockFetchSession).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5000);
		expect(mockFetchSession).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(5000);
		expect(mockFetchSession).toHaveBeenCalledTimes(2);

		manager.cleanup();
	});

	it("should rate limit refetch on focus if a session request was made recently", () => {
		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
			options: {
				sessionOptions: {
					refetchOnWindowFocus: true,
				},
			},
		});

		manager.init();

		// Trigger a poll event to set lastSessionRequest
		manager.triggerRefetch({ event: "poll" });
		expect(mockFetchSession).toHaveBeenCalledTimes(1);

		// Immediately trigger a focus event (within rate limit window)
		manager.triggerRefetch({ event: "visibilitychange" });

		// Should be rate-limited
		expect(mockFetchSession).toHaveBeenCalledTimes(1);

		manager.cleanup();
	});

	it("should allow refetch on focus after rate limit window expires", async () => {
		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
			options: {
				sessionOptions: {
					refetchOnWindowFocus: true,
				},
			},
		});

		manager.init();

		// Trigger a poll event to set lastSessionRequest
		manager.triggerRefetch({ event: "poll" });
		expect(mockFetchSession).toHaveBeenCalledTimes(1);

		// Advance time past the rate limit window (5 seconds)
		await vi.advanceTimersByTimeAsync(6000);

		// Now trigger a focus event
		manager.triggerRefetch({ event: "visibilitychange" });
		expect(mockFetchSession).toHaveBeenCalledTimes(2);

		manager.cleanup();
	});

	it("should rate limit refetch on focus even after a visibilitychange fetch", async () => {
		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
			options: {
				sessionOptions: {
					refetchOnWindowFocus: true,
				},
			},
		});

		manager.init();

		// Trigger a visibilitychange event
		manager.triggerRefetch({ event: "visibilitychange" });
		expect(mockFetchSession).toHaveBeenCalledTimes(1);

		// Immediately trigger another focus event (within rate limit window)
		manager.triggerRefetch({ event: "visibilitychange" });
		expect(mockFetchSession).toHaveBeenCalledTimes(1);

		manager.cleanup();
	});

	it("should not refetch when offline unless refetchWhenOffline is true", () => {
		const onlineManager = getGlobalOnlineManager();
		onlineManager.setOnline(true);
		onlineManager.setOnline(false);

		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
			options: {
				sessionOptions: {
					refetchWhenOffline: false,
				},
			},
		});

		expect(onlineManager.isOnline).toBe(false);

		manager.triggerRefetch({ event: "visibilitychange" });
		expect(mockFetchSession).not.toHaveBeenCalled();

		manager.cleanup();
		onlineManager.setOnline(true);
	});

	it("should call fetchSession for storage events", async () => {
		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
		});

		manager.init();

		manager.triggerRefetch({ event: "storage" });
		expect(mockFetchSession).toHaveBeenCalledTimes(1);

		manager.cleanup();
	});

	it("should call fetchSession when $sessionSignal is flipped", async () => {
		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
		});

		manager.init();

		// Flip the signal (simulates proxy atomListener after auth action)
		sessionSignal.set(!sessionSignal.get());
		await vi.runAllTimersAsync();

		expect(mockFetchSession).toHaveBeenCalledTimes(1);

		manager.cleanup();
	});

	it("should broadcast session update with signout", () => {
		const channel = getGlobalBroadcastChannel();
		const postSpy = vi.spyOn(channel, "post");

		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
		});

		manager.init();
		manager.broadcastSessionUpdate("signout");

		expect(postSpy).toHaveBeenCalledWith(
			expect.objectContaining({ data: { trigger: "signout" } }),
		);

		manager.cleanup();
	});

	it("should broadcast session update with updateUser", () => {
		const channel = getGlobalBroadcastChannel();
		const postSpy = vi.spyOn(channel, "post");

		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
		});

		manager.init();
		manager.broadcastSessionUpdate("updateUser");

		expect(postSpy).toHaveBeenCalledWith(
			expect.objectContaining({ data: { trigger: "updateUser" } }),
		);

		manager.cleanup();
	});

	it("should clean up all subscriptions", () => {
		const sessionSignal = atom(false);
		const mockFetchSession = vi.fn(async () => {});

		const manager = createSessionRefreshManager({
			fetchSession: mockFetchSession,
			sessionSignal,
			options: {
				sessionOptions: {
					refetchInterval: 5,
					refetchOnWindowFocus: true,
				},
			},
		});

		manager.init();
		manager.cleanup();

		// After cleanup, signal flips should not trigger fetchSession
		sessionSignal.set(!sessionSignal.get());
		expect(mockFetchSession).not.toHaveBeenCalled();
	});
});
