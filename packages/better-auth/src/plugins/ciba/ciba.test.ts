import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidcProvider } from "../oidc-provider";
import { ciba } from ".";

describe("CIBA plugin", async () => {
	// Mock notification callback
	const mockSendNotification = vi.fn().mockResolvedValue(undefined);

	const { auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				oidcProvider({
					loginPage: "/sign-in",
					allowDynamicClientRegistration: true,
				}),
				ciba({
					sendNotification: mockSendNotification,
					requestLifetime: "5m",
					pollingInterval: "5s",
				}),
			],
		},
		{
			disableTestUser: false,
		},
	);

	// Register a test client in the database
	let testClientId: string;
	let testClientSecret: string;

	beforeEach(async () => {
		mockSendNotification.mockClear();

		// Register a client for each test to get fresh credentials
		const registration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Test Agent",
			},
		});
		testClientId = registration.client_id;
		testClientSecret = registration.client_secret!;
	});

	describe("bc-authorize endpoint", () => {
		it("should initiate CIBA request with valid credentials", async () => {
			const response = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid profile",
					login_hint: "test@test.com",
				},
			});

			expect(response.auth_req_id).toBeDefined();
			expect(response.expires_in).toBe(300); // 5 minutes
			expect(response.interval).toBe(5); // 5 seconds
		});

		it("should call sendNotification with correct data", async () => {
			await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
					binding_message: "Approve login from CLI",
				},
			});

			expect(mockSendNotification).toHaveBeenCalledTimes(1);
			const notificationData = mockSendNotification.mock.calls[0]?.[0];
			expect(notificationData.user.email).toBe("test@test.com");
			expect(notificationData.approvalUrl).toContain("auth_req_id=");
			expect(notificationData.bindingMessage).toBe("Approve login from CLI");
			expect(notificationData.clientId).toBe(testClientId);
			expect(notificationData.scope).toBe("openid");
		});

		it("should reject invalid client credentials", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: "invalid-client",
						client_secret: "wrong-secret",
						scope: "openid",
						login_hint: "test@test.com",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_client",
				},
			});
		});

		it("should reject wrong client secret", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: testClientId,
						client_secret: "wrong-secret",
						scope: "openid",
						login_hint: "test@test.com",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_client",
				},
			});
		});

		it("should reject unknown user", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: testClientId,
						client_secret: testClientSecret,
						scope: "openid",
						login_hint: "unknown@example.com",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "unknown_user_id",
				},
			});
		});

		it("should reject scope without openid", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: testClientId,
						client_secret: testClientSecret,
						scope: "profile email",
						login_hint: "test@test.com",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_scope",
				},
			});
		});
	});

	describe("token endpoint polling", () => {
		it("should return authorization_pending when not approved", async () => {
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			await expect(
				auth.api.oAuth2token({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id: bcResponse.auth_req_id,
						client_id: testClientId,
						client_secret: testClientSecret,
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "authorization_pending",
				},
			});
		});

		it("should enforce rate limiting with slow_down error", async () => {
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			// First poll
			await auth.api
				.oAuth2token({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id: bcResponse.auth_req_id,
						client_id: testClientId,
						client_secret: testClientSecret,
					},
				})
				.catch(() => {});

			// Immediate second poll should get slow_down
			await expect(
				auth.api.oAuth2token({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id: bcResponse.auth_req_id,
						client_id: testClientId,
						client_secret: testClientSecret,
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "slow_down",
				},
			});
		});

		it("should reject invalid auth_req_id", async () => {
			await expect(
				auth.api.oAuth2token({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id: "invalid-auth-req-id",
						client_id: testClientId,
						client_secret: testClientSecret,
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_grant",
				},
			});
		});

		it("should reject client_id mismatch", async () => {
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			await expect(
				auth.api.oAuth2token({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id: bcResponse.auth_req_id,
						client_id: "different-client",
						client_secret: "some-secret",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_client",
				},
			});
		});
	});

	describe("verify endpoint", () => {
		it("should return request details for valid auth_req_id", async () => {
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid profile",
					login_hint: "test@test.com",
					binding_message: "Test binding",
				},
			});

			const verifyResponse = await auth.api.cibaVerify({
				query: { auth_req_id: bcResponse.auth_req_id },
			});

			expect(verifyResponse.auth_req_id).toBe(bcResponse.auth_req_id);
			expect(verifyResponse.client_id).toBe(testClientId);
			expect(verifyResponse.scope).toBe("openid profile");
			expect(verifyResponse.binding_message).toBe("Test binding");
			expect(verifyResponse.status).toBe("pending");
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

	describe("approve flow", () => {
		it("should approve request and issue tokens", async () => {
			// Sign in as the user
			const { headers } = await signInWithTestUser();

			// Initiate CIBA request
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid profile email",
					login_hint: "test@test.com",
				},
			});

			// User approves
			const approveResponse = await auth.api.cibaAuthorize({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});
			expect(approveResponse.success).toBe(true);

			// Poll for token (wait a bit for rate limit)
			await new Promise((resolve) => setTimeout(resolve, 100));

			const tokenResponse = await auth.api.oAuth2token({
				body: {
					grant_type: "urn:openid:params:grant-type:ciba",
					auth_req_id: bcResponse.auth_req_id,
					client_id: testClientId,
					client_secret: testClientSecret,
				},
			});

			expect(tokenResponse.access_token).toBeDefined();
			expect(tokenResponse.token_type).toBe("Bearer");
			expect(tokenResponse.expires_in).toBeGreaterThan(0);
			expect(
				"id_token" in tokenResponse && tokenResponse.id_token,
			).toBeDefined();
			expect(tokenResponse.scope).toBe("openid profile email");
		});

		it("should include refresh_token only with offline_access scope", async () => {
			const { headers } = await signInWithTestUser();

			// Request with offline_access
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid offline_access",
					login_hint: "test@test.com",
				},
			});

			await auth.api.cibaAuthorize({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});

			const tokenResponse = await auth.api.oAuth2token({
				body: {
					grant_type: "urn:openid:params:grant-type:ciba",
					auth_req_id: bcResponse.auth_req_id,
					client_id: testClientId,
					client_secret: testClientSecret,
				},
			});

			expect(tokenResponse.refresh_token).toBeDefined();
		});

		it("should require authentication for approval", async () => {
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			await expect(
				auth.api.cibaAuthorize({
					body: { auth_req_id: bcResponse.auth_req_id },
					headers: new Headers(),
				}),
			).rejects.toMatchObject({
				body: {
					error: "unauthorized",
				},
			});
		});
	});

	describe("reject flow", () => {
		it("should reject request and return access_denied on poll", async () => {
			const { headers } = await signInWithTestUser();

			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			// User rejects
			const rejectResponse = await auth.api.cibaReject({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});
			expect(rejectResponse.success).toBe(true);

			// Poll should get access_denied
			await expect(
				auth.api.oAuth2token({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						auth_req_id: bcResponse.auth_req_id,
						client_id: testClientId,
						client_secret: testClientSecret,
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "access_denied",
				},
			});
		});

		it("should require authentication for rejection", async () => {
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			await expect(
				auth.api.cibaReject({
					body: { auth_req_id: bcResponse.auth_req_id },
					headers: new Headers(),
				}),
			).rejects.toMatchObject({
				body: {
					error: "unauthorized",
				},
			});
		});
	});

	describe("edge cases", () => {
		it("should not allow approving already processed request", async () => {
			const { headers } = await signInWithTestUser();

			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			// Approve once
			await auth.api.cibaAuthorize({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});

			// Try to approve again
			await expect(
				auth.api.cibaAuthorize({
					body: { auth_req_id: bcResponse.auth_req_id },
					headers,
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
				},
			});
		});

		it("should not allow rejecting already approved request", async () => {
			const { headers } = await signInWithTestUser();

			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			// Approve
			await auth.api.cibaAuthorize({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});

			// Try to reject
			await expect(
				auth.api.cibaReject({
					body: { auth_req_id: bcResponse.auth_req_id },
					headers,
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
				},
			});
		});
	});
});

describe("CIBA with hashed client secrets", async () => {
	const mockSendNotification = vi.fn().mockResolvedValue(undefined);

	const { auth } = await getTestInstance({
		plugins: [
			oidcProvider({
				loginPage: "/sign-in",
				storeClientSecret: "hashed",
				allowDynamicClientRegistration: true,
			}),
			ciba({
				sendNotification: mockSendNotification,
			}),
		],
	});

	it("should work with database-stored hashed client secrets", async () => {
		// Register a client (which will hash the secret)
		const registrationResponse = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Hash Test Client",
			},
		});

		const clientId = registrationResponse.client_id;
		const clientSecret = registrationResponse.client_secret!;

		// Now use CIBA with the returned credentials
		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: clientId,
				client_secret: clientSecret,
				scope: "openid",
				login_hint: "test@test.com",
			},
		});

		expect(bcResponse.auth_req_id).toBeDefined();
	});
});
