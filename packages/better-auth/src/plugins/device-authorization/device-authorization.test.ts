import type { BetterAuthOptions } from "@better-auth/core";
import { getAuthTables } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { APIError } from "@better-auth/core/error";
import type { MemoryDB } from "@better-auth/memory-adapter";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { getTestInstance } from "../../test-utils/test-instance";
import type { DeviceAuthorizationGrant } from ".";
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
			expiresIn: "1m",
			interval: "2s",
			deviceCodeLength: 50,
			userCodeLength: 10,
		});
		expect(options).toMatchInlineSnapshot(`
			{
			  "deviceCodeLength": 50,
			  "expiresIn": "1m",
			  "interval": "2s",
			  "userCodeLength": 10,
			}
		`);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10025
	 */
	it("should reject generated code lengths that exceed indexed columns", () => {
		expect(() =>
			deviceAuthorizationOptionsSchema.parse({ deviceCodeLength: 192 }),
		).toThrow();
		expect(() =>
			deviceAuthorizationOptionsSchema.parse({ userCodeLength: 192 }),
		).toThrow();
	});
});

describe("user code verification rate limiting", async () => {
	const { auth } = await getTestInstance({
		disableTestUser: true,
		rateLimit: {
			enabled: true,
		},
		plugins: [deviceAuthorization()],
	});

	it("returns 429 after five verification guesses", async () => {
		const responses: Response[] = [];
		for (let attempt = 0; attempt < 6; attempt++) {
			responses.push(
				await auth.handler(
					new Request(
						`http://localhost:3000/api/auth/device?user_code=INVALID${attempt}`,
						{
							headers: { "x-forwarded-for": "192.0.2.42" },
						},
					),
				),
			);
		}

		expect(responses.slice(0, 5).map((response) => response.status)).toEqual([
			400, 400, 400, 400, 400,
		]);
		expect(responses[5]?.status).toBe(429);
	});

	it("does not apply the verification limit to token polling", async () => {
		const clientIP = "192.0.2.43";
		const deviceCodeResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/device/code", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-forwarded-for": clientIP,
				},
				body: JSON.stringify({ client_id: "test-client" }),
			}),
		);
		expect(deviceCodeResponse.status).toBe(200);
		const { device_code } = (await deviceCodeResponse.json()) as {
			device_code: string;
		};

		for (let attempt = 0; attempt < 5; attempt++) {
			const response = await auth.handler(
				new Request(
					`http://localhost:3000/api/auth/device?user_code=INVALID${attempt}`,
					{
						headers: { "x-forwarded-for": clientIP },
					},
				),
			);
			expect(response.status).toBe(400);
		}

		for (let poll = 0; poll < 6; poll++) {
			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/device/token", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-forwarded-for": clientIP,
					},
					body: JSON.stringify({
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code,
						client_id: "test-client",
					}),
				}),
			);
			expect(response.status).not.toBe(429);
		}
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

describe("grant request validation", () => {
	it("delegates grant-field validation errors to the configured grant", async () => {
		const grant = {
			requestSchemaFields: { grant_value: z.string() },
			requestErrorCodes: ["grant_invalid"] as const,
			onRequestValidationError: (issues) => {
				if (!issues.every((issue) => issue.path?.[0] === "grant_value")) {
					return;
				}
				throw new APIError("BAD_REQUEST", {
					error: "grant_invalid",
					error_description: "Invalid grant request",
				});
			},
			deviceCodeSchemaFields: {},
			authorizeRequest: () => undefined,
			assertSessionRedemption: () => {},
			getVerificationContext: () => undefined,
		} satisfies DeviceAuthorizationGrant;
		const { auth } = await getTestInstance({
			plugins: [deviceAuthorization({ grant })],
		});

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/device/code", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ client_id: "client", grant_value: 42 }),
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "grant_invalid",
			error_description: "Invalid grant request",
		});
	});

	it("runs before the application callback", async () => {
		const authorizeRequest = vi.fn().mockRejectedValue(new Error("rejected"));
		const onDeviceAuthRequest = vi.fn();
		const grant = {
			requestSchemaFields: {},
			deviceCodeSchemaFields: {},
			authorizeRequest,
			assertSessionRedemption: () => {},
			getVerificationContext: () => undefined,
		} satisfies DeviceAuthorizationGrant;
		const { auth } = await getTestInstance({
			plugins: [deviceAuthorization({ grant, onDeviceAuthRequest })],
		});

		await expect(
			auth.api.deviceCode({ body: { client_id: "client" } }),
		).rejects.toThrow("rejected");
		expect(authorizeRequest).toHaveBeenCalledOnce();
		expect(onDeviceAuthRequest).not.toHaveBeenCalled();
	});
});

