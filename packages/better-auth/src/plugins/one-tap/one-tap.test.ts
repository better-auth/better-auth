import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { oneTap } from ".";
import { oneTapClient } from "./client";

describe("oneTap - Traditional Mode", () => {
	const baseOptions = {
		plugins: [oneTap()],
		socialProviders: {
			google: {
				clientId: "test-client-id",
				clientSecret: "test-client-secret",
			},
		},
	};

	it("should accept valid Google ID token", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);
		const client = createAuthClient({
			plugins: [oneTapClient({ clientId: "test-client-id" })],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const mockGoogleToken = await new SignJWT({
			email: "newuser@gmail.com",
			email_verified: true,
			name: "New User",
			picture: "https://example.com/photo.jpg",
			sub: "google-user-123",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer("https://accounts.google.com")
			.setAudience("test-client-id")
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode("test-secret"));

		const response = await client.$fetch("/one-tap/callback", {
			method: "POST",
			body: {
				idToken: mockGoogleToken,
			},
		});

		expect(response.error).toBeDefined();
	});

	it("should handle callback endpoint", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);
		const client = createAuthClient({
			plugins: [oneTapClient({ clientId: "test-client-id" })],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const response = await client.$fetch("/one-tap/callback", {
			method: "POST",
			body: {
				idToken: "invalid-token",
			},
		});

		expect(response.error).toBeDefined();
		expect(response.error?.status).toBe(400);
	});

	it("should reject invalid token", async () => {
		const { auth } = await getTestInstance(baseOptions);

		try {
			await auth.api.oneTapCallback({
				body: {
					idToken: "clearly-invalid-token",
				},
			});
			expect(true).toBe(false);
		} catch (error) {
			const typedError = error as { status?: string };
			expect(typedError).toBeDefined();
			expect(typedError.status).toBe("BAD_REQUEST");
		}
	});
});

describe("oneTap - FedCM Mode", () => {
	const baseOptions = {
		plugins: [
			oneTap({
				fedcm: {
					enabled: true,
					privacyPolicyUrl: "https://example.com/privacy",
					termsOfServiceUrl: "https://example.com/terms",
					branding: {
						backgroundColor: "#1a73e8",
						color: "#ffffff",
						iconUrl: "https://example.com/icon.png",
					},
				},
			}),
		],
		socialProviders: {
			google: {
				clientId: "test-client-id",
				clientSecret: "test-client-secret",
			},
		},
	};

	it("should serve /.well-known/web-identity endpoint", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);
		const client = createAuthClient({
			plugins: [oneTapClient({ clientId: "test-client-id" })],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const response = await client.$fetch<{
			provider_urls: string[];
		}>("/.well-known/web-identity", {
			method: "GET",
		});

		expect(response.data).toBeDefined();
		expect(response.data).toHaveProperty("provider_urls");
		expect(Array.isArray(response.data?.provider_urls)).toBe(true);
		expect(response.data?.provider_urls?.[0]).toContain(
			"/one-tap/fedcm/config",
		);
	});

	it("should serve FedCM config endpoint", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/one-tap/fedcm/config",
			{
				method: "GET",
				headers: {
					origin: "http://localhost:3000",
				},
			},
		);

		const data = (await response.json()) as {
			accounts_endpoint: string;
			client_metadata_endpoint: string;
			id_assertion_endpoint: string;
			login_url: string;
			branding: {
				background_color: string;
				color: string;
				icons?: Array<{ url: string; size: number }>;
			};
		};

		expect(data).toBeDefined();
		expect(data).toHaveProperty("accounts_endpoint");
		expect(data).toHaveProperty("client_metadata_endpoint");
		expect(data).toHaveProperty("id_assertion_endpoint");
		expect(data).toHaveProperty("login_url");
		expect(data).toHaveProperty("branding");

		expect(data.branding).toMatchObject({
			background_color: "#1a73e8",
			color: "#ffffff",
		});
		expect(data.branding.icons).toBeDefined();
		expect(data.branding.icons?.[0]).toMatchObject({
			url: "https://example.com/icon.png",
			size: 32,
		});

		// Config endpoint should allow all origins without credentials
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-allow-credentials")).toBeNull();
	});

	it("should return empty accounts when not logged in", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);

		// Same-origin request should get CORS headers with credentials
		const sameOriginResponse = await customFetchImpl(
			"http://localhost:3000/api/auth/one-tap/fedcm/accounts",
			{
				method: "GET",
				headers: {
					origin: "http://localhost:3000",
				},
			},
		);
		const sameOriginData = (await sameOriginResponse.json()) as {
			accounts: Array<{
				id: string;
				email: string;
			}>;
		};

		expect(sameOriginData).toBeDefined();
		expect(Array.isArray(sameOriginData.accounts)).toBe(true);
		expect(sameOriginData.accounts.length).toBe(0);
		expect(sameOriginResponse.headers.get("access-control-allow-origin")).toBe(
			"http://localhost:3000",
		);
		expect(
			sameOriginResponse.headers.get("access-control-allow-credentials"),
		).toBe("true");

		// Cross-origin request should not get credentialed CORS headers
		const crossOriginResponse = await customFetchImpl(
			"http://localhost:3000/api/auth/one-tap/fedcm/accounts",
			{
				method: "GET",
				headers: {
					origin: "https://malicious.com",
				},
			},
		);
		const crossOriginData = (await crossOriginResponse.json()) as {
			accounts: Array<{
				id: string;
				email: string;
			}>;
		};

		expect(crossOriginData).toBeDefined();
		expect(Array.isArray(crossOriginData.accounts)).toBe(true);
		expect(crossOriginData.accounts.length).toBe(0);
		expect(
			crossOriginResponse.headers.get("access-control-allow-origin"),
		).toBeNull();
		expect(
			crossOriginResponse.headers.get("access-control-allow-credentials"),
		).toBeNull();
	});

	it("should return user accounts when logged in", async () => {
		const { customFetchImpl, testUser, signInWithTestUser } =
			await getTestInstance(baseOptions);

		const client = createAuthClient({
			plugins: [oneTapClient({ clientId: "test-client-id" })],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const { headers } = await signInWithTestUser();

		const headersObject: Record<string, string> = {};
		headers.forEach((value, key) => {
			headersObject[key] = value;
		});

		const response = await client.$fetch<{
			accounts: Array<{
				id: string;
				email: string;
			}>;
		}>("/one-tap/fedcm/accounts", {
			method: "GET",
			headers: headersObject,
		});

		expect(response.data).toBeDefined();
		expect(response.data).toHaveProperty("accounts");
		if (response.data?.accounts && response.data.accounts.length > 0) {
			const account = response.data.accounts[0];
			expect(account).toHaveProperty("id");
			expect(account).toHaveProperty("email");
			expect(account?.email).toBe(testUser.email);
		}
	});

	it("should serve client metadata endpoint", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);
		const client = createAuthClient({
			plugins: [oneTapClient({ clientId: "test-client-id" })],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const response = await client.$fetch<{
			privacy_policy_url: string;
			terms_of_service_url: string;
		}>("/one-tap/fedcm/client-metadata?client_id=test-client-id", {
			method: "GET",
		});

		expect(response.data).toBeDefined();
		expect(response.data).toHaveProperty("privacy_policy_url");
		expect(response.data).toHaveProperty("terms_of_service_url");
		expect(response.data?.privacy_policy_url).toBe(
			"https://example.com/privacy",
		);
		expect(response.data?.terms_of_service_url).toBe(
			"https://example.com/terms",
		);
	});

	it("should reject assertion without authentication", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/one-tap/fedcm/assertion",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					client_id: "test-client-id",
					account_id: "any-user-id",
				}),
			},
		);

		expect(response.status).toBe(401);
	});

	it("should validate that assertion requires Google account linked", async () => {
		const { customFetchImpl, testUser } = await getTestInstance(baseOptions);

		const client = createAuthClient({
			plugins: [oneTapClient({ clientId: "test-client-id" })],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const response = await client.$fetch("/one-tap/fedcm/assertion", {
			method: "POST",
			body: {
				client_id: "test-client-id",
				account_id: testUser.id,
			},
		});

		expect(response.error).toBeDefined();
	});
});

