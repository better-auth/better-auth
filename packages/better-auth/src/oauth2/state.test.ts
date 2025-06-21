import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	generateState,
	parseState,
	generateVerificationState,
	parseVerificationState,
} from "./state";
import { getTestInstance } from "../test-utils/test-instance";
import type { OAuthStatePayload } from "./types";

// Helper function to create a basic OAuth state payload
function createTestPayload(
	overrides: Partial<OAuthStatePayload> = {},
): OAuthStatePayload {
	return {
		callbackURL: "/test",
		codeVerifier: "test-code-verifier",
		expiresAt: Date.now() + 60000, // 1 minute from now
		...overrides,
	};
}

describe("Configurable State Management", async () => {
	let auth: any;
	let authContext: any;
	let client: any;

	beforeEach(async () => {
		// Only create the test instance once
		if (!auth) {
			const instance = await getTestInstance();
			auth = instance.auth;
			authContext = await auth.$context;
			client = instance.client;
		}
	});

	afterEach(async () => {
		// Clean up verification values between tests
		if (authContext?.internalAdapter) {
			try {
				// Clear all verification values to ensure test isolation
				await authContext.internalAdapter.deleteAllVerificationValues?.();
			} catch (error) {
				// If the method doesn't exist, we'll skip cleanup
				// The test isolation should still work due to unique state values
			}
		}
		vi.clearAllMocks();
	});

	it("should use custom generateState when provided", async () => {
		const customState = "custom-state-123";

		// Create a new instance with custom state management
		const instance = await getTestInstance({
			oauth: {
				stateManagement: {
					generateState: async () => customState,
				},
			},
		});
		const testAuth = instance.auth;
		const testAuthContext = await testAuth.$context;

		// Test the generateState function directly with a real context
		const result = await generateState(
			{ context: testAuthContext, body: { callbackURL: "/test" } } as any,
			{ email: "test@example.com", userId: "123" },
		);

		expect(result.state).toBe(customState);
		expect(result.codeVerifier).toMatch(/^[a-zA-Z0-9_-]{128}$/);
	});

	it("should fallback to database when custom generateState returns undefined", async () => {
		const instance = await getTestInstance({
			oauth: {
				stateManagement: {
					generateState: async () => undefined,
				},
			},
		});
		const testAuth = instance.auth;
		const testAuthContext = await testAuth.$context;

		const result = await generateState({
			context: testAuthContext,
			body: { callbackURL: "/test" },
		} as any);

		expect(result.state).toMatch(/^[a-zA-Z0-9_-]{32}$/);
		expect(result.codeVerifier).toMatch(/^[a-zA-Z0-9_-]{128}$/);
	});

	it("should use custom parseState when provided", async () => {
		const customPayload = createTestPayload();

		const instance = await getTestInstance({
			oauth: {
				stateManagement: {
					parseState: async () => customPayload,
				},
			},
		});
		const testAuth = instance.auth;
		const testAuthContext = await testAuth.$context;

		const result = await parseState({
			context: testAuthContext,
			query: { state: "test-state" },
		} as any);

		expect(result).toEqual({
			...customPayload,
			errorURL: `${testAuthContext.baseURL}/error`,
		});
	});

	it("should fallback to database when custom parseState returns undefined", async () => {
		const instance = await getTestInstance({
			oauth: {
				stateManagement: {
					parseState: async () => undefined,
				},
			},
		});
		const testAuth = instance.auth;
		const testAuthContext = await testAuth.$context;

		// Create a context with a redirect function that throws
		const context = {
			context: testAuthContext,
			query: { state: "non-existent-state" },
			redirect: vi.fn(() => {
				throw new Error("redirect");
			}),
		} as any;

		await expect(parseState(context)).rejects.toThrow("redirect");
		expect(context.redirect).toHaveBeenCalledWith(
			`${testAuthContext.baseURL}/error?error=please_restart_the_process`,
		);
	});

	it("should pass correct payload to custom generateState", async () => {
		const mockGenerateState = vi.fn().mockResolvedValue("test-state");

		const instance = await getTestInstance({
			oauth: {
				stateManagement: {
					generateState: mockGenerateState,
				},
			},
		});
		const testAuth = instance.auth;
		const testAuthContext = await testAuth.$context;

		await generateState(
			{ context: testAuthContext, body: { callbackURL: "/test" } } as any,
			{ email: "test@example.com", userId: "123" },
		);

		expect(mockGenerateState).toHaveBeenCalledWith(
			expect.objectContaining({
				context: testAuthContext,
				body: { callbackURL: "/test" },
			}),
			expect.objectContaining({
				callbackURL: "/test",
				codeVerifier: expect.stringMatching(/^[a-zA-Z0-9_-]{128}$/),
				link: { email: "test@example.com", userId: "123" },
				expiresAt: expect.any(Number),
			}),
		);
	});

	it("should pass correct state to custom parseState", async () => {
		const mockParseState = vi.fn().mockResolvedValue(undefined);

		const instance = await getTestInstance({
			oauth: {
				stateManagement: {
					parseState: mockParseState,
				},
			},
		});
		const testAuth = instance.auth;
		const testAuthContext = await testAuth.$context;

		const context = {
			context: testAuthContext,
			query: { state: "test-state-123" },
		} as any;

		try {
			await parseState(context);
		} catch {
			// Expected to fail
		}

		expect(mockParseState).toHaveBeenCalledWith(context, "test-state-123");
	});

	it("should maintain backward compatibility when no custom state management is configured", async () => {
		// Use the default instance without custom state management
		const result = await generateState({
			context: authContext,
			body: { callbackURL: "/test" },
		} as any);

		expect(result.state).toMatch(/^[a-zA-Z0-9_-]{32}$/);
		expect(result.codeVerifier).toMatch(/^[a-zA-Z0-9_-]{128}$/);
	});

	it("should use generateVerificationState with correct expiresAt from payload", async () => {
		const payload = createTestPayload();

		const state = await generateVerificationState(
			{ context: authContext, body: { callbackURL: "/test" } } as any,
			payload,
		);

		expect(state).toMatch(/^[a-zA-Z0-9_-]{32}$/);

		const verification =
			await authContext.internalAdapter.findVerificationValue(state);
		expect(verification).toBeTruthy();
		expect(verification!.expiresAt.getTime()).toBeCloseTo(
			payload.expiresAt,
			-2,
		);
	});

	it("should use parseVerificationState with expiration checking and cleanup", async () => {
		// First create a verification
		const payload = createTestPayload();

		const state = await generateVerificationState(
			{ context: authContext, body: { callbackURL: "/test" } } as any,
			payload,
		);

		// Now parse it back
		const parsedData = await parseVerificationState(
			{ context: authContext, query: { state } } as any,
			state,
		);

		expect(parsedData).toEqual(payload);

		// The verification should be deleted immediately after parsing
		const verification =
			await authContext.internalAdapter.findVerificationValue(state);
		expect(verification).toBeUndefined();
	});

	it("should work with stateless state management example", async () => {
		const instance = await getTestInstance({
			oauth: {
				stateManagement: {
					generateState: async (ctx: any, payload: any) => {
						return Buffer.from(JSON.stringify(payload)).toString("base64");
					},
					parseState: async (ctx: any, state: string) => {
						try {
							const decoded = Buffer.from(state, "base64").toString();
							return JSON.parse(decoded);
						} catch {
							return undefined; // Fallback to database
						}
					},
				},
			},
		});
		const testAuth = instance.auth;
		const testAuthContext = await testAuth.$context;

		// Generate state
		const result = await generateState({
			context: testAuthContext,
			body: { callbackURL: "/test" },
		} as any);

		expect(result.state).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 format
		expect(result.codeVerifier).toMatch(/^[a-zA-Z0-9_-]{128}$/);

		// Verify no verification was created in database
		const verification =
			await testAuthContext.internalAdapter.findVerificationValue(result.state);
		expect(verification).toBeUndefined();

		// Parse state
		const parsedData = await parseState({
			context: testAuthContext,
			query: { state: result.state },
		} as any);

		expect(parsedData.callbackURL).toBe("/test");
		expect(parsedData.codeVerifier).toBe(result.codeVerifier);
	});
});
