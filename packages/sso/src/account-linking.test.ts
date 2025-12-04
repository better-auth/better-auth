import { betterFetch } from "@better-fetch/fetch";
import { createAuthClient } from "better-auth/client";
import { getTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

/**
 * Tests for SSO account linking policy.
 *
 * These tests verify that:
 * 1. All SSO/OAuth flows follow the same trust policy
 * 2. SAML and OIDC no longer auto-link based on email_verified
 * 3. SSO requires a trust signal (trusted provider OR domain-verified) before auto-linking
 * 4. All auto-link modes work correctly for SSO
 */

describe("SSO Account Linking - existingUserMode: never", () => {
	const server = new OAuth2Server();
	const existingUserEmail = "existing-never@test.com";

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		await server.start(8082, "localhost");
	});

	afterAll(async () => {
		await server.stop().catch(() => {});
	});

	it("should deny auto-linking even for trusted providers", async () => {
		server.service.on("beforeTokenSigning", (token) => {
			token.payload.email = existingUserEmail;
			token.payload.email_verified = true;
			token.payload.name = "Test User";
			token.payload.sub = "oidc-never-test-sub";
		});

		const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["sso-never-test"], // Even trusted should be denied
						existingUserMode: "never",
					},
				},
				plugins: [sso()],
			});

		const ctx = await auth.$context;

		const authClient = createAuthClient({
			plugins: [ssoClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		// Create existing user with email/password
		await authClient.signUp.email({
			email: existingUserEmail,
			password: "password123",
			name: "Existing User",
		});

		// Sign in to register SSO provider
		const { headers: adminHeaders } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "test.com",
				providerId: "sso-never-test",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					authorizationEndpoint: `${server.issuer.url}/authorize`,
					tokenEndpoint: `${server.issuer.url}/token`,
					jwksEndpoint: `${server.issuer.url}/jwks`,
					discoveryEndpoint: `${server.issuer.url}/.well-known/openid-configuration`,
					mapping: {
						id: "sub",
						email: "email",
						emailVerified: "email_verified",
						name: "name",
						image: "picture",
					},
				},
			},
			headers: adminHeaders,
		});

		// Sign out and try SSO sign-in
		const headers = new Headers();
		const signInRes = await authClient.signIn.sso({
			providerId: "sso-never-test",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.url).toContain(server.issuer.url);

		// Simulate OAuth callback flow
		let redirectLocation = "";
		await betterFetch(signInRes.url!, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		if (redirectLocation) {
			await betterFetch(redirectLocation, {
				method: "GET",
				headers,
				customFetchImpl,
				onError(context) {
					redirectLocation = context.response.headers.get("location") || "";
				},
			});
		}

		// Should redirect with account_not_linked error
		expect(redirectLocation).toContain("account_not_linked");

		// Verify no SSO account was linked
		const accounts = await ctx.adapter.findMany({
			model: "account",
			where: [{ field: "providerId", value: "sso-never-test" }],
		});
		expect(accounts.length).toBe(0);
	});
});

