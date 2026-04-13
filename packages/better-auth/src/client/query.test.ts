// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalFocusManager } from "./focus-manager";
import { createAuthClient } from "./solid";
import { testClientPlugin } from "./test-plugin";

/**
 * @see https://github.com/better-auth/better-auth/issues/8420
 */
describe("useAuthQuery - error handling", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		delete (globalThis as any)[Symbol.for("better-auth:broadcast-channel")];
		delete (globalThis as any)[Symbol.for("better-auth:focus-manager")];
		delete (globalThis as any)[Symbol.for("better-auth:online-manager")];
	});

	it("should preserve stale data on network error (fetch throws)", async () => {
		let shouldFail = false;

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (_url) => {
					if (shouldFail) {
						throw new TypeError("Failed to fetch");
					}
					return new Response(
						JSON.stringify({
							user: { id: "1", email: "test@test.com" },
							session: { id: "session-1" },
						}),
					);
				},
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});
		expect(session().error).toBeNull();

		// Network failure on refetch
		shouldFail = true;
		await session().refetch();
		await vi.runAllTimersAsync();

		// Stale data should be preserved
		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});
	});

	it("should clear data on 401 unauthorized response", async () => {
		let returnUnauthorized = false;

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url) => {
					const urlStr = typeof url === "string" ? url : url.toString();
					if (returnUnauthorized && urlStr.includes("/get-session")) {
						return new Response(JSON.stringify({ message: "Unauthorized" }), {
							status: 401,
						});
					}
					return new Response(
						JSON.stringify({
							user: { id: "1", email: "test@test.com" },
							session: { id: "session-1" },
						}),
					);
				},
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});

		// Refetch with 401
		returnUnauthorized = true;
		await session().refetch();
		await vi.runAllTimersAsync();

		expect(session().data).toBeNull();
	});

	it("should preserve stale data on 500 server error", async () => {
		let returnServerError = false;

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url) => {
					const urlStr = typeof url === "string" ? url : url.toString();
					if (returnServerError && urlStr.includes("/get-session")) {
						return new Response(
							JSON.stringify({ message: "Internal Server Error" }),
							{ status: 500 },
						);
					}
					return new Response(
						JSON.stringify({
							user: { id: "1", email: "test@test.com" },
							session: { id: "session-1" },
						}),
					);
				},
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});

		// Refetch with 500
		returnServerError = true;
		await session().refetch();
		await vi.runAllTimersAsync();

		// Stale data should be preserved on 500
		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});
	});

	it("should preserve the session data reference when refetch returns identical data", async () => {
		const getSessionPayload = () => ({
			user: { id: "1", email: "test@test.com" },
			session: { id: "session-1" },
		});

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async () =>
					new Response(JSON.stringify(getSessionPayload())),
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		const initialData = session().data;
		expect(initialData).not.toBeNull();

		await session().refetch();
		await vi.runAllTimersAsync();

		// Reference should be preserved because data is structurally identical
		expect(session().data).toBe(initialData);
	});

	it("should avoid an extra post-focus session fetch when the refreshed payload is unchanged", async () => {
		let fetchCallCount = 0;
		const getSessionPayload = () => ({
			user: { id: "1", email: "test@test.com" },
			session: { id: "session-1" },
		});

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			sessionOptions: {
				refetchOnWindowFocus: true,
			},
			fetchOptions: {
				customFetchImpl: async () => {
					fetchCallCount++;
					return new Response(JSON.stringify(getSessionPayload()));
				},
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		const initialData = session().data;
		expect(fetchCallCount).toBe(1);

		getGlobalFocusManager().setFocused(true);
		await vi.runAllTimersAsync();

		// Only 2 fetches: initial + focus refetch (no double-fetch)
		expect(fetchCallCount).toBe(2);
		expect(session().data).toBe(initialData);
	});
});