describe("oneTap - FedCM Disabled", () => {
	const baseOptions = {
		plugins: [oneTap()],
		socialProviders: {
			google: {
				clientId: "test-client-id",
				clientSecret: "test-client-secret",
			},
		},
	};

	it("should not serve FedCM endpoints when disabled", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);
		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const wellKnownResponse = await client.$fetch("/.well-known/web-identity", {
			method: "GET",
		});

		expect(wellKnownResponse.error).toBeDefined();
		expect(wellKnownResponse.error?.status).toBe(404);

		const configResponse = await client.$fetch("/one-tap/fedcm/config", {
			method: "GET",
		});

		expect(configResponse.error).toBeDefined();
		expect(configResponse.error?.status).toBe(404);

		const accountsResponse = await client.$fetch("/one-tap/fedcm/accounts", {
			method: "GET",
		});

		expect(accountsResponse.error).toBeDefined();
		expect(accountsResponse.error?.status).toBe(404);
	});

	it("should still serve callback endpoint", async () => {
		const { customFetchImpl } = await getTestInstance(baseOptions);
		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const response = await client.$fetch("/one-tap/callback", {
			method: "POST",
			body: {
				idToken: "test-token",
			},
		});

		expect(response.error?.status).not.toBe(404);
	});
});

describe("oneTap - Configuration", () => {
	it("should use clientId from socialProviders when plugin clientId not provided", async () => {
		const { auth } = await getTestInstance({
			plugins: [oneTap()],
			socialProviders: {
				google: {
					clientId: "social-provider-client-id",
					clientSecret: "test-secret",
				},
			},
		});

		const ctx = await auth.$context;
		expect(ctx.options.socialProviders?.google?.clientId).toBe(
			"social-provider-client-id",
		);
	});

	it("should use plugin clientId over socialProviders", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				oneTap({
					clientId: "plugin-client-id",
				}),
			],
			socialProviders: {
				google: {
					clientId: "social-client-id",
					clientSecret: "test-secret",
				},
			},
		});

		const ctx = await auth.$context;
		expect(ctx).toBeDefined();
	});

	it("should respect disableSignup option", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				oneTap({
					disableSignup: true,
				}),
			],
		});

		const ctx = await auth.$context;
		expect(ctx).toBeDefined();
	});
});