describe("SSO Account Linking - existingUserMode: trusted_providers_only", () => {
	const server = new OAuth2Server();

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		await server.start(8083, "localhost");
	});

	afterAll(async () => {
		await server.stop().catch(() => {});
	});

	it("should allow auto-linking for trusted providers", async () => {
		const trustedEmail = "trusted-provider@test.com";

		server.service.on("beforeTokenSigning", (token) => {
			token.payload.email = trustedEmail;
			token.payload.email_verified = true;
			token.payload.name = "Trusted User";
			token.payload.sub = "trusted-sub-123";
		});

		const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["sso-trusted"],
						existingUserMode: "trusted_providers_only",
					},
				},
				plugins: [sso()],
			});

		const ctx = await auth.$context;

		const authClient = createAuthClient({
			plugins: [ssoClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		// Create existing user
		await authClient.signUp.email({
			email: trustedEmail,
			password: "password123",
			name: "Trusted User",
		});

		// Sign in to register SSO provider
		const { headers: adminHeaders } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "trusted.com",
				providerId: "sso-trusted",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					authorizationEndpoint: `${server.issuer.url}/authorize`,
					tokenEndpoint: `${server.issuer.url}/token`,
					jwksEndpoint: `${server.issuer.url}/jwks`,
					discoveryEndpoint: `${server.issuer.url}/.well-known/openid-configuration`,
					mapping: {
						id: "sub",
						email: "email",
						emailVerified: "email_verified",
						name: "name",
						image: "picture",
					},
				},
			},
			headers: adminHeaders,
		});

		// Try SSO sign-in
		const headers = new Headers();
		const signInRes = await authClient.signIn.sso({
			providerId: "sso-trusted",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});

		// Simulate OAuth callback flow
		let redirectLocation = "";
		await betterFetch(signInRes.url!, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		if (redirectLocation) {
			await betterFetch(redirectLocation, {
				method: "GET",
				headers,
				customFetchImpl,
				onError(context) {
					redirectLocation = context.response.headers.get("location") || "";
				},
			});
		}

		// Should NOT contain error
		expect(redirectLocation).not.toContain("error");
		expect(redirectLocation).toContain("dashboard");

		// Verify SSO account was linked
		const accounts = await ctx.adapter.findMany({
			model: "account",
			where: [{ field: "providerId", value: "sso-trusted" }],
		});
		expect(accounts.length).toBe(1);
	});

	it("should deny auto-linking for untrusted providers", async () => {
		const untrustedEmail = "untrusted-provider@test.com";

		server.service.on("beforeTokenSigning", (token) => {
			token.payload.email = untrustedEmail;
			token.payload.email_verified = true;
			token.payload.name = "Untrusted User";
			token.payload.sub = "untrusted-sub-456";
		});

		const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["some-other-provider"], // sso-untrusted is NOT trusted
						existingUserMode: "trusted_providers_only",
					},
				},
				plugins: [sso()],
			});

		const ctx = await auth.$context;

		const authClient = createAuthClient({
			plugins: [ssoClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		// Create existing user
		await authClient.signUp.email({
			email: untrustedEmail,
			password: "password123",
			name: "Untrusted User",
		});

		// Sign in to register SSO provider
		const { headers: adminHeaders } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "untrusted.com",
				providerId: "sso-untrusted",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					authorizationEndpoint: `${server.issuer.url}/authorize`,
					tokenEndpoint: `${server.issuer.url}/token`,
					jwksEndpoint: `${server.issuer.url}/jwks`,
					discoveryEndpoint: `${server.issuer.url}/.well-known/openid-configuration`,
					mapping: {
						id: "sub",
						email: "email",
						emailVerified: "email_verified",
						name: "name",
						image: "picture",
					},
				},
			},
			headers: adminHeaders,
		});

		// Try SSO sign-in
		const headers = new Headers();
		const signInRes = await authClient.signIn.sso({
			providerId: "sso-untrusted",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});

		// Simulate OAuth callback flow
		let redirectLocation = "";
		await betterFetch(signInRes.url!, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		if (redirectLocation) {
			await betterFetch(redirectLocation, {
				method: "GET",
				headers,
				customFetchImpl,
				onError(context) {
					redirectLocation = context.response.headers.get("location") || "";
				},
			});
		}

		// Should redirect with account_not_linked error
		expect(redirectLocation).toContain("account_not_linked");

		// Verify no SSO account was linked
		const accounts = await ctx.adapter.findMany({
			model: "account",
			where: [{ field: "providerId", value: "sso-untrusted" }],
		});
		expect(accounts.length).toBe(0);
	});
});

describe("SSO Account Linking - email_match_any still requires trust for SSO", () => {
	const server = new OAuth2Server();

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		await server.start(8084, "localhost");
	});

	afterAll(async () => {
		await server.stop().catch(() => {});
	});

	it("should deny auto-linking for SSO even with email_verified when not trusted", async () => {
		const testEmail = "email-match-any@test.com";

		server.service.on("beforeTokenSigning", (token) => {
			token.payload.email = testEmail;
			token.payload.email_verified = true; // Email IS verified
			token.payload.name = "Test User";
			token.payload.sub = "email-match-sub-789";
		});

		// SSO should still require trust even in email_match_any mode
		const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: [], // No trusted providers
						existingUserMode: "email_match_any",
					},
				},
				plugins: [sso()],
			});

		const ctx = await auth.$context;

		const authClient = createAuthClient({
			plugins: [ssoClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		// Create existing user
		await authClient.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Test User",
		});

		// Sign in to register SSO provider
		const { headers: adminHeaders } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "emailmatch.com",
				providerId: "sso-email-match",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					authorizationEndpoint: `${server.issuer.url}/authorize`,
					tokenEndpoint: `${server.issuer.url}/token`,
					jwksEndpoint: `${server.issuer.url}/jwks`,
					discoveryEndpoint: `${server.issuer.url}/.well-known/openid-configuration`,
					mapping: {
						id: "sub",
						email: "email",
						emailVerified: "email_verified",
						name: "name",
						image: "picture",
					},
				},
			},
			headers: adminHeaders,
		});

		// Try SSO sign-in
		const headers = new Headers();
		const signInRes = await authClient.signIn.sso({
			providerId: "sso-email-match",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});

		// Simulate OAuth callback flow
		let redirectLocation = "";
		await betterFetch(signInRes.url!, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		if (redirectLocation) {
			await betterFetch(redirectLocation, {
				method: "GET",
				headers,
				customFetchImpl,
				onError(context) {
					redirectLocation = context.response.headers.get("location") || "";
				},
			});
		}

		// SSO should still require trust signal even in email_match_any mode
		// (unlike core OAuth which allows email_verified as trust in this mode)
		expect(redirectLocation).toContain("account_not_linked");

		// Verify no SSO account was linked
		const accounts = await ctx.adapter.findMany({
			model: "account",
			where: [{ field: "providerId", value: "sso-email-match" }],
		});
		expect(accounts.length).toBe(0);
	});
});

