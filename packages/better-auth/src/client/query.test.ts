// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./solid";
import { testClientPlugin } from "./test-plugin";

describe("useAuthQuery - error handling", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
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
});
