import { decodeJwt } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidcProvider } from "../oidc-provider";
import { ciba } from ".";

describe("CIBA plugin", async () => {
	// Mock notification callback
	const mockSendNotification = vi.fn().mockResolvedValue(undefined);

	const { auth, signInWithTestUser, signInWithUser } = await getTestInstance(
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

		it("should reject missing auth_req_id", async () => {
			await expect(
				auth.api.oAuth2token({
					body: {
						grant_type: "urn:openid:params:grant-type:ciba",
						client_id: testClientId,
						client_secret: testClientSecret,
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
				},
			});
		});

		it("should clean up request after tokens are issued (no double-issuance)", async () => {
			const { headers } = await signInWithTestUser();

			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			await auth.api.cibaAuthorize({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});

			// First poll — should succeed and issue tokens
			const tokenResponse = await auth.api.oAuth2token({
				body: {
					grant_type: "urn:openid:params:grant-type:ciba",
					auth_req_id: bcResponse.auth_req_id,
					client_id: testClientId,
					client_secret: testClientSecret,
				},
			});
			expect(tokenResponse.access_token).toBeDefined();

			// Second poll — request was deleted, should fail
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
					error: "invalid_grant",
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

		it("should reflect approved status after user approves", async () => {
			const { headers } = await signInWithTestUser();

			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			await auth.api.cibaAuthorize({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});

			const verifyResponse = await auth.api.cibaVerify({
				query: { auth_req_id: bcResponse.auth_req_id },
			});
			expect(verifyResponse.status).toBe("approved");
		});

		it("should reflect rejected status after user rejects", async () => {
			const { headers } = await signInWithTestUser();

			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			await auth.api.cibaReject({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});

			const verifyResponse = await auth.api.cibaVerify({
				query: { auth_req_id: bcResponse.auth_req_id },
			});
			expect(verifyResponse.status).toBe("rejected");
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

		it("should NOT include refresh_token without offline_access scope", async () => {
			const { headers } = await signInWithTestUser();

			// Request WITHOUT offline_access
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid profile",
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

			// refresh_token should be undefined when offline_access not requested
			expect(tokenResponse.refresh_token).toBeUndefined();
		});

		it("should produce ID token with correct claims", async () => {
			const { headers } = await signInWithTestUser();

			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid profile email",
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

			const idToken = (tokenResponse as Record<string, unknown>)
				.id_token as string;
			expect(idToken).toBeDefined();

			const claims = decodeJwt(idToken);
			expect(claims.sub).toBeDefined();
			expect(claims.aud).toBe(testClientId);
			expect(claims.iss).toBeDefined();
			expect(claims.iat).toBeDefined();
			expect(claims.exp).toBeDefined();
			expect(claims.at_hash).toBeDefined();
			expect(claims.auth_req_id).toBe(bcResponse.auth_req_id);
			// Profile claims
			expect(claims.email).toBe("test@test.com");
		});

		it("should reject approve with invalid auth_req_id", async () => {
			const { headers } = await signInWithTestUser();

			await expect(
				auth.api.cibaAuthorize({
					body: { auth_req_id: "nonexistent-id" },
					headers,
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
				},
			});
		});

		it("should reject reject with invalid auth_req_id", async () => {
			const { headers } = await signInWithTestUser();

			await expect(
				auth.api.cibaReject({
					body: { auth_req_id: "nonexistent-id" },
					headers,
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
				},
			});
		});

		it("should reject approval if different user is logged in", async () => {
			// Create and sign in as a different user
			await auth.api.signUpEmail({
				body: {
					email: "other-user@test.com",
					password: "password123",
					name: "Other User",
				},
			});
			const { headers: otherHeaders } = await signInWithUser(
				"other-user@test.com",
				"password123",
			);

			// Initiate CIBA request for test@test.com (the default test user)
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com", // Request is for test@test.com
				},
			});

			// Other user tries to approve - should fail
			await expect(
				auth.api.cibaAuthorize({
					body: { auth_req_id: bcResponse.auth_req_id },
					headers: otherHeaders, // Logged in as other-user@test.com
				}),
			).rejects.toMatchObject({
				body: {
					error: "access_denied",
				},
			});
		});

		it("should reject rejection if different user is logged in", async () => {
			// Sign in as other user (created in previous test)
			const { headers: otherHeaders } = await signInWithUser(
				"other-user@test.com",
				"password123",
			);

			// Initiate CIBA request for test@test.com
			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			// Other user tries to reject - should fail
			await expect(
				auth.api.cibaReject({
					body: { auth_req_id: bcResponse.auth_req_id },
					headers: otherHeaders,
				}),
			).rejects.toMatchObject({
				body: {
					error: "access_denied",
				},
			});
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

		it("should not allow rejecting already rejected request", async () => {
			const { headers } = await signInWithTestUser();

			const bcResponse = await auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
				},
			});

			await auth.api.cibaReject({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			});

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

describe("CIBA push delivery mode", async () => {
	const mockSendNotification = vi.fn().mockResolvedValue(undefined);
	// Track push delivery requests
	const pushRequests: Array<{ url: string; headers: Headers; body: unknown }> =
		[];

	const { auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				oidcProvider({
					loginPage: "/sign-in",
					allowDynamicClientRegistration: true,
				}),
				ciba({
					sendNotification: mockSendNotification,
					deliveryMode: "poll", // Default poll, clients can override via metadata
				}),
			],
		},
		{
			disableTestUser: false,
		},
	);

	let pushClientId: string;
	let pushClientSecret: string;
	let pollClientId: string;
	let pollClientSecret: string;

	beforeEach(async () => {
		mockSendNotification.mockClear();
		pushRequests.length = 0;

		// Register a push-mode client with notification endpoint in metadata
		const pushRegistration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Push Agent",
				metadata: {
					backchannel_token_delivery_mode: "push",
					client_notification_endpoint: "http://localhost:9999/ciba/callback",
				},
			},
		});
		pushClientId = pushRegistration.client_id;
		pushClientSecret = pushRegistration.client_secret!;

		// Register a poll-mode client (no push metadata)
		const pollRegistration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Poll Agent",
			},
		});
		pollClientId = pollRegistration.client_id;
		pollClientSecret = pollRegistration.client_secret!;
	});

	it("should NOT include interval in bc-authorize response for push mode", async () => {
		const response = await auth.api.bcAuthorize({
			body: {
				client_id: pushClientId,
				client_secret: pushClientSecret,
				scope: "openid",
				login_hint: "test@test.com",
				client_notification_token: "my-notification-token-123",
			},
		});

		expect(response.auth_req_id).toBeDefined();
		expect(response.expires_in).toBe(300);
		// Push mode should NOT include interval
		expect(response.interval).toBeUndefined();
	});

	it("should include interval in bc-authorize response for poll mode", async () => {
		const response = await auth.api.bcAuthorize({
			body: {
				client_id: pollClientId,
				client_secret: pollClientSecret,
				scope: "openid",
				login_hint: "test@test.com",
			},
		});

		expect(response.auth_req_id).toBeDefined();
		expect(response.interval).toBe(5);
	});

	it("should reject push mode request when client_notification_token is missing", async () => {
		await expect(
			auth.api.bcAuthorize({
				body: {
					client_id: pushClientId,
					client_secret: pushClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
					// Missing client_notification_token
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_request",
			},
		});
	});

	it("should reject token endpoint polling for push-mode requests", async () => {
		const { headers } = await signInWithTestUser();

		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: pushClientId,
				client_secret: pushClientSecret,
				scope: "openid",
				login_hint: "test@test.com",
				client_notification_token: "my-token",
			},
		});

		// Approve the request
		await auth.api.cibaAuthorize({
			body: { auth_req_id: bcResponse.auth_req_id },
			headers,
		});

		// Trying to poll should be rejected for push-mode requests
		await expect(
			auth.api.oAuth2token({
				body: {
					grant_type: "urn:openid:params:grant-type:ciba",
					auth_req_id: bcResponse.auth_req_id,
					client_id: pushClientId,
					client_secret: pushClientSecret,
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_request",
			},
		});
	});
});