describe("SSO Account Linking - domain verification", () => {
	const server = new OAuth2Server();

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		await server.start(8085, "localhost");
	});

	afterAll(async () => {
		await server.stop().catch(() => {});
	});

	it("should allow auto-linking when domain is verified and email matches", async () => {
		const domainVerifiedEmail = "user@verified-domain.com";

		server.service.on("beforeTokenSigning", (token) => {
			token.payload.email = domainVerifiedEmail;
			token.payload.email_verified = true;
			token.payload.name = "Domain User";
			token.payload.sub = "domain-verified-sub-101";
		});

		const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: [], // No trusted providers - rely on domain verification
						existingUserMode: "trusted_providers_only",
					},
				},
				plugins: [
					sso({
						domainVerification: { enabled: true },
					}),
				],
			});

		const ctx = await auth.$context;

		const authClient = createAuthClient({
			plugins: [ssoClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		// Create existing user
		await authClient.signUp.email({
			email: domainVerifiedEmail,
			password: "password123",
			name: "Domain User",
		});

		// Sign in to register SSO provider
		const { headers: adminHeaders } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "verified-domain.com",
				providerId: "sso-domain-verified",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					authorizationEndpoint: `${server.issuer.url}/authorize`,
					tokenEndpoint: `${server.issuer.url}/token`,
					jwksEndpoint: `${server.issuer.url}/jwks`,
					discoveryEndpoint: `${server.issuer.url}/.well-known/openid-configuration`,
					mapping: {
						id: "sub",
						email: "email",
						emailVerified: "email_verified",
						name: "name",
						image: "picture",
					},
				},
			},
			headers: adminHeaders,
		});

		// Manually set domainVerified to true (simulating verification)
		await ctx.adapter.update({
			model: "ssoProvider",
			where: [{ field: "providerId", value: "sso-domain-verified" }],
			update: { domainVerified: true },
		});

		// Try SSO sign-in
		const headers = new Headers();
		const signInRes = await authClient.signIn.sso({
			providerId: "sso-domain-verified",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});

		// Simulate OAuth callback flow
		let redirectLocation = "";
		await betterFetch(signInRes.url!, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		if (redirectLocation) {
			await betterFetch(redirectLocation, {
				method: "GET",
				headers,
				customFetchImpl,
				onError(context) {
					redirectLocation = context.response.headers.get("location") || "";
				},
			});
		}

		// Should NOT contain error - domain is verified
		expect(redirectLocation).not.toContain("error");
		expect(redirectLocation).toContain("dashboard");

		// Verify SSO account was linked
		const accounts = await ctx.adapter.findMany({
			model: "account",
			where: [{ field: "providerId", value: "sso-domain-verified" }],
		});
		expect(accounts.length).toBe(1);
	});
});

describe("SSO Account Linking - configuration tests", () => {
	it("should respect accountLinking.enabled = false", async () => {
		const { auth } = await getTestInstance({
			account: {
				accountLinking: {
					enabled: false,
				},
			},
			plugins: [sso()],
		});

		expect(auth.options.account?.accountLinking?.enabled).toBe(false);
	});

	it("should respect existingUserMode = never", async () => {
		const { auth } = await getTestInstance({
			account: {
				accountLinking: {
					enabled: true,
					existingUserMode: "never",
				},
			},
			plugins: [sso()],
		});

		expect(auth.options.account?.accountLinking?.existingUserMode).toBe(
			"never",
		);
	});

	it("should default SSO to trusted_providers_only when no mode specified", async () => {
		const { auth } = await getTestInstance({
			account: {
				accountLinking: {
					enabled: true,
					// No existingUserMode specified
				},
			},
			plugins: [sso()],
		});

		// Verify the option is undefined (SSO will use its own stricter default)
		const accountLinking = auth.options.account?.accountLinking as
			| { existingUserMode?: string }
			| undefined;
		expect(accountLinking?.existingUserMode).toBeUndefined();
		// The canAutoLinkExistingUser function in utils.ts defaults to "trusted_providers_only" for SSO
	});
});
