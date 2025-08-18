import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { $deviceAuthorizationOptionsSchema, deviceAuthorization } from ".";
import { deviceAuthorizationClient } from "./client";

describe("device authorization plugin input validation", () => {
	it("basic validation", async () => {
		const options = $deviceAuthorizationOptionsSchema.parse({});
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
		const options = $deviceAuthorizationOptionsSchema.parse({
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

// describe("device authorization flow", async () => {
// 	const { auth, client, sessionSetter, signInWithTestUser } =
// 		await getTestInstance(
// 			{
// 				plugins: [
// 					deviceAuthorization({
// 						expiresIn: 300, // 5 minutes for testing
// 						interval: 2, // 2 seconds for faster testing
// 					}),
// 				],
// 			},
// 			{
// 				clientOptions: {
// 					plugins: [deviceAuthorizationClient()],
// 				},
// 			},
// 		);
//
// 	describe("device code request", () => {
// 		it("should generate device and user codes", async () => {
// 			const response = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
//
// 			expect(response.device_code).toBeDefined();
// 			expect(response.user_code).toBeDefined();
// 			expect(response.verification_uri).toBeDefined();
// 			expect(response.verification_uri_complete).toBeDefined();
// 			expect(response.expires_in).toBe(300);
// 			expect(response.interval).toBe(2);
// 			expect(response.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
// 			expect(response.verification_uri_complete).toContain(response.user_code);
// 		});
//
// 		it("should support custom client ID and scope", async () => {
// 			const response = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 					scope: "read write",
// 				},
// 			});
//
// 			expect(response.device_code).toBeDefined();
// 			expect(response.user_code).toBeDefined();
// 		});
// 	});
//
// 	describe("device token polling", () => {
// 		it("should return authorization_pending when not approved", async () => {
// 			const { device_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
//
// 			await expect(
// 				auth.api.deviceToken({
// 					body: {
// 						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 						device_code: device_code,
// 						client_id: "test-client",
// 					},
// 				}),
// 			).resolves.toEqual({
// 				error: "authorization_pending",
// 				error_description: "Authorization pending",
// 			});
// 		});
//
// 		it("should return expired_token for expired device codes", async () => {
// 			const { device_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
//
// 			// Advance time past expiration
// 			vi.useFakeTimers();
// 			await vi.advanceTimersByTimeAsync(301 * 1000); // 301 seconds
//
// 			await expect(
// 				auth.api.deviceToken({
// 					body: {
// 						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 						device_code: device_code,
// 						client_id: "test-client",
// 					},
// 				}),
// 			).resolves.toEqual({
// 				error: "expired_token",
// 				error_description: "Device code has expired",
// 			});
//
// 			vi.useRealTimers();
// 		});
//
// 		it("should return error for invalid device code", async () => {
// 			await expect(
// 				auth.api.deviceToken({
// 					body: {
// 						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 						device_code: "invalid-code",
// 						client_id: "test-client",
// 					},
// 				}),
// 			).resolves.toEqual({
// 				error: "invalid_grant",
// 				error_description: "Invalid device code",
// 			});
// 		});
// 	});
//
// 	describe("device verification", () => {
// 		it("should verify valid user code", async () => {
// 			const { user_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
//
// 			const response = await auth.api.deviceVerify({
// 				query: { user_code },
// 			});
// 			expect("error" in response).toBe(false);
// 			if (!("error" in response)) {
// 				expect(response.user_code).toBe(user_code);
// 				expect(response.status).toBe("pending");
// 			}
// 		});
//
// 		it("should handle invalid user code", async () => {
// 			const response = await auth.api.deviceVerify({
// 				query: { user_code: "INVALID" },
// 			});
// 			expect("error" in response).toBe(true);
// 			if ("error" in response) {
// 				expect(response.error).toBe("invalid_request");
// 				expect(response.error_description).toBe("Invalid user code");
// 			}
// 		});
// 	});
//
// 	describe("device approval flow", () => {
// 		it("should approve device and create session", async () => {
// 			// First, sign in as a user
// 			const { headers } = await signInWithTestUser();
//
// 			// Request device code
// 			const { device_code, user_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
//
// 			// Approve the device
// 			const approveResponse = await auth.api.deviceApprove({
// 				body: { userCode: user_code },
// 				headers,
// 			});
// 			expect("success" in approveResponse && approveResponse.success).toBe(
// 				true,
// 			);
//
// 			// Poll for token should now succeed
// 			const tokenResponse = await auth.api.deviceToken({
// 				body: {
// 					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 					device_code: device_code,
// 					client_id: "test-client",
// 				},
// 			});
// 			// Check OAuth 2.0 compliant response
// 			expect("access_token" in tokenResponse).toBe(true);
// 			if ("access_token" in tokenResponse) {
// 				expect(tokenResponse.access_token).toBeDefined();
// 				expect(tokenResponse.token_type).toBe("Bearer");
// 				expect(tokenResponse.expires_in).toBeGreaterThan(0);
// 				expect(tokenResponse.scope).toBeDefined();
// 			}
// 		});
//
// 		it("should deny device authorization", async () => {
// 			const { device_code, user_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
//
// 			// Deny the device
// 			const denyResponse = await auth.api.deviceDeny({
// 				body: { userCode: user_code },
// 				headers: new Headers(),
// 			});
// 			expect("success" in denyResponse && denyResponse.success).toBe(true);
//
// 			// Poll for token should return access_denied
// 			const response = await auth.api.deviceToken({
// 				body: {
// 					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 					device_code: device_code,
// 					client_id: "test-client",
// 				},
// 			});
// 			expect("error" in response).toBe(true);
// 			if ("error" in response) {
// 				expect(response.error).toBe("access_denied");
// 				expect(response.error_description).toBe("Access denied");
// 			}
// 		});
//
// 		it("should require authentication for approval", async () => {
// 			const { user_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
//
// 			await expect(
// 				auth.api.deviceApprove({
// 					body: { userCode: user_code },
// 					headers: new Headers(),
// 				}),
// 			).resolves.toEqual({
// 				error: "unauthorized",
// 				error_description: "Authentication required",
// 			});
// 		});
//
// 		it("should enforce rate limiting with slow_down error", async () => {
// 			const { device_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
//
// 			await auth.api.deviceToken({
// 				body: {
// 					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 					device_code: device_code,
// 					client_id: "test-client",
// 				},
// 			});
//
// 			const response = await auth.api.deviceToken({
// 				body: {
// 					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 					device_code: device_code,
// 					client_id: "test-client",
// 				},
// 			});
// 			expect("error" in response).toBe(true);
// 			if ("error" in response) {
// 				expect(response.error).toBe("slow_down");
// 				expect(response.error_description).toBe("Polling too frequently");
// 				expect((response as any).interval).toBeGreaterThan(2);
// 			}
// 		});
// 	});
//
// 	describe("edge cases", () => {
// 		it("should not allow approving already processed device code", async () => {
// 			// Sign in as a user
// 			const { headers } = await signInWithTestUser();
//
// 			// Request and approve device
// 			const { user_code: userCode } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
// 			await auth.api.deviceApprove({
// 				body: { userCode },
// 				headers,
// 			});
//
// 			await expect(
// 				auth.api.deviceApprove({
// 					body: { userCode },
// 					headers,
// 				}),
// 			).resolves.toEqual({
// 				error: "invalid_request",
// 				error_description: "Device code already processed",
// 			});
// 		});
//
// 		it("should handle user code without dashes", async () => {
// 			const { user_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 				},
// 			});
// 			const cleanUserCode = user_code.replace(/-/g, "");
//
// 			const response = await auth.api.deviceVerify({
// 				query: { user_code: cleanUserCode },
// 			});
// 			expect("status" in response && response.status).toBe("pending");
// 		});
//
// 		it("should store and use scope from device code request", async () => {
// 			const { headers } = await signInWithTestUser();
//
// 			const { device_code, user_code } = await auth.api.deviceCode({
// 				body: {
// 					client_id: "test-client",
// 					scope: "read write profile",
// 				},
// 			});
//
// 			await auth.api.deviceApprove({
// 				body: { userCode: user_code },
// 				headers,
// 			});
//
// 			const tokenResponse = await auth.api.deviceToken({
// 				body: {
// 					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 					device_code: device_code,
// 					client_id: "test-client",
// 				},
// 			});
// 			expect("scope" in tokenResponse && tokenResponse.scope).toBe(
// 				"read write profile",
// 			);
// 		});
// 	});
// });
//
// describe("device authorization with custom options", async () => {
// 	it("should use custom code generators", async () => {
// 		const customDeviceCode = "custom-device-code-12345";
// 		const customUserCode = "CUST-OM12";
//
// 		const { auth } = await getTestInstance({
// 			plugins: [
// 				deviceAuthorization({
// 					generateDeviceCode: () => customDeviceCode,
// 					generateUserCode: () => customUserCode,
// 					formatUserCode: false, // Disable formatting for custom codes
// 				}),
// 			],
// 		});
//
// 		const response = await auth.api.deviceCode({
// 			body: {
// 				client_id: "test-client",
// 			},
// 		});
// 		expect(response.device_code).toBe(customDeviceCode);
// 		expect(response.user_code).toBe(customUserCode);
// 	});
//
// 	it("should respect custom expiration time", async () => {
// 		const { auth } = await getTestInstance({
// 			plugins: [
// 				deviceAuthorization({
// 					expiresIn: 60, // 1 minute
// 				}),
// 			],
// 		});
//
// 		const response = await auth.api.deviceCode({
// 			body: {
// 				client_id: "test-client",
// 			},
// 		});
// 		expect(response.expires_in).toBe(60);
// 	});
//
// 	it("should use custom verification URI", async () => {
// 		const customUri = "https://example.com/verify";
//
// 		const { auth } = await getTestInstance({
// 			plugins: [
// 				deviceAuthorization({
// 					verificationURL: customUri,
// 				}),
// 			],
// 		});
//
// 		const response = await auth.api.deviceCode({
// 			body: {
// 				client_id: "test-client",
// 			},
// 		});
// 		expect(response.verification_uri).toBe(customUri);
// 		expect(response.verification_uri_complete).toContain(customUri);
// 	});
//
// 	it("should disable rate limiting when configured", async () => {
// 		const { auth } = await getTestInstance({
// 			plugins: [
// 				deviceAuthorization({
// 					enableRateLimiting: false,
// 				}),
// 			],
// 		});
//
// 		const { device_code } = await auth.api.deviceCode({
// 			body: {
// 				client_id: "test-client",
// 			},
// 		});
//
// 		for (let i = 0; i < 3; i++) {
// 			const response = await auth.api.deviceToken({
// 				body: {
// 					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
// 					device_code: device_code,
// 					client_id: "test-client",
// 				},
// 			});
// 			expect("error" in response && response.error).toBe(
// 				"authorization_pending",
// 			);
// 		}
// 	});
// });
