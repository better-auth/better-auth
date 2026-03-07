import type { OAuthClient } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import { ciba } from "./index";
import { isSecureEndpoint } from "./utils";

describe("isSecureEndpoint", () => {
	it("should accept HTTPS URLs", () => {
		expect(isSecureEndpoint("https://example.com/callback")).toBe(true);
	});
	it("should reject plain HTTP URLs", () => {
		expect(isSecureEndpoint("http://example.com/callback")).toBe(false);
	});
	it("should allow localhost HTTP (dev exemption)", () => {
		expect(isSecureEndpoint("http://localhost:4000/callback")).toBe(true);
	});
	it("should allow 127.0.0.1 HTTP", () => {
		expect(isSecureEndpoint("http://127.0.0.1:4000/callback")).toBe(true);
	});
	it("should allow [::1] HTTP", () => {
		expect(isSecureEndpoint("http://[::1]:4000/callback")).toBe(true);
	});
	it("should reject invalid URLs", () => {
		expect(isSecureEndpoint("not-a-url")).toBe(false);
	});
});

describe("ciba", async () => {
	const baseURL = "http://localhost:3000";
	const notifications: Array<{
		userId: string;
		authReqId: string;
		clientName?: string;
		scope: string;
		bindingMessage?: string;
		approvalUrl: string;
	}> = [];

	const { auth, signInWithTestUser, customFetchImpl, testUser } =
		await getTestInstance({
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
				ciba({
					sendNotification: async (data) => {
						notifications.push(data);
					},
				}),
			],
		});

	const { headers } = await signInWithTestUser();
	let oauthClient: OAuthClient;

	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["http://localhost:5000/callback"],
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		oauthClient = response!;
	});

	describe("bc-authorize", () => {
		it("should accept a valid CIBA request", async () => {
			const res = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid profile",
					login_hint: testUser.email,
				},
			});
			expect(res.auth_req_id).toBeDefined();
			expect(res.expires_in).toBeDefined();
			expect(res.interval).toBe(5);
			expect(notifications.length).toBeGreaterThan(0);
		});

		it("should reject request without openid scope", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						scope: "profile",
						login_hint: testUser.email,
					},
				}),
			).rejects.toThrow();
		});

		it("should reject request with no hints", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						scope: "openid",
					} as any,
				}),
			).rejects.toThrow();
		});

		it("should reject request with multiple hints", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						scope: "openid",
						login_hint: testUser.email,
						id_token_hint: "some-token",
					},
				}),
			).rejects.toThrow();
		});

		it("should reject request for unknown user", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						scope: "openid",
						login_hint: "nonexistent@example.com",
					},
				}),
			).rejects.toThrow();
		});
	});

	describe("token polling", () => {
		function pollToken(params: Record<string, string>) {
			return customFetchImpl(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams(params),
			});
		}

		function cibaTokenParams(authReqId: string) {
			return {
				grant_type: "urn:openid:params:grant-type:ciba",
				client_id: oauthClient.client_id,
				client_secret: oauthClient.client_secret!,
				auth_req_id: authReqId,
			};
		}

		it("should return authorization_pending for pending request", async () => {
			const bcRes = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid",
					login_hint: testUser.email,
				},
			});

			const tokenRes = await pollToken(
				cibaTokenParams(bcRes.auth_req_id as string),
			);

			expect(tokenRes.status).toBe(400);
			const body = await tokenRes.json();
			expect(body.error).toBe("authorization_pending");
		});

		it("should issue tokens after approval", async () => {
			const bcRes = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid profile",
					login_hint: testUser.email,
				},
			});

			await auth.api.cibaAuthorize({
				headers,
				body: { auth_req_id: bcRes.auth_req_id as string },
			});

			const tokenRes = await pollToken(
				cibaTokenParams(bcRes.auth_req_id as string),
			);

			expect(tokenRes.status).toBe(200);
			const tokenBody = await tokenRes.json();
			expect(tokenBody.access_token).toBeDefined();
			expect(tokenBody.token_type).toBe("Bearer");
			expect(tokenBody.scope).toContain("openid");
		});

		it("should reject replay after token issuance", async () => {
			const bcRes = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid",
					login_hint: testUser.email,
				},
			});

			await auth.api.cibaAuthorize({
				headers,
				body: { auth_req_id: bcRes.auth_req_id as string },
			});

			// First poll: success
			await pollToken(cibaTokenParams(bcRes.auth_req_id as string));

			// Second poll: should fail (request consumed)
			const replayRes = await pollToken(
				cibaTokenParams(bcRes.auth_req_id as string),
			);

			expect(replayRes.status).toBe(400);
			const body = await replayRes.json();
			expect(body.error).toBe("invalid_grant");
		});

		it("should return access_denied after rejection", async () => {
			const bcRes = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid",
					login_hint: testUser.email,
				},
			});

			await auth.api.cibaReject({
				headers,
				body: { auth_req_id: bcRes.auth_req_id as string },
			});

			const tokenRes = await pollToken(
				cibaTokenParams(bcRes.auth_req_id as string),
			);

			expect(tokenRes.status).toBe(400);
			const body = await tokenRes.json();
			expect(body.error).toBe("access_denied");
		});
	});

	describe("approval flow", () => {
		it("should allow the request owner to approve", async () => {
			const bcRes = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid",
					login_hint: testUser.email,
				},
			});

			// The signed-in user IS the test user, so this should succeed
			const result = await auth.api.cibaAuthorize({
				headers,
				body: { auth_req_id: bcRes.auth_req_id as string },
			});
			expect(result.success).toBe(true);
		});

		it("should prevent double-approve", async () => {
			const bcRes = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid",
					login_hint: testUser.email,
				},
			});

			// First approve
			await auth.api.cibaAuthorize({
				headers,
				body: { auth_req_id: bcRes.auth_req_id as string },
			});

			// Second approve should fail
			await expect(
				auth.api.cibaAuthorize({
					headers,
					body: { auth_req_id: bcRes.auth_req_id as string },
				}),
			).rejects.toThrow();
		});
	});

	describe("verify endpoint", () => {
		it("should return request details", async () => {
			const bcRes = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid profile",
					login_hint: testUser.email,
					binding_message: "Approve login to TestApp",
				},
			});

			const verifyRes = await auth.api.cibaVerify({
				query: { auth_req_id: bcRes.auth_req_id as string },
			});

			expect(verifyRes.auth_req_id).toBe(bcRes.auth_req_id);
			expect(verifyRes.scope).toBe("openid profile");
			expect(verifyRes.binding_message).toBe("Approve login to TestApp");
			expect(verifyRes.status).toBe("pending");
			expect(verifyRes.expires_at).toBeDefined();
		});

		it("should return 404 for unknown auth_req_id", async () => {
			await expect(
				auth.api.cibaVerify({
					query: { auth_req_id: "nonexistent" },
				}),
			).rejects.toThrow();
		});
	});

	describe("malformed authorization_details", () => {
		it("should reject invalid JSON in authorization_details", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						scope: "openid",
						login_hint: testUser.email,
						authorization_details: "not valid json {{{",
					},
				}),
			).rejects.toThrow();
		});

		it("should accept valid JSON in authorization_details", async () => {
			const res = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid",
					login_hint: testUser.email,
					authorization_details: JSON.stringify([
						{ type: "payment", amount: 100 },
					]),
				},
			});
			expect(res.auth_req_id).toBeDefined();
		});
	});

	describe("push mode polling blocked", () => {
		it("should reject token polling for push-mode requests", async () => {
			// Create a separate instance with push delivery enabled
			const pushNotifications: unknown[] = [];
			const {
				auth: pushAuth,
				signInWithTestUser: pushSignIn,
				customFetchImpl: pushFetch,
			} = await getTestInstance({
				baseURL,
				plugins: [
					jwt({ jwt: { issuer: baseURL } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					ciba({
						deliveryModes: ["push", "poll"],
						sendNotification: async (data) => {
							pushNotifications.push(data);
						},
						resolveClientNotificationEndpoint: async () =>
							"https://client.example.com/ciba-callback",
					}),
				],
			});

			const { headers: pushHeaders } = await pushSignIn();
			const pushClient = await pushAuth.api.adminCreateOAuthClient({
				headers: pushHeaders,
				body: {
					redirect_uris: ["http://localhost:5000/callback"],
					skip_consent: true,
				},
			});

			// Create a push-mode CIBA request (token + endpoint → push)
			const bcRes = await pushAuth.api.bcAuthorize({
				body: {
					client_id: pushClient!.client_id,
					client_secret: pushClient!.client_secret!,
					scope: "openid",
					login_hint: "test@test.com",
					client_notification_token: "push-bearer-token",
				},
			});
			expect(bcRes.auth_req_id).toBeDefined();
			// Push mode: no interval in response
			expect(bcRes.interval).toBeUndefined();

			// Attempt to poll — should be rejected
			const tokenRes = await pushFetch(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					grant_type: "urn:openid:params:grant-type:ciba",
					client_id: pushClient!.client_id,
					client_secret: pushClient!.client_secret!,
					auth_req_id: bcRes.auth_req_id as string,
				}),
			});

			expect(tokenRes.status).toBe(400);
			const body = await tokenRes.json();
			expect(body.error).toBe("invalid_grant");
		});
	});

	describe("id_token_hint validation", () => {
		it("should reject an invalid id_token_hint", async () => {
			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						scope: "openid",
						id_token_hint: "not-a-valid-jwt",
					},
				}),
			).rejects.toThrow();
		});

		it("should reject a well-formed JWT with wrong signature", async () => {
			// Craft a JWT signed with the wrong key
			const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");
			const payload = btoa(
				JSON.stringify({
					sub: "fake-user-id",
					aud: oauthClient.client_id,
					iss: baseURL,
					exp: Math.floor(Date.now() / 1000) + 3600,
				}),
			)
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");
			const fakeJwt = `${header}.${payload}.invalid-signature`;

			await expect(
				auth.api.bcAuthorize({
					body: {
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						scope: "openid",
						id_token_hint: fakeJwt,
					},
				}),
			).rejects.toThrow();
		});

		it("should accept a valid id_token from a previous flow", async () => {
			// Complete a full CIBA flow to get a valid id_token
			const bcRes = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid",
					login_hint: testUser.email,
				},
			});

			await auth.api.cibaAuthorize({
				headers,
				body: { auth_req_id: bcRes.auth_req_id as string },
			});

			const tokenRes = await customFetchImpl(
				`${baseURL}/api/auth/oauth2/token`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						grant_type: "urn:openid:params:grant-type:ciba",
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						auth_req_id: bcRes.auth_req_id as string,
					}),
				},
			);

			expect(tokenRes.status).toBe(200);
			const tokenBody = await tokenRes.json();
			expect(tokenBody.id_token).toBeDefined();

			// Now use that id_token as a hint in a new CIBA request
			const bcRes2 = await auth.api.bcAuthorize({
				body: {
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					scope: "openid",
					id_token_hint: tokenBody.id_token,
				},
			});

			expect(bcRes2.auth_req_id).toBeDefined();
			expect(bcRes2.expires_in).toBeDefined();
		});
	});

	describe("HTTPS enforcement", () => {
		it("should reject HTTP push notification endpoints", async () => {
			const pushNotifications: unknown[] = [];
			const { auth: httpAuth, signInWithTestUser: httpSignIn } =
				await getTestInstance({
					baseURL,
					plugins: [
						jwt({ jwt: { issuer: baseURL } }),
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							silenceWarnings: {
								oauthAuthServerConfig: true,
								openidConfig: true,
							},
						}),
						ciba({
							deliveryModes: ["push", "poll"],
							sendNotification: async (data) => {
								pushNotifications.push(data);
							},
							// HTTP endpoint (not HTTPS, not localhost)
							resolveClientNotificationEndpoint: async () =>
								"http://external.example.com/ciba-callback",
						}),
					],
				});

			const { headers: httpHeaders } = await httpSignIn();
			const httpClient = await httpAuth.api.adminCreateOAuthClient({
				headers: httpHeaders,
				body: {
					redirect_uris: ["http://localhost:5000/callback"],
					skip_consent: true,
				},
			});

			await expect(
				httpAuth.api.bcAuthorize({
					body: {
						client_id: httpClient!.client_id,
						client_secret: httpClient!.client_secret!,
						scope: "openid",
						login_hint: "test@test.com",
						client_notification_token: "push-bearer-token",
					},
				}),
			).rejects.toThrow();
		});

		it("should allow localhost push endpoints for dev", async () => {
			const devNotifications: unknown[] = [];
			const { auth: devAuth, signInWithTestUser: devSignIn } =
				await getTestInstance({
					baseURL,
					plugins: [
						jwt({ jwt: { issuer: baseURL } }),
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							silenceWarnings: {
								oauthAuthServerConfig: true,
								openidConfig: true,
							},
						}),
						ciba({
							deliveryModes: ["push", "poll"],
							sendNotification: async (data) => {
								devNotifications.push(data);
							},
							resolveClientNotificationEndpoint: async () =>
								"http://localhost:4000/ciba-callback",
						}),
					],
				});

			const { headers: devHeaders } = await devSignIn();
			const devClient = await devAuth.api.adminCreateOAuthClient({
				headers: devHeaders,
				body: {
					redirect_uris: ["http://localhost:5000/callback"],
					skip_consent: true,
				},
			});

			const bcRes = await devAuth.api.bcAuthorize({
				body: {
					client_id: devClient!.client_id,
					client_secret: devClient!.client_secret!,
					scope: "openid",
					login_hint: "test@test.com",
					client_notification_token: "push-bearer-token",
				},
			});
			expect(bcRes.auth_req_id).toBeDefined();
			// Push mode: no interval
			expect(bcRes.interval).toBeUndefined();
		});
	});

	describe("discovery metadata", () => {
		it("should include CIBA fields in openid-configuration", async () => {
			const config = await auth.api.getOpenIdConfig();
			expect(config.backchannel_authentication_endpoint).toBe(
				`${baseURL}/api/auth/oauth2/bc-authorize`,
			);
			expect(config.backchannel_token_delivery_modes_supported).toEqual([
				"poll",
			]);
			expect(config.backchannel_user_code_parameter_supported).toBe(false);
			expect(config.grant_types_supported).toContain(
				"urn:openid:params:grant-type:ciba",
			);
		});
	});
});