describe("CIBA request expiration", async () => {
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
					requestLifetime: "1s",
					pollingInterval: "0s",
				}),
			],
		},
		{
			disableTestUser: false,
		},
	);

	let testClientId: string;
	let testClientSecret: string;

	beforeEach(async () => {
		mockSendNotification.mockClear();
		const registration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Expiry Test Client",
			},
		});
		testClientId = registration.client_id;
		testClientSecret = registration.client_secret!;
	});

	it("should reject polling for an expired request", async () => {
		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: testClientId,
				client_secret: testClientSecret,
				scope: "openid",
				login_hint: "test@test.com",
			},
		});

		// Wait for the request to expire (1s lifetime + buffer)
		await new Promise((resolve) => setTimeout(resolve, 1200));

		// Storage layer cleans up expired records, so the token endpoint
		// sees a missing request (invalid_grant) rather than expired_token.
		// Both are valid CIBA spec responses for expired requests.
		await expect(
			auth.api.oAuth2token({
				body: {
					grant_type: "urn:openid:params:grant-type:ciba",
					auth_req_id: bcResponse.auth_req_id,
					client_id: testClientId,
					client_secret: testClientSecret,
				},
			}),
		).rejects.toBeDefined();
	});

	it("should reject verify for an expired request", async () => {
		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: testClientId,
				client_secret: testClientSecret,
				scope: "openid",
				login_hint: "test@test.com",
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 1200));

		await expect(
			auth.api.cibaVerify({
				query: { auth_req_id: bcResponse.auth_req_id },
			}),
		).rejects.toBeDefined();
	});

	it("should reject approval of expired request", async () => {
		const { headers } = await signInWithTestUser();

		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: testClientId,
				client_secret: testClientSecret,
				scope: "openid",
				login_hint: "test@test.com",
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 1200));

		await expect(
			auth.api.cibaAuthorize({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			}),
		).rejects.toBeDefined();
	});

	it("should reject rejection of expired request", async () => {
		const { headers } = await signInWithTestUser();

		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: testClientId,
				client_secret: testClientSecret,
				scope: "openid",
				login_hint: "test@test.com",
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 1200));

		await expect(
			auth.api.cibaReject({
				body: { auth_req_id: bcResponse.auth_req_id },
				headers,
			}),
		).rejects.toBeDefined();
	});
});

