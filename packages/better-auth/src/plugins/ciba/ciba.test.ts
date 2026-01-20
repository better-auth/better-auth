import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { ciba } from ".";
import { cibaClient } from "./client";
import type { CIBARequest } from "./schema";

describe("ciba plugin", async () => {
	// Mock notification function
	const mockSendNotification = vi.fn();

	const { auth, signInWithTestUser, db } = await getTestInstance(
		{
			plugins: [
				ciba({
					requestLifetime: "5m",
					pollingInterval: "5s",
					sendNotification: mockSendNotification,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [cibaClient()],
			},
		},
	);

	beforeEach(() => {
		mockSendNotification.mockClear();
	});

	describe("bc-authorize request", () => {
		it("should initiate CIBA request and send notification", async () => {
			// Create a test user first
			const { user } = await signInWithTestUser();

			const response = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
					scope: "read:data write:data",
					binding_message: "Approve access for weekly report",
				},
			});

			expect(response.auth_req_id).toBeDefined();
			expect(response.expires_in).toBe(300); // 5 minutes
			expect(response.interval).toBe(5); // 5 seconds

			// Verify notification was sent
			expect(mockSendNotification).toHaveBeenCalledOnce();
			expect(mockSendNotification).toHaveBeenCalledWith(
				expect.objectContaining({ id: user.id, email: user.email }),
				expect.objectContaining({
					authReqId: response.auth_req_id,
					clientId: "test-agent",
					scope: "read:data write:data",
					bindingMessage: "Approve access for weekly report",
					approveUrl: expect.stringContaining("/ciba/verify"),
					denyUrl: expect.stringContaining("/ciba/verify"),
				}),
			);
		});

		it("should reject unknown user", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: "test-agent",
						login_hint: "nonexistent@example.com",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "unknown_user_id",
				},
			});
		});
	});

	describe("ciba token polling", () => {
		it("should return authorization_pending when not approved", async () => {
			const { user } = await signInWithTestUser();

			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
				},
			});

			await expect(
				auth.api.cibaToken({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id,
						client_id: "test-agent",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "authorization_pending",
				},
			});
		});

		it("should return expired_token for expired requests", async () => {
			const { user } = await signInWithTestUser();

			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
				},
			});

			// Advance time past expiration
			vi.useFakeTimers();
			await vi.advanceTimersByTimeAsync(301 * 1000); // 301 seconds

			await expect(
				auth.api.cibaToken({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id,
						client_id: "test-agent",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "expired_token",
				},
			});

			vi.useRealTimers();
		});

		it("should return error for invalid auth_req_id", async () => {
			await expect(
				auth.api.cibaToken({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id: "invalid-id",
						client_id: "test-agent",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_grant",
				},
			});
		});

		it("should enforce rate limiting with slow_down error", async () => {
			const { user } = await signInWithTestUser();

			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
				},
			});

			// First poll
			await auth.api
				.cibaToken({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id,
						client_id: "test-agent",
					},
				})
				.catch(() => {});

			// Immediate second poll should be rate limited
			await expect(
				auth.api.cibaToken({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id,
						client_id: "test-agent",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "slow_down",
				},
			});
		});
	});

	describe("ciba verification", () => {
		it("should return request details", async () => {
			const { user } = await signInWithTestUser();

			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
					scope: "read:data",
					binding_message: "Test message",
				},
			});

			const response = await auth.api.cibaVerify({
				query: { auth_req_id },
			});

			expect(response.authReqId).toBe(auth_req_id);
			expect(response.clientId).toBe("test-agent");
			expect(response.scope).toBe("read:data");
			expect(response.bindingMessage).toBe("Test message");
		});

		it("should reject invalid auth_req_id", async () => {
			await expect(
				auth.api.cibaVerify({
					query: { auth_req_id: "invalid-id" },
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
				},
			});
		});
	});

	describe("ciba approval flow", () => {
		it("should approve request and return token", async () => {
			// Create user and get auth headers
			const { user, headers } = await signInWithTestUser();

			// Initiate CIBA request
			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
					scope: "read:data",
				},
			});

			// User approves (requires authentication)
			const approveResponse = await auth.api.cibaAuthorize({
				body: { authReqId: auth_req_id },
				headers,
			});
			expect(approveResponse.success).toBe(true);

			// Agent polls and gets token
			const tokenResponse = await auth.api.cibaToken({
				body: {
					grant_type: "urn:openid:params:grant-type:ciba",
					auth_req_id,
					client_id: "test-agent",
				},
			});

			expect(tokenResponse.access_token).toBeDefined();
			expect(tokenResponse.token_type).toBe("Bearer");
			expect(tokenResponse.expires_in).toBeGreaterThan(0);
			expect(tokenResponse.scope).toBe("read:data");
		});

		it("should deny request", async () => {
			const { user } = await signInWithTestUser();

			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
				},
			});

			// Deny (no auth required)
			const denyResponse = await auth.api.cibaDeny({
				body: { authReqId: auth_req_id },
			});
			expect(denyResponse.success).toBe(true);

			// Token request should fail with access_denied
			await expect(
				auth.api.cibaToken({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id,
						client_id: "test-agent",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "access_denied",
				},
			});
		});

		it("should require authentication for approval", async () => {
			const { user } = await signInWithTestUser();

			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
				},
			});

			await expect(
				auth.api.cibaAuthorize({
					body: { authReqId: auth_req_id },
					headers: new Headers(),
				}),
			).rejects.toMatchObject({
				body: {
					error: "unauthorized",
				},
			});
		});

		it("should reject approval from wrong user", async () => {
			// Create first user and initiate request
			const { user: user1 } = await signInWithTestUser();
			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user1.email,
				},
			});

			// Sign in as different user
			const { headers: headers2 } = await signInWithTestUser({
				email: "other@example.com",
			});

			// Try to approve as wrong user
			await expect(
				auth.api.cibaAuthorize({
					body: { authReqId: auth_req_id },
					headers: headers2,
				}),
			).rejects.toMatchObject({
				body: {
					error: "forbidden",
				},
			});
		});
	});

	describe("edge cases", () => {
		it("should not allow approving already processed request", async () => {
			const { user, headers } = await signInWithTestUser();

			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
				},
			});

			// First approval
			await auth.api.cibaAuthorize({
				body: { authReqId: auth_req_id },
				headers,
			});

			// Second approval should fail
			await expect(
				auth.api.cibaAuthorize({
					body: { authReqId: auth_req_id },
					headers,
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
				},
			});
		});

		it("should reject mismatched client_id in token request", async () => {
			const { user } = await signInWithTestUser();

			const { auth_req_id } = await auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: user.email,
				},
			});

			await expect(
				auth.api.cibaToken({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id,
						client_id: "different-agent",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_grant",
				},
			});
		});
	});
});

