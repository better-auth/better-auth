// @vitest-environment happy-dom

import { atom } from "nanostores";
import { describe, expect, it, vi } from "vitest";
import { createSessionRefreshManager } from "./session-refresh";

describe("session-refresh", () => {
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
});