describe("CIBA push HTTPS enforcement", async () => {
	const mockSendNotification = vi.fn().mockResolvedValue(undefined);

	const { auth } = await getTestInstance(
		{
			plugins: [
				oidcProvider({
					loginPage: "/sign-in",
					allowDynamicClientRegistration: true,
				}),
				ciba({
					sendNotification: mockSendNotification,
				}),
			],
		},
		{
			disableTestUser: false,
		},
	);

	it("should reject non-HTTPS notification endpoint on non-loopback host", async () => {
		const registration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Insecure Push Client",
				metadata: {
					backchannel_token_delivery_mode: "push",
					client_notification_endpoint: "http://example.com/ciba/callback",
				},
			},
		});

		await expect(
			auth.api.bcAuthorize({
				body: {
					client_id: registration.client_id,
					client_secret: registration.client_secret!,
					scope: "openid",
					login_hint: "test@test.com",
					client_notification_token: "my-token",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_request",
				error_description:
					"client_notification_endpoint must use HTTPS per CIBA spec §10.3",
			},
		});
	});

	it("should allow HTTPS notification endpoint", async () => {
		const registration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Secure Push Client",
				metadata: {
					backchannel_token_delivery_mode: "push",
					client_notification_endpoint: "https://example.com/ciba/callback",
				},
			},
		});

		const response = await auth.api.bcAuthorize({
			body: {
				client_id: registration.client_id,
				client_secret: registration.client_secret!,
				scope: "openid",
				login_hint: "test@test.com",
				client_notification_token: "my-token",
			},
		});

		expect(response.auth_req_id).toBeDefined();
	});

	it("should allow HTTP on localhost (loopback exemption)", async () => {
		const registration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Local Push Client",
				metadata: {
					backchannel_token_delivery_mode: "push",
					client_notification_endpoint: "http://localhost:9999/ciba/callback",
				},
			},
		});

		const response = await auth.api.bcAuthorize({
			body: {
				client_id: registration.client_id,
				client_secret: registration.client_secret!,
				scope: "openid",
				login_hint: "test@test.com",
				client_notification_token: "my-token",
			},
		});

		expect(response.auth_req_id).toBeDefined();
	});
});

describe("CIBA with sendVerificationEmail", async () => {
	const mockSendEmail = vi.fn().mockResolvedValue(undefined);

	const { auth } = await getTestInstance(
		{
			plugins: [
				oidcProvider({
					loginPage: "/sign-in",
					allowDynamicClientRegistration: true,
				}),
				ciba({
					sendVerificationEmail: mockSendEmail,
				}),
			],
		},
		{
			disableTestUser: false,
		},
	);

	it("should use sendVerificationEmail when sendNotification is not provided", async () => {
		const registration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Email Test Client",
			},
		});

		await auth.api.bcAuthorize({
			body: {
				client_id: registration.client_id,
				client_secret: registration.client_secret!,
				scope: "openid",
				login_hint: "test@test.com",
			},
		});

		expect(mockSendEmail).toHaveBeenCalledTimes(1);
		const data = mockSendEmail.mock.calls[0]?.[0];
		expect(data.user.email).toBe("test@test.com");
		expect(data.approvalUrl).toContain("auth_req_id=");
		expect(data.clientId).toBe(registration.client_id);
	});
});