describe("grant verification context", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10746#discussion_r3760240763
	 */
	it("does not let grant context overwrite host-owned response fields", async () => {
		const grant = {
			requestSchemaFields: {},
			deviceCodeSchemaFields: {},
			authorizeRequest: () => undefined,
			assertSessionRedemption: () => {},
			getVerificationContext: () => ({
				user_code: "grant-user-code",
				status: "grant-status",
				client_id: "grant-client",
				scope: "grant-scope",
				grant_field: "grant-value",
			}),
		} satisfies DeviceAuthorizationGrant;
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				deviceAuthorization({ grant, validateClient: async () => true }),
			],
		});
		const { headers } = await signInWithTestUser();
		const { user_code } = await auth.api.deviceCode({
			body: {
				client_id: "client",
				scope: "read",
			},
		});

		const response = await auth.api.deviceVerify({
			query: { user_code },
			headers,
		});

		expect(response).toMatchObject({
			user_code,
			status: "pending",
			client_id: "client",
			scope: "read",
			grant_field: "grant-value",
		});
	});
});

describe("device authorization flow", async () => {
	const { auth, signInWithTestUser, db } = await getTestInstance(
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
		afterEach(() => {
			vi.useRealTimers();
		});

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
		it("accepts lowercase user codes for verification, approval, and denial", async () => {
			const { headers } = await signInWithTestUser();
			const createLowercaseUserCode = async () => {
				const { user_code } = await auth.api.deviceCode({
					body: { client_id: "test-client" },
				});
				return user_code.toLowerCase();
			};

			const verificationUserCode = await createLowercaseUserCode();
			const verification = await auth.api.deviceVerify({
				query: { user_code: verificationUserCode },
				headers,
			});
			expect(verification.status).toBe("pending");

			const approvalUserCode = await createLowercaseUserCode();
			await auth.api.deviceVerify({
				query: { user_code: approvalUserCode },
				headers,
			});
			await expect(
				auth.api.deviceApprove({
					body: { userCode: approvalUserCode },
					headers,
				}),
			).resolves.toMatchObject({ success: true });

			const denialUserCode = await createLowercaseUserCode();
			await auth.api.deviceVerify({
				query: { user_code: denialUserCode },
				headers,
			});
			await expect(
				auth.api.deviceDeny({
					body: { userCode: denialUserCode },
					headers,
				}),
			).resolves.toMatchObject({ success: true });
		});

		it("ignores readability punctuation and whitespace for default user codes", async () => {
			const { headers } = await signInWithTestUser();
			const formatUserCode = (userCode: string) =>
				` \t${userCode.slice(0, 2)}-${userCode.slice(2, 4)}.${userCode.slice(4)} \n`;
			const createFormattedUserCode = async () => {
				const { user_code } = await auth.api.deviceCode({
					body: { client_id: "test-client" },
				});
				return formatUserCode(user_code);
			};

			const verificationUserCode = await createFormattedUserCode();
			const verification = await auth.api.deviceVerify({
				query: { user_code: verificationUserCode },
				headers,
			});
			expect(verification.status).toBe("pending");

			const approvalUserCode = await createFormattedUserCode();
			await auth.api.deviceVerify({
				query: { user_code: approvalUserCode },
				headers,
			});
			await expect(
				auth.api.deviceApprove({
					body: { userCode: approvalUserCode },
					headers,
				}),
			).resolves.toMatchObject({ success: true });

			const denialUserCode = await createFormattedUserCode();
			await auth.api.deviceVerify({
				query: { user_code: denialUserCode },
				headers,
			});
			await expect(
				auth.api.deviceDeny({
					body: { userCode: denialUserCode },
					headers,
				}),
			).resolves.toMatchObject({ success: true });
		});

		it("only returns authorization context to the authenticated owner", async () => {
			const { user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
					scope: "read write",
				},
			});

			const anonymousResponse = await auth.api.deviceVerify({
				query: { user_code },
			});
			expect(anonymousResponse).toMatchObject({
				user_code,
				status: "pending",
			});
			expect(anonymousResponse).not.toHaveProperty("client_id");
			expect(anonymousResponse).not.toHaveProperty("scope");
			expect(anonymousResponse).not.toHaveProperty("resource");

			const { headers } = await signInWithTestUser();
			const response = await auth.api.deviceVerify({
				query: { user_code },
				headers,
			});
			expect("error" in response).toBe(false);
			if (!("error" in response)) {
				expect(response.user_code).toBe(user_code);
				expect(response.status).toBe("pending");
				expect(response.client_id).toBe("test-client");
				expect(response.scope).toBe("read write");
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
		// RFC 8628 §3.2: the device authorization response must not be cached.
		it("sends no-store on the device code response", async () => {
			const response = await auth.api.deviceCode({
				body: { client_id: "test-client" },
				asResponse: true,
			});
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			expect(response.headers.get("Pragma")).toBe("no-cache");
		});

		// The device token response carries live credentials.
		it("sends no-store on the device token response", async () => {
			const { headers } = await signInWithTestUser();
			const { device_code, user_code } = await auth.api.deviceCode({
				body: { client_id: "test-client" },
			});
			await auth.api.deviceVerify({ query: { user_code }, headers });
			await auth.api.deviceApprove({ body: { userCode: user_code }, headers });
			const response = await auth.api.deviceToken({
				body: {
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code,
					client_id: "test-client",
				},
				asResponse: true,
			});
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			expect(response.headers.get("Pragma")).toBe("no-cache");
		});

		it("should approve device and create session", async () => {
			// First, sign in as a user
			const { headers } = await signInWithTestUser();

			// Request device code
			const { device_code, user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			await auth.api.deviceVerify({
				query: { user_code },
				headers,
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
			const { headers } = await signInWithTestUser();

			const { device_code, user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			await auth.api.deviceVerify({
				query: { user_code },
				headers,
			});

			// Deny the device
			const denyResponse = await auth.api.deviceDeny({
				body: { userCode: user_code },
				headers,
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
			await auth.api.deviceVerify({
				query: { user_code: userCode },
				headers,
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

			await auth.api.deviceVerify({
				query: { user_code },
				headers,
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

		it("should require authentication for deny", async () => {
			const { user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			await expect(
				auth.api.deviceDeny({
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

		it("should allow first user to approve but prevent re-approval", async () => {
			// Sign in as user
			const { headers } = await signInWithTestUser();

			// Request device code
			const { user_code } = await auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			});

			await auth.api.deviceVerify({
				query: { user_code },
				headers,
			});

			// User approves - this should succeed
			const approveResponse = await auth.api.deviceApprove({
				body: { userCode: user_code },
				headers,
			});
			expect("success" in approveResponse && approveResponse.success).toBe(
				true,
			);

			// Verify the device code is now approved
			const cleanUserCode = user_code.replace(/-/g, "");
			const deviceCodeRecord = await db.findOne<DeviceCode>({
				model: "deviceCode",
				where: [{ field: "userCode", value: cleanUserCode }],
			});
			expect(deviceCodeRecord?.status).toBe("approved");
			expect(deviceCodeRecord?.userId).toBeDefined();

			// Try to approve again - should fail because already processed
			await expect(
				auth.api.deviceApprove({
					body: { userCode: user_code },
					headers,
				}),
			).rejects.toMatchObject({
				body: {
					error: "invalid_request",
					error_description: "Device code already processed",
				},
			});
		});
	});

	describe("concurrent token redemption", () => {
		// Invariant: an approved device code is single-use. Two polls racing to
		// redeem the same approved code must yield exactly one token; the loser
		// is rejected and the row must not survive for a third redemption.
		it("should redeem an approved device code at most once under concurrent polling", async () => {
			const { headers } = await signInWithTestUser();

			const { device_code, user_code } = await auth.api.deviceCode({
				body: { client_id: "test-client" },
			});

			await auth.api.deviceVerify({
				query: { user_code },
				headers,
			});

			await auth.api.deviceApprove({
				body: { userCode: user_code },
				headers,
			});

			const poll = () =>
				auth.api
					.deviceToken({
						body: {
							grant_type: "urn:ietf:params:oauth:grant-type:device_code",
							device_code,
							client_id: "test-client",
						},
					})
					.then(
						(value) => ({ ok: true as const, value }),
						(error) => ({ ok: false as const, error }),
					);

			const results = await Promise.all([poll(), poll()]);

			const successes = results.filter(
				(result) => result.ok && "access_token" in result.value,
			);
			expect(successes).toHaveLength(1);

			const rowAfter = await db.findOne<DeviceCode>({
				model: "deviceCode",
				where: [{ field: "deviceCode", value: device_code }],
			});
			expect(rowAfter).toBeNull();

			await expect(
				auth.api.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code,
						client_id: "test-client",
					},
				}),
			).rejects.toMatchObject({
				body: { error: "invalid_grant" },
			});
		});

		/**
		 * @see https://github.com/better-auth/better-auth/pull/10746#discussion_r3751447613
		 */
		it("should preserve an approved code when user lookup fails before session issuance", async () => {
			const { headers } = await signInWithTestUser();
			const { device_code, user_code } = await auth.api.deviceCode({
				body: { client_id: "test-client" },
			});

			await auth.api.deviceVerify({ query: { user_code }, headers });
			await auth.api.deviceApprove({
				body: { userCode: user_code },
				headers,
			});

			await db.update({
				model: "deviceCode",
				where: [{ field: "deviceCode", value: device_code }],
				update: { userId: "missing-user" },
			});
			await expect(
				auth.api.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code,
						client_id: "test-client",
					},
				}),
			).rejects.toMatchObject({
				body: { error: "server_error" },
			});

			const stored = await db.findOne<DeviceCode>({
				model: "deviceCode",
				where: [{ field: "deviceCode", value: device_code }],
			});
			expect(stored?.status).toBe("approved");
		});

		it("should burn an expired approved device code instead of issuing a token", async () => {
			const { headers } = await signInWithTestUser();

			const { device_code, user_code } = await auth.api.deviceCode({
				body: { client_id: "test-client" },
			});

			await auth.api.deviceVerify({
				query: { user_code },
				headers,
			});

			await auth.api.deviceApprove({
				body: { userCode: user_code },
				headers,
			});

			await db.update({
				model: "deviceCode",
				where: [{ field: "deviceCode", value: device_code }],
				update: { expiresAt: new Date(Date.now() - 1000) },
			});

			await expect(
				auth.api.deviceToken({
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code,
						client_id: "test-client",
					},
				}),
			).rejects.toMatchObject({
				body: { error: "expired_token" },
			});

			const rowAfter = await db.findOne<DeviceCode>({
				model: "deviceCode",
				where: [{ field: "deviceCode", value: device_code }],
			});
			expect(rowAfter).toBeNull();
		});
	});
});

describe("device authorization ownership gate", () => {
	const ATTACKER_EMAIL = "attacker@example.test";
	const ATTACKER_PASSWORD = "attacker-password-123";

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-cq3f-vc6p-68fh
	 */
	it("rejects approve from a session that did not claim the pending code", async () => {
		const { auth, client, db, signInWithUser } = await getTestInstance(
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

		await client.signUp.email({
			email: ATTACKER_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "attacker",
		});
		const { headers: attackerHeaders, res: attackerSession } =
			await signInWithUser(ATTACKER_EMAIL, ATTACKER_PASSWORD);
		const attackerId = attackerSession.user.id;

		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});
		expect(device_code).toBeTruthy();
		expect(user_code).toBeTruthy();

		await expect(
			auth.api.deviceApprove({
				body: { userCode: user_code },
				headers: attackerHeaders,
			}),
		).rejects.toMatchObject({
			body: { error: "invalid_request" },
		});

		const rowAfter = await db.findOne<DeviceCode>({
			model: "deviceCode",
			where: [{ field: "userCode", value: user_code }],
		});
		expect(rowAfter?.userId).not.toBe(attackerId);
		expect(rowAfter?.status).toBe("pending");

		await expect(
			auth.api.deviceToken({
				body: {
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code,
					client_id: "test-client",
				},
			}),
		).rejects.toMatchObject({
			body: { error: "authorization_pending" },
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-cq3f-vc6p-68fh
	 */
	it("rejects deny from a session that did not claim the pending code", async () => {
		const { auth, client, db, signInWithUser } = await getTestInstance(
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

		await client.signUp.email({
			email: ATTACKER_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "attacker",
		});
		const { headers: attackerHeaders, res: attackerSession } =
			await signInWithUser(ATTACKER_EMAIL, ATTACKER_PASSWORD);
		const attackerId = attackerSession.user.id;

		const { user_code } = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});

		await expect(
			auth.api.deviceDeny({
				body: { userCode: user_code },
				headers: attackerHeaders,
			}),
		).rejects.toMatchObject({
			body: { error: "invalid_request" },
		});

		const rowAfter = await db.findOne<DeviceCode>({
			model: "deviceCode",
			where: [{ field: "userCode", value: user_code }],
		});
		expect(rowAfter?.userId).not.toBe(attackerId);
		expect(rowAfter?.status).toBe("pending");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-cq3f-vc6p-68fh
	 */
	it("allows approve when the same session called verify first", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					expiresIn: "5min",
					interval: "2s",
				}),
			],
		});

		const { headers: legitHeaders } = await signInWithTestUser();

		const { user_code } = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});

		await auth.api.deviceVerify({
			query: { user_code },
			headers: legitHeaders,
		});

		const approve = await auth.api.deviceApprove({
			body: { userCode: user_code },
			headers: legitHeaders,
		});
		expect(approve).toMatchObject({ success: true });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-cq3f-vc6p-68fh
	 */
	it("does not expose or authorize a code claimed by a different user", async () => {
		const { auth, client, signInWithTestUser, signInWithUser } =
			await getTestInstance(
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

		const { headers: claimerHeaders } = await signInWithTestUser();

		await client.signUp.email({
			email: ATTACKER_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "attacker",
		});
		const { headers: attackerHeaders } = await signInWithUser(
			ATTACKER_EMAIL,
			ATTACKER_PASSWORD,
		);

		const { user_code } = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
				scope: "read write",
			},
		});

		await auth.api.deviceVerify({
			query: { user_code },
			headers: claimerHeaders,
		});

		const verification = await auth.api.deviceVerify({
			query: { user_code },
			headers: attackerHeaders,
		});
		expect(verification).not.toHaveProperty("client_id");
		expect(verification).not.toHaveProperty("scope");
		expect(verification).not.toHaveProperty("resource");

		await expect(
			auth.api.deviceApprove({
				body: { userCode: user_code },
				headers: attackerHeaders,
			}),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: { error: "access_denied" },
		});

		await expect(
			auth.api.deviceDeny({
				body: { userCode: user_code },
				headers: attackerHeaders,
			}),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: { error: "access_denied" },
		});
	});

	it("rejects approve from a different user if the code was generated for a different user_id", async () => {
		const { auth, client, signInWithTestUser, signInWithUser } =
			await getTestInstance(
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

		const { user } = await signInWithTestUser();

		await client.signUp.email({
			email: ATTACKER_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "attacker",
		});
		const { headers: attackerHeaders } = await signInWithUser(
			ATTACKER_EMAIL,
			ATTACKER_PASSWORD,
		);

		const { user_code } = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
				user_id: user.id,
			},
		});

		await expect(
			auth.api.deviceApprove({
				body: { userCode: user_code },
				headers: attackerHeaders,
			}),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: { error: "access_denied" },
		});

		await expect(
			auth.api.deviceDeny({
				body: { userCode: user_code },
				headers: attackerHeaders,
			}),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: { error: "access_denied" },
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10752#pullrequestreview-4910497732
	 */
	it("omits empty form base parameters regardless of order", async () => {
		const { auth, client, signInWithTestUser, signInWithUser } =
			await getTestInstance(
				{
					plugins: [deviceAuthorization()],
				},
				{
					clientOptions: {
						plugins: [deviceAuthorizationClient()],
					},
				},
			);
		const { headers: ownerHeaders, user } = await signInWithTestUser();
		await client.signUp.email({
			email: ATTACKER_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "attacker",
		});
		const { headers: attackerHeaders } = await signInWithUser(
			ATTACKER_EMAIL,
			ATTACKER_PASSWORD,
		);

		for (const emptyValueFirst of [true, false]) {
			const form = new URLSearchParams();
			for (const [field, value] of [
				["client_id", "test-client"],
				["scope", "read write"],
				["user_id", user.id],
			] as const) {
				const values = emptyValueFirst ? ["", value] : [value, ""];
				for (const fieldValue of values) form.append(field, fieldValue);
			}

			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/device/code", {
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
					},
					body: form,
				}),
			);
			expect(response.status).toBe(200);
			const { user_code: userCode } = (await response.json()) as {
				user_code: string;
			};

			const verification = await auth.api.deviceVerify({
				query: { user_code: userCode },
				headers: ownerHeaders,
			});
			expect(verification).toMatchObject({
				client_id: "test-client",
				scope: "read write",
			});
			await expect(
				auth.api.deviceApprove({
					body: { userCode },
					headers: attackerHeaders,
				}),
			).rejects.toMatchObject({
				status: "FORBIDDEN",
				body: { error: "access_denied" },
			});
		}
	});

	it("allows approve when the pre-bound user matches the current user", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					expiresIn: "5min",
					interval: "2s",
				}),
			],
		});

		const { headers: legitHeaders, user } = await signInWithTestUser();

		const { user_code } = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
				user_id: user.id,
			},
		});

		const approve = await auth.api.deviceApprove({
			body: { userCode: user_code },
			headers: legitHeaders,
		});
		expect(approve).toMatchObject({ success: true });
	});

	it("allows deny when the pre-bound user matches the current user", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					expiresIn: "5min",
					interval: "2s",
				}),
			],
		});

		const { headers: legitHeaders, user } = await signInWithTestUser();

		const { user_code } = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
				user_id: user.id,
			},
		});

		const deny = await auth.api.deviceDeny({
			body: { userCode: user_code },
			headers: legitHeaders,
		});

		expect(deny).toMatchObject({ success: true });
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.1
	 */
	it("treats an empty user_id as omitted and leaves the code unbound", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					expiresIn: "5min",
					interval: "2s",
				}),
			],
		});

		const { headers } = await signInWithTestUser();

		const { user_code } = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
				user_id: "",
			},
		});

		// The unbound code is claimable by any signed-in user via verify
		await auth.api.deviceVerify({
			query: { user_code },
			headers,
		});

		const approve = await auth.api.deviceApprove({
			body: { userCode: user_code },
			headers,
		});
		expect(approve).toMatchObject({ success: true });
	});

	it("does not overwrite a device code claimed after verify reads it", async () => {
		let adapter: DBAdapter<BetterAuthOptions> | null = null;
		let concurrentOwnerId: string | undefined;
		let simulateConcurrentClaim = false;

		const database = ((options: BetterAuthOptions) => {
			if (adapter) {
				return adapter;
			}
			const tables = getAuthTables(options);
			const memoryDB = Object.keys(tables).reduce<MemoryDB>((db, table) => {
				db[table] = [];
				return db;
			}, {});
			const baseAdapter = memoryAdapter(memoryDB)(options);
			adapter = {
				...baseAdapter,
				incrementOne: async <T>(
					data: Parameters<DBAdapter<BetterAuthOptions>["incrementOne"]>[0],
				) => {
					if (
						simulateConcurrentClaim &&
						concurrentOwnerId &&
						data.model === "deviceCode" &&
						(data.set as { userId?: string } | undefined)?.userId
					) {
						simulateConcurrentClaim = false;
						const deviceCodeId = data.where.find(
							(where) => where.field === "id",
						)?.value;
						if (typeof deviceCodeId === "string") {
							await baseAdapter.update<DeviceCode>({
								model: "deviceCode",
								where: [{ field: "id", value: deviceCodeId }],
								update: { userId: concurrentOwnerId },
							});
						}
					}
					return baseAdapter.incrementOne<T>(data);
				},
			};
			return adapter;
		}) satisfies BetterAuthOptions["database"];

		const { auth, client, db, signInWithUser } = await getTestInstance({
			database,
			plugins: [
				deviceAuthorization({
					expiresIn: "5min",
					interval: "2s",
				}),
			],
		});

		await client.signUp.email({
			email: "concurrent-owner@example.test",
			password: "concurrent-owner-password-123",
			name: "concurrent owner",
		});
		const { res: concurrentOwnerSession } = await signInWithUser(
			"concurrent-owner@example.test",
			"concurrent-owner-password-123",
		);
		concurrentOwnerId = concurrentOwnerSession.user.id;

		await client.signUp.email({
			email: "racer@example.test",
			password: "racer-password-123",
			name: "racer",
		});
		const { headers: racerHeaders, res: racerSession } = await signInWithUser(
			"racer@example.test",
			"racer-password-123",
		);

		const { user_code } = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});

		simulateConcurrentClaim = true;
		await auth.api.deviceVerify({
			query: { user_code },
			headers: racerHeaders,
		});

		const rowAfter = await db.findOne<DeviceCode>({
			model: "deviceCode",
			where: [{ field: "userCode", value: user_code }],
		});
		expect(rowAfter?.userId).toBe(concurrentOwnerId);
		expect(rowAfter?.userId).not.toBe(racerSession.user.id);
		expect(rowAfter?.status).toBe("pending");
	});
});