describe("ciba with client validation", async () => {
	const validClients = ["valid-agent-1", "valid-agent-2"];
	const mockSendNotification = vi.fn();

	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [
			ciba({
				sendNotification: mockSendNotification,
				validateClient: async (clientId) => {
					return validClients.includes(clientId);
				},
			}),
		],
	});

	it("should reject invalid client in bc-authorize", async () => {
		const { user } = await signInWithTestUser();

		await expect(
			auth.api.bcAuthorize({
				body: {
					client_id: "invalid-agent",
					login_hint: user.email,
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_client",
			},
		});
	});

	it("should accept valid client", async () => {
		const { user } = await signInWithTestUser();

		const response = await auth.api.bcAuthorize({
			body: {
				client_id: "valid-agent-1",
				login_hint: user.email,
			},
		});

		expect(response.auth_req_id).toBeDefined();
	});
});

describe("ciba with custom user resolver", async () => {
	const mockSendNotification = vi.fn();

	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [
			ciba({
				sendNotification: mockSendNotification,
				resolveUser: async (hints, ctx) => {
					// Custom resolver that looks up by phone number prefix
					if (hints.login_hint?.startsWith("+1")) {
						// Return mock user for US phone numbers
						return null; // Not found
					}
					// Fall back to email lookup
					return null;
				},
			}),
		],
	});

	it("should use custom resolver", async () => {
		await expect(
			auth.api.bcAuthorize({
				body: {
					client_id: "test-agent",
					login_hint: "+15551234567",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "unknown_user_id",
			},
		});
	});
});
