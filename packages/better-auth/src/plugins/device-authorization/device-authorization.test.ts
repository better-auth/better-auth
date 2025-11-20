import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { deviceAuthorization, deviceAuthorizationOptionsSchema } from ".";
import { deviceAuthorizationClient } from "./client";
import type { DeviceCode } from "./schema";

describe("device authorization plugin input validation", () => {
	it("basic validation", async () => {
		const options = deviceAuthorizationOptionsSchema.parse({});
		expect(options).toMatchInlineSnapshot(`
			{
			  "deviceCodeLength": 40,
			  "expiresIn": "30m",
			  "interval": "5s",
			  "userCodeLength": 8,
			}
		`);
	});

	it("should validate custom options", async () => {
		const options = deviceAuthorizationOptionsSchema.parse({
			expiresIn: 60 * 1000,
			interval: 2 * 1000,
			deviceCodeLength: 50,
			userCodeLength: 10,
		});
		expect(options).toMatchInlineSnapshot(`
			{
			  "deviceCodeLength": 50,
			  "expiresIn": 60000,
			  "interval": 2000,
			  "userCodeLength": 10,
			}
		`);
	});
});

describe("client validation", async () => {
	const validClients = ["valid-client-1", "valid-client-2"];

	const { auth } = await getTestInstance({
		plugins: [
			deviceAuthorization({
				validateClient: async (clientId) => {
					return validClients.includes(clientId);
				},
			}),
		],
	});

	it("should reject invalid client in device code request", async () => {
		await expect(
			auth.api.deviceCode({
				body: {
					client_id: "invalid-client",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_client",
				error_description: "Invalid client ID",
			},
		});
	});

	it("should accept valid client in device code request", async () => {
		const response = await auth.api.deviceCode({
			body: {
				client_id: "valid-client-1",
			},
		});
		expect(response.device_code).toBeDefined();
	});

	it("should reject invalid client in token request", async () => {
		const { device_code } = await auth.api.deviceCode({
			body: {
				client_id: "valid-client-1",
			},
		});

		await expect(
			auth.api.deviceToken({
				body: {
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code,
					client_id: "invalid-client",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_grant",
				error_description: "Invalid client ID",
			},
		});
	});

	it("should reject mismatched client_id in token request", async () => {
		const { device_code } = await auth.api.deviceCode({
			body: {
				client_id: "valid-client-1",
			},
		});

		await expect(
			auth.api.deviceToken({
				body: {
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code,
					client_id: "valid-client-2",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_grant",
				error_description: "Client ID mismatch",
			},
		});
	});
});

describe("device authorization flow", async () => {
	const { auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				deviceAuthorization({
					expiresIn: "5min",
					interval: "2s",
				}),
			],
		},
		{
			clientOptions: {
				plugins: [deviceAuthorizationClient()],
			},
		},
	);

	describe("device code request", () => {
		it("should generate device and user codes", async () => {
			const response = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			expect(response.device_code).toBeDefined();
			expect(response.user_code).toBeDefined();
			expect(response.verification_uri).toBeDefined();
			expect(response.verification_uri).toContain("/device");
			expect(response.verification_uri_complete).toBeDefined();
			expect(response.verification_uri_complete).toContain("/device");
			expect(response.verification_uri_complete).toContain(
				`user_code=${response.user_code}`,
			);
			expect(response.expires_in).toBe(300);
			expect(response.interval).toBe(2);
			expect(response.user_code).toMatch(/^[A-Z0-9]{8}$/);
		});

		it("should support custom client ID and scope", async () => {
			const response = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
					scope: "read write",
				},
			});

			expect(response.device_code).toBeDefined();
			expect(response.user_code).toBeDefined();
		});
	});

	describe("device token polling", () => {
		it("should return authorization_pending when not approved", async () => {
			const { device_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			await expect(
				auth.api.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code: device_code,
						client_id: "test-client",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "authorization_pending",
					error_description: "Authorization pending",
				},
			});
		});

		it("should return expired_token for expired device codes", async () => {
			const { device_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			// Advance time past expiration
			vi.useFakeTimers();
			await vi.advanceTimersByTimeAsync(301 * 1000); // 301 seconds

			await expect(
				auth.api.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code: device_code,
						client_id: "test-client",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "expired_token",
					error_description: "Device code has expired",
				},
			});

			vi.useRealTimers();
		});

		it("should return error for invalid device code", async () => {
			await expect(
				auth.api.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code: "invalid-code",
						client_id: "test-client",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_grant",
					error_description: "Invalid device code",
				},
			});
		});
	});

	describe("device verification", () => {
		it("should verify valid user code", async () => {
			const { user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			const response = await auth.api.deviceVerify({
				query: { user_code },
			});
			expect("error" in response).toBe(false);
			if (!("error" in response)) {
				expect(response.user_code).toBe(user_code);
				expect(response.status).toBe("pending");
			}
		});

		it("should handle invalid user code", async () => {
			await expect(
				auth.api.deviceVerify({
					query: { user_code: "INVALID" },
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
					error_description: "Invalid user code",
				},
			});
		});
	});

	describe("device approval flow", () => {
		it("should approve device and create session", async () => {
			// First, sign in as a user
			const { headers } = await signInWithTestUser();

			// Request device code
			const { device_code, user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			// Approve the device
			const approveResponse = await auth.api.deviceApprove({
				body: { userCode: user_code },
				headers,
			});
			expect("success" in approveResponse && approveResponse.success).toBe(
				true,
			);

			// Poll for token should now succeed
			const tokenResponse = await auth.api.deviceToken({
				body: {
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: device_code,
					client_id: "test-client",
				},
			});
			// Check OAuth 2.0 compliant response
			expect("access_token" in tokenResponse).toBe(true);
			if ("access_token" in tokenResponse) {
				expect(tokenResponse.access_token).toBeDefined();
				expect(tokenResponse.token_type).toBe("Bearer");
				expect(tokenResponse.expires_in).toBeGreaterThan(0);
				expect(tokenResponse.scope).toBeDefined();
			}
		});

		it("should deny device authorization", async () => {
			const { device_code, user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			// Deny the device
			const denyResponse = await auth.api.deviceDeny({
				body: { userCode: user_code },
				headers: new Headers(),
			});
			expect("success" in denyResponse && denyResponse.success).toBe(true);

			// Poll for token should return access_denied
			await expect(
				auth.api.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code: device_code,
						client_id: "test-client",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "access_denied",
					error_description: "Access denied",
				},
			});
		});

		it("should require authentication for approval", async () => {
			const { user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			await expect(
				auth.api.deviceApprove({
					body: { userCode: user_code },
					headers: new Headers(),
				}),
			).rejects.toMatchObject({
				body: {
					error: "unauthorized",
					error_description: "Authentication required",
				},
			});
		});

		it("should enforce rate limiting with slow_down error", async () => {
			const { device_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			await auth.api
				.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code: device_code,
						client_id: "test-client",
					},
				})
				.catch(
					// ignore the error
					() => {},
				);

			await expect(
				auth.api.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code: device_code,
						client_id: "test-client",
					},
				}),
			).rejects.toMatchObject({
				body: {
					error: "slow_down",
					error_description: "Polling too frequently",
				},
			});
		});
	});

	describe("edge cases", () => {
		it("should not allow approving already processed device code", async () => {
			// Sign in as a user
			const { headers } = await signInWithTestUser();

			// Request and approve device
			const { user_code: userCode } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});
			await auth.api.deviceApprove({
				body: { userCode },
				headers,
			});

			await expect(
				auth.api.deviceApprove({
					body: { userCode },
					headers,
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
					error_description: "Device code already processed",
				},
			});
		});

		it("should handle user code without dashes", async () => {
			const { user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});
			const cleanUserCode = user_code.replace(/-/g, "");

			const response = await auth.api.deviceVerify({
				query: { user_code: cleanUserCode },
			});
			expect("status" in response && response.status).toBe("pending");
		});

		it("should store and use scope from device code request", async () => {
			const { headers } = await signInWithTestUser();

			const { device_code, user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
					scope: "read write profile",
				},
			});

			await auth.api.deviceApprove({
				body: { userCode: user_code },
				headers,
			});

			const tokenResponse = await auth.api.deviceToken({
				body: {
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: device_code,
					client_id: "test-client",
				},
			});
			expect("scope" in tokenResponse && tokenResponse.scope).toBe(
				"read write profile",
			);
		});
	});
});