describe("CIBA with sendNotification takes precedence", async () => {
	const mockSendNotification = vi.fn().mockResolvedValue(undefined);
	const mockSendEmail = vi.fn().mockResolvedValue(undefined);

	const { auth } = await getTestInstance(
		{
			plugins: [
				oidcProvider({
					loginPage: "/sign-in",
					allowDynamicClientRegistration: true,
				}),
				ciba({
					sendNotification: mockSendNotification,
					sendVerificationEmail: mockSendEmail,
				}),
			],
		},
		{
			disableTestUser: false,
		},
	);

	it("should prefer sendNotification over sendVerificationEmail when both provided", async () => {
		const registration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Precedence Test",
			},
		});

		await auth.api.bcAuthorize({
			body: {
				client_id: registration.client_id,
				client_secret: registration.client_secret!,
				scope: "openid",
				login_hint: "test@test.com",
			},
		});

		// sendNotification should be called, not sendVerificationEmail
		expect(mockSendNotification).toHaveBeenCalledTimes(1);
		expect(mockSendEmail).not.toHaveBeenCalled();
	});
});

describe("CIBA with id_token_hint", async () => {
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

	let testClientId: string;
	let testClientSecret: string;

	beforeEach(async () => {
		mockSendNotification.mockClear();
		const registration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "ID Token Hint Test Client",
			},
		});
		testClientId = registration.client_id;
		testClientSecret = registration.client_secret!;
	});

	it("should accept id_token_hint and resolve user from sub claim", async () => {
		const { headers } = await signInWithTestUser();

		// First, complete a full flow to obtain a real ID token
		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: testClientId,
				client_secret: testClientSecret,
				scope: "openid profile",
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

		const idToken = (tokenResponse as Record<string, unknown>)
			.id_token as string;
		expect(idToken).toBeDefined();

		// Now use id_token_hint instead of login_hint
		const bcResponse2 = await auth.api.bcAuthorize({
			body: {
				client_id: testClientId,
				client_secret: testClientSecret,
				scope: "openid",
				id_token_hint: idToken,
			},
		});

		expect(bcResponse2.auth_req_id).toBeDefined();
		expect(bcResponse2.expires_in).toBe(300);

		// Verify the notification was sent with the correct user
		const lastCall =
			mockSendNotification.mock.calls[
				mockSendNotification.mock.calls.length - 1
			]?.[0];
		expect(lastCall.user.email).toBe("test@test.com");
	});

	it("should reject id_token_hint with wrong audience (different client)", async () => {
		const { headers } = await signInWithTestUser();

		// Obtain an ID token issued to testClientId
		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: testClientId,
				client_secret: testClientSecret,
				scope: "openid",
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

		const idToken = (tokenResponse as Record<string, unknown>)
			.id_token as string;

		// Register a DIFFERENT client and try to use the first client's ID token
		const otherRegistration = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://localhost:3000/callback"],
				client_name: "Other Client",
			},
		});

		await expect(
			auth.api.bcAuthorize({
				body: {
					client_id: otherRegistration.client_id,
					client_secret: otherRegistration.client_secret!,
					scope: "openid",
					id_token_hint: idToken,
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_request",
			},
		});
	});

	it("should reject invalid id_token_hint", async () => {
		await expect(
			auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					id_token_hint: "invalid.jwt.token",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_request",
			},
		});
	});

	it("should reject when both login_hint and id_token_hint are provided", async () => {
		await expect(
			auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
					login_hint: "test@test.com",
					id_token_hint: "some.jwt.token",
				},
			}),
		).rejects.toBeDefined();
	});

	it("should reject when neither login_hint nor id_token_hint is provided", async () => {
		await expect(
			auth.api.bcAuthorize({
				body: {
					client_id: testClientId,
					client_secret: testClientSecret,
					scope: "openid",
				},
			}),
		).rejects.toBeDefined();
	});
});

describe("CIBA config validation", () => {
	it("should reject config when neither sendNotification nor sendVerificationEmail is provided", async () => {
		expect(() => {
			ciba({} as any);
		}).toThrow();
	});
});