describe("device authorization with custom options", async () => {
	it("should correctly store interval as milliseconds in database", async () => {
		const { auth, db } = await getTestInstance({
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

	it("should regenerate codes when custom generators collide with active values", async () => {
		const deviceCodes = [
			"device-code-1",
			"device-code-1",
			"device-code-2",
			"device-code-3",
			"device-code-4",
		];
		const userCodes = [
			"USERCODE1",
			"USERCODE2",
			"USERCODE3",
			"USERCODE3",
			"USERCODE4",
		];

		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					generateDeviceCode: () => deviceCodes.shift()!,
					generateUserCode: () => userCodes.shift()!,
				}),
			],
		});

		const first = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});
		const second = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});
		const third = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});

		expect(second.device_code).toBe("device-code-2");
		expect(second.user_code).toBe("USERCODE3");
		expect(third.device_code).toBe("device-code-4");
		expect(third.user_code).toBe("USERCODE4");
		expect(second.device_code).not.toBe(first.device_code);
		expect(second.user_code).not.toBe(first.user_code);
		expect(third.device_code).not.toBe(first.device_code);
		expect(third.user_code).not.toBe(first.user_code);
		expect(third.device_code).not.toBe(second.device_code);
		expect(third.user_code).not.toBe(second.user_code);
	});

	it("should retry Prisma-style unique constraint errors during issuance", async () => {
		const deviceCodes = ["device-code-1", "device-code-2"];
		const userCodes = ["USERCODE1", "USERCODE2"];
		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					generateDeviceCode: () => deviceCodes.shift()!,
					generateUserCode: () => userCodes.shift()!,
				}),
			],
		});

		const adapter = (await auth.$context).adapter;
		const create = adapter.create.bind(adapter);
		let failedDeviceCodeCreate = false;
		vi.spyOn(adapter, "create").mockImplementation(async (input) => {
			if (input.model === "deviceCode" && !failedDeviceCodeCreate) {
				failedDeviceCodeCreate = true;
				throw Object.assign(new Error("Prisma collision"), {
					code: "P2002",
				});
			}
			return create(input);
		});
		const response = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});

		expect(response.device_code).toBe("device-code-2");
		expect(response.user_code).toBe("USERCODE2");
	});

	it("should inspect every database error identifier for unique violations", async () => {
		const deviceCodes = ["device-code-1", "device-code-2"];
		const userCodes = ["USERCODE1", "USERCODE2"];
		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					generateDeviceCode: () => deviceCodes.shift()!,
					generateUserCode: () => userCodes.shift()!,
				}),
			],
		});

		const adapter = (await auth.$context).adapter;
		const create = adapter.create.bind(adapter);
		let failedDeviceCodeCreate = false;
		vi.spyOn(adapter, "create").mockImplementation(async (input) => {
			if (input.model === "deviceCode" && !failedDeviceCodeCreate) {
				failedDeviceCodeCreate = true;
				throw Object.assign(new Error("SQL Server request failed"), {
					code: "EREQUEST",
					number: 2601,
				});
			}
			return create(input);
		});
		const response = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});

		expect(response.device_code).toBe("device-code-2");
		expect(response.user_code).toBe("USERCODE2");
	});

	it("should return a controlled server error when generators cannot produce unique codes", async () => {
		const generateDeviceCode = vi.fn(() => "device-code");
		const generateUserCode = vi.fn(() => "USERCODE");
		const { auth } = await getTestInstance({
			plugins: [deviceAuthorization({ generateDeviceCode, generateUserCode })],
		});

		await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});

		await expect(
			auth.api.deviceCode({
				body: { client_id: "test-client" },
			}),
		).rejects.toMatchObject({
			body: {
				error: "server_error",
				error_description: "Failed to generate a unique device code",
			},
		});

		expect(generateDeviceCode).toHaveBeenCalledTimes(4);
		expect(generateUserCode).toHaveBeenCalledTimes(4);
	});

	it("preserves exact matching for custom user codes outside the default alphabet", async () => {
		const customUserCodes = [
			"custom/user-code_01",
			"custom:user-code_02",
			"custom.user-code_03",
		];
		let userCodeIndex = 0;
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					generateUserCode: () => customUserCodes[userCodeIndex++] ?? "unused",
				}),
			],
		});
		const { headers } = await signInWithTestUser();

		const verificationResponse = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});
		await expect(
			auth.api.deviceVerify({
				query: { user_code: verificationResponse.user_code },
				headers,
			}),
		).resolves.toMatchObject({ status: "pending" });

		const approvalResponse = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});
		await auth.api.deviceVerify({
			query: { user_code: approvalResponse.user_code },
			headers,
		});
		await expect(
			auth.api.deviceApprove({
				body: { userCode: approvalResponse.user_code },
				headers,
			}),
		).resolves.toMatchObject({ success: true });

		const denialResponse = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});
		await auth.api.deviceVerify({
			query: { user_code: denialResponse.user_code },
			headers,
		});
		await expect(
			auth.api.deviceDeny({
				body: { userCode: denialResponse.user_code },
				headers,
			}),
		).resolves.toMatchObject({ success: true });
	});

	it("preserves custom user-code casing with case-insensitive adapters", async () => {
		const customUserCode = "Custom/User-Code";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				deviceAuthorization({ generateUserCode: () => customUserCode }),
			],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.deviceCode({ body: { client_id: "test-client" } });

		const adapter = (await auth.$context).adapter;
		const storedDeviceCode = await adapter.findOne<DeviceCode>({
			model: "deviceCode",
			where: [{ field: "userCode", value: customUserCode }],
		});
		if (!storedDeviceCode) throw new Error("device code was not stored");
		const findOne = adapter.findOne.bind(adapter);
		vi.spyOn(adapter, "findOne").mockImplementation(async (input) => {
			if (input.model === "deviceCode") return storedDeviceCode;
			return findOne(input);
		});

		await expect(
			auth.api.deviceVerify({
				query: { user_code: customUserCode.toLowerCase() },
				headers,
			}),
		).rejects.toMatchObject({
			body: { error: "invalid_request" },
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10025
	 */
	it.each([
		{
			label: "device",
			options: {
				generateDeviceCode: () => "d".repeat(192),
				generateUserCode: () => "USERCODE",
			},
		},
		{
			label: "user",
			options: {
				generateDeviceCode: () => "device-code",
				generateUserCode: () => "u".repeat(192),
			},
		},
	])("should reject an oversized custom $label code", async ({
		label,
		options,
	}) => {
		const { auth } = await getTestInstance({
			plugins: [deviceAuthorization(options)],
		});

		await expect(
			auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_request",
				error_description: `Generated ${label} code must be at most 191 characters`,
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10025
	 */
	it.each([
		"device",
		"user",
	] as const)("should reject a non-string custom %s code", async (label) => {
		const options = deviceAuthorizationOptionsSchema.parse(
			label === "device"
				? { generateDeviceCode: () => 42 }
				: { generateUserCode: () => 42 },
		);
		const { auth } = await getTestInstance({
			plugins: [deviceAuthorization(options)],
		});

		await expect(
			auth.api.deviceCode({
				body: {
					client_id: "test-client",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error: "invalid_request",
				error_description: `Generated ${label} code must be a string`,
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10025
	 */
	it("should count Unicode code points when validating custom codes", async () => {
		const customDeviceCode = "🦋".repeat(191);
		const { auth } = await getTestInstance({
			plugins: [
				deviceAuthorization({
					generateDeviceCode: () => customDeviceCode,
				}),
			],
		});

		const response = await auth.api.deviceCode({
			body: {
				client_id: "test-client",
			},
		});
		expect(response.device_code).toBe(customDeviceCode);
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
