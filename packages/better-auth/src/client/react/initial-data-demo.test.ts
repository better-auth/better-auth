// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useAuthQuery } from "../query";
import { getSessionAtom } from "../session-atom";
import { atom } from "nanostores";
import { createFetch } from "@better-fetch/fetch";

describe("Initial Data Feature Demo", () => {
	const mockSessionData = {
		user: {
			id: "1",
			email: "test@email.com",
			name: "Test User",
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date(),
			image: null,
		},
		session: {
			id: "session_1",
			userId: "1",
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			token: "session_token_123",
			ipAddress: "127.0.0.1",
			userAgent: "test-agent",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	};

	it("should demonstrate initial data prevents initial pending state", async () => {
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				return new Response(JSON.stringify(mockSessionData));
			},
		});

		// Without initial data - should start pending
		const $signal1 = atom<boolean>(false);
		const queryAtom1 = useAuthQuery($signal1, "/get-session", $fetch, {
			method: "GET",
		});

		expect(queryAtom1.get().isPending).toBe(true);
		expect(queryAtom1.get().data).toBe(null);

		// With initial data - should NOT be pending and have data immediately
		const $signal2 = atom<boolean>(false);
		const queryAtom2 = useAuthQuery(
			$signal2,
			"/get-session",
			$fetch,
			{ method: "GET" },
			mockSessionData,
		);

		expect(queryAtom2.get().isPending).toBe(false);
		expect(queryAtom2.get().data).toEqual(mockSessionData);
	});

	it("should demonstrate refetch works even with initial data", async () => {
		let fetchCallCount = 0;
		const updatedData = {
			...mockSessionData,
			user: { ...mockSessionData.user, name: "Updated User" },
		};

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCallCount++;
				return new Response(JSON.stringify(updatedData));
			},
		});

		const $signal = atom<boolean>(false);
		const queryAtom = useAuthQuery(
			$signal,
			"/get-session",
			$fetch,
			{ method: "GET" },
			mockSessionData,
		);

		// Should start with initial data
		expect(queryAtom.get().data?.user.name).toBe("Test User");
		expect(fetchCallCount).toBe(0);

		// Manually call refetch
		queryAtom.get().refetch();

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1);

		// Should now have made a fetch and updated the data
		expect(fetchCallCount).toBe(1);
		expect(queryAtom.get().data?.user.name).toBe("Updated User");
	});

	it("should demonstrate getSessionAtom integration", async () => {
		let fetchCallCount = 0;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCallCount++;
				return new Response(JSON.stringify(mockSessionData));
			},
		});

		// Without initial session
		const { session: session1 } = getSessionAtom($fetch);
		expect(session1.get().isPending).toBe(true);
		expect(session1.get().data).toBe(null);

		// With initial session
		const { session: session2 } = getSessionAtom($fetch, mockSessionData);
		expect(session2.get().isPending).toBe(false);
		expect(session2.get().data).toEqual(mockSessionData);

		// No fetch calls should have been made yet
		expect(fetchCallCount).toBe(0);
	});
});