describe("device authorization with custom options", async () => {
	it("should correctly store interval as milliseconds in database", async () => {
		const { auth, client, db } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					interval: "5s",
				}),
			],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});

		// Response should return interval in seconds
		expect(response.interval).toBe(5);

		// Check that the interval is stored as milliseconds in the database
		const deviceCodeRecord: DeviceCode | null = await db.findOne({
			model: "deviceCode",
			where: [
				{
					field: "deviceCode",
					value: response.device_code,
				},
			],
		});

		// Should be stored as 5000 milliseconds, not "5s" string
		expect(deviceCodeRecord?.pollingInterval).toBe(5000);
		expect(typeof deviceCodeRecord?.pollingInterval).toBe("number");
	});

	it("should use custom code generators", async () => {
		const customDeviceCode = "custom-device-code-12345";
		const customUserCode = "CUSTOM12";

		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					generateDeviceCode: () => customDeviceCode,
					generateUserCode: () => customUserCode,
				}),
			],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});
		expect(response.device_code).toBe(customDeviceCode);
		expect(response.user_code).toBe(customUserCode);
	});

	it("should respect custom expiration time", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					expiresIn: "1min",
				}),
			],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});
		expect(response.expires_in).toBe(60);
	});
});

describe("verificationUri option", async () => {
	it("should validate verificationUri option at plugin initialization", async () => {
		expect(() => {
			deviceAuthorizationOptionsSchema.parse({
				verificationUri: 123,
			});
		}).toThrow();
	});

	it("should return default /device verification URIs when not configured", async () => {
		const { auth } = await getTestInstance({
			plugins: [deviceAuthorization({})],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});

		expect(response.verification_uri).toBeDefined();
		expect(response.verification_uri).toContain("/device");
		expect(response.verification_uri_complete).toBeDefined();
		expect(response.verification_uri_complete).toContain("/device");
		expect(response.verification_uri_complete).toContain(
			`user_code=${response.user_code}`,
		);
	});

	it("should use custom relative path for verificationUri", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					verificationUri: "/auth/device-verify",
				}),
			],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});

		expect(response.verification_uri).toContain("/auth/device-verify");
		expect(response.verification_uri_complete).toContain("/auth/device-verify");
		expect(response.verification_uri_complete).toContain(
			`user_code=${response.user_code}`,
		);
	});

	it("should use absolute URL for verificationUri", async () => {
		const customUrl = "https://myapp.com/device";
		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					verificationUri: customUrl,
				}),
			],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});

		expect(response.verification_uri).toBe(customUrl);
		expect(response.verification_uri_complete).toBe(
			`${customUrl}?user_code=${response.user_code}`,
		);
	});

	it("should properly encode user_code in verification_uri_complete", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					verificationUri: "/device",
					generateUserCode: () => "ABC-123",
				}),
			],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});

		expect(response.verification_uri_complete).toContain("user_code=ABC-123");
	});

	it("should support verificationUri with existing query parameters", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					verificationUri: "/device?lang=en",
				}),
			],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});

		expect(response.verification_uri).toContain("lang=en");
		expect(response.verification_uri_complete).toContain("lang=en");
		expect(response.verification_uri_complete).toContain(
			`user_code=${response.user_code}`,
		);
	});
});