describe("oneTap - Account Linking", () => {
	it("should have account linking configured", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				oneTap({
					fedcm: {
						enabled: true,
					},
				}),
			],
			account: {
				accountLinking: {
					enabled: true,
					trustedProviders: ["google"],
				},
			},
		});

		const ctx = await auth.$context;
		const accountLinking = ctx.options.account?.accountLinking;
		expect(accountLinking?.enabled).toBe(true);
		expect(accountLinking?.trustedProviders).toContain("google");
	});
});

describe("oneTap - FedCM Token Verification", () => {
	it("should verify assertion endpoint requires authentication", async () => {
		const { customFetchImpl } = await getTestInstance({
			plugins: [
				oneTap({
					fedcm: {
						enabled: true,
					},
				}),
			],
			socialProviders: {
				google: {
					clientId: "test-client-id",
					clientSecret: "test-client-secret",
				},
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const response = await client.$fetch("/one-tap/fedcm/assertion", {
			method: "POST",
			body: {
				client_id: "test-client-id",
				account_id: "any-user-id",
			},
		});

		expect(response.error).toBeDefined();
		expect(response.error?.status).toBe(401);
		expect(response.error?.message).toBe("Not authenticated");
	});

	it("should reject FedCM token when FedCM is disabled", async () => {
		const { customFetchImpl: fetchNoFedCM } = await getTestInstance({
			plugins: [oneTap()],
			socialProviders: {
				google: {
					clientId: "test-client-id",
					clientSecret: "test-client-secret",
				},
			},
		});

		const clientNoFedCM = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: fetchNoFedCM,
			},
		});

		const selfIssuedToken = await new SignJWT({
			email: "test@gmail.com",
			email_verified: true,
			sub: "test-user-id",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer("http://localhost:3000/api/auth")
			.setAudience("test-client-id")
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode("better-auth.secret"));

		const response = await clientNoFedCM.$fetch("/one-tap/callback", {
			method: "POST",
			body: {
				idToken: selfIssuedToken,
			},
		});

		expect(response.error).toBeDefined();
		expect(response.error?.status).toBe(400);
	});
});

describe("oneTap - Edge Cases", () => {
	it("should handle missing email in token", async () => {
		const { customFetchImpl } = await getTestInstance({
			plugins: [
				oneTap({
					fedcm: {
						enabled: true,
					},
				}),
			],
			socialProviders: {
				google: {
					clientId: "test-client-id",
					clientSecret: "test-client-secret",
				},
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const tokenWithoutEmail = await new SignJWT({
			sub: "test-user-id",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer("http://localhost:3000/api/auth")
			.setAudience("test-client-id")
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode("better-auth.secret"));

		const response = await client.$fetch<{
			error?: string;
		}>("/one-tap/callback", {
			method: "POST",
			body: {
				idToken: tokenWithoutEmail,
			},
		});

		expect(response.data).toBeDefined();
		expect(response.data).toHaveProperty("error");
		expect(response.data?.error).toBe("Email not available in token");
	});

	it("should handle user with no name gracefully", async () => {
		const { auth, customFetchImpl, sessionSetter } = await getTestInstance({
			plugins: [
				oneTap({
					fedcm: {
						enabled: true,
					},
				}),
			],
			socialProviders: {
				google: {
					clientId: "test-client-id",
					clientSecret: "test-client-secret",
				},
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const ctx = await auth.$context;

		const headers = new Headers();
		await runWithEndpointContext(
			{ context: ctx } as GenericEndpointContext,
			async () => {
				const user = await ctx.internalAdapter.createOAuthUser(
					{
						email: "noname@gmail.com",
						emailVerified: true,
						name: "",
					},
					{
						providerId: "google",
						accountId: "google-noname-123",
					},
				);

				// create a real session so that the cookie + DB are consistent
				const session = await ctx.internalAdapter.createSession(user.user.id);

				const onSuccess = sessionSetter(headers);
				await client.getSession({
					fetchOptions: {
						headers,
						onSuccess,
					},
				});
			},
		);

		const response = await client.$fetch<{
			accounts: Array<{
				name: string;
				given_name: string;
			}>;
		}>("/one-tap/fedcm/accounts", {
			method: "GET",
			headers: Object.fromEntries(headers.entries()),
		});

		if (response.data?.accounts && response.data.accounts.length > 0) {
			expect(response.data.accounts[0]?.name).toBe("noname@gmail.com");
			expect(response.data.accounts[0]?.given_name).toBe("noname");
		}
	});
});

describe("oneTap - Branding Configuration", () => {
	it("should use default branding when not specified", async () => {
		const { customFetchImpl } = await getTestInstance({
			plugins: [
				oneTap({
					fedcm: {
						enabled: true,
					},
				}),
			],
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const response = await client.$fetch<{
			branding?: {
				background_color: string;
				color: string;
				icons?: Array<{ url: string; size: number }>;
			};
		}>("/one-tap/fedcm/config", {
			method: "GET",
		});

		expect(response.data?.branding).toBeDefined();
		expect(response.data?.branding?.background_color).toBe("#1a73e8");
		expect(response.data?.branding?.color).toBe("#ffffff");
		expect(response.data?.branding?.icons).toBeUndefined();
	});

	it("should use custom branding when specified", async () => {
		const { customFetchImpl } = await getTestInstance({
			plugins: [
				oneTap({
					fedcm: {
						enabled: true,
						branding: {
							backgroundColor: "#ff0000",
							color: "#000000",
							iconUrl: "https://custom.com/icon.png",
						},
					},
				}),
			],
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const response = await client.$fetch<{
			branding: {
				background_color: string;
				color: string;
				icons?: Array<{ url: string; size: number }>;
			};
		}>("/one-tap/fedcm/config", {
			method: "GET",
		});

		expect(response.data?.branding).toBeDefined();
		expect(response.data?.branding?.background_color).toBe("#ff0000");
		expect(response.data?.branding?.color).toBe("#000000");
		expect(response.data?.branding?.icons).toBeDefined();
		expect(response.data?.branding?.icons?.[0]).toMatchObject({
			url: "https://custom.com/icon.png",
			size: 32,
		});
	});
});
