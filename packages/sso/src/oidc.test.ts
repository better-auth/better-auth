import { betterFetch } from "@better-fetch/fetch";
import { createAuthClient } from "better-auth/client";
import { organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";
import { getSSOState } from "./sso-state";

const server = new OAuth2Server();

describe("SSO", async () => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:8080"],
			plugins: [sso(), organization()],
		});

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.issuer.on;
		await server.start(8080, "localhost");
		console.log("Issuer URL:", server.issuer.url); // -> http://localhost:8080
	});

	afterAll(async () => {
		await server.stop().catch(() => {});
	});

	server.service.on("beforeUserinfo", (userInfoResponse, req) => {
		userInfoResponse.body = {
			email: "oauth2@test.com",
			name: "OAuth2 Test",
			sub: "oauth2",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	server.service.on("beforeTokenSigning", (token, req) => {
		token.payload.email = "sso-user@localhost:8000.com";
		token.payload.email_verified = true;
		token.payload.name = "Test User";
		token.payload.picture = "https://test.com/picture.png";
	});

	async function simulateOAuthFlow(
		authUrl: string,
		headers: Headers,
		fetchImpl?: (...args: any) => any,
	) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");
		const newHeaders = new Headers();
		let callbackURL = "";
		await betterFetch(location, {
			method: "GET",
			customFetchImpl: fetchImpl || customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders };
	}

	it("should register a new SSO provider", async () => {
		const { headers } = await signInWithTestUser();
		const provider = await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "localhost.com",
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
				providerId: "test",
			},
			headers,
		});
		expect(provider).toMatchObject({
			id: expect.any(String),
			issuer: "http://localhost:8080",
			oidcConfig: {
				issuer: "http://localhost:8080",
				clientId: "test",
				clientSecret: "test",
				authorizationEndpoint: "http://localhost:8080/authorize",
				tokenEndpoint: "http://localhost:8080/token",
				jwksEndpoint: "http://localhost:8080/jwks",
				discoveryEndpoint:
					"http://localhost:8080/.well-known/openid-configuration",
				mapping: {
					id: "sub",
					email: "email",
					emailVerified: "email_verified",
					name: "name",
					image: "picture",
				},
			},
			userId: expect.any(String),
		});
	});

	it("should fail to register a new SSO provider with invalid issuer", async () => {
		const { headers } = await signInWithTestUser();

		try {
			await auth.api.registerSSOProvider({
				body: {
					issuer: "invalid",
					domain: "localhost",
					providerId: "test",
					oidcConfig: {
						clientId: "test",
						clientSecret: "test",
					},
				},
				headers,
			});
		} catch (e) {
			expect(e).toMatchObject({
				status: "BAD_REQUEST",
				body: {
					message: "Invalid issuer. Must be a valid URL",
				},
			});
		}
	});

	it("should not allow creating a provider with duplicate providerId", async () => {
		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "duplicate.com",
				providerId: "duplicate-oidc-provider",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
				},
			},
			headers,
		});

		await expect(
			auth.api.registerSSOProvider({
				body: {
					issuer: server.issuer.url!,
					domain: "another-duplicate.com",
					providerId: "duplicate-oidc-provider",
					oidcConfig: {
						clientId: "test2",
						clientSecret: "test2",
					},
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "UNPROCESSABLE_ENTITY",
			body: {
				message: "SSO provider with this providerId already exists",
			},
		});
	});

	it("should sign in with SSO provider with email matching", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			email: "my-email@localhost.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.url).toContain("http://localhost:8080/authorize");
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Ftest",
		);
		expect(res.url).toContain("login_hint=my-email%40localhost.com");
		const { callbackURL } = await simulateOAuthFlow(res.url, headers);
		expect(callbackURL).toContain("/dashboard");
	});

	it("should sign in with SSO provider with domain", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			email: "my-email@test.com",
			domain: "localhost.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.url).toContain("http://localhost:8080/authorize");
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Ftest",
		);
		const { callbackURL } = await simulateOAuthFlow(res.url, headers);
		expect(callbackURL).toContain("/dashboard");
	});

	it("should sign in with SSO provider with providerId", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			providerId: "test",
			loginHint: "user@example.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.url).toContain("http://localhost:8080/authorize");
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Ftest",
		);
		expect(res.url).toContain("login_hint=user%40example.com");

		const { callbackURL } = await simulateOAuthFlow(res.url, headers);
		expect(callbackURL).toContain("/dashboard");
	});

	it("should hydrate authorizationEndpoint via discovery when missing from stored config", async () => {
		const { headers } = await signInWithTestUser();

		// Register a provider with skipDiscovery, providing tokenEndpoint +
		// jwksEndpoint but deliberately omitting authorizationEndpoint.
		// This simulates a legacy provider stored without the authorization URL.
		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "no-auth-endpoint.com",
				providerId: "no-auth-endpoint",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					skipDiscovery: true,
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
			headers,
		});

		// Use a unique identity so the callback doesn't collide with the
		// "sso-user@localhost:8000.com" account already linked to "test" provider.
		const originalUserinfoListeners =
			server.service.listeners("beforeUserinfo");
		const originalTokenListeners =
			server.service.listeners("beforeTokenSigning");
		server.service.removeAllListeners("beforeUserinfo");
		server.service.removeAllListeners("beforeTokenSigning");
		server.service.on("beforeUserinfo", (userInfoResponse: any) => {
			userInfoResponse.body = {
				email: "no-auth-endpoint-user@no-auth-endpoint.com",
				name: "No Auth Endpoint User",
				sub: "no-auth-endpoint-user",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});
		server.service.on("beforeTokenSigning", (token: any) => {
			token.payload.email = "no-auth-endpoint-user@no-auth-endpoint.com";
			token.payload.email_verified = true;
			token.payload.name = "No Auth Endpoint User";
			token.payload.sub = "no-auth-endpoint-user";
		});

		try {
			const signInHeaders = new Headers();
			const res = await authClient.signIn.sso({
				providerId: "no-auth-endpoint",
				callbackURL: "/dashboard",
				fetchOptions: {
					throw: true,
					onSuccess: cookieSetter(signInHeaders),
				},
			});

			// Discovery should have hydrated authorizationEndpoint — no error
			expect(res.url).toContain("http://localhost:8080/authorize");

			const { callbackURL } = await simulateOAuthFlow(res.url, signInHeaders);
			expect(callbackURL).toContain("/dashboard");
		} finally {
			server.service.removeAllListeners("beforeUserinfo");
			server.service.removeAllListeners("beforeTokenSigning");
			for (const listener of originalUserinfoListeners) {
				server.service.on("beforeUserinfo", listener as any);
			}
			for (const listener of originalTokenListeners) {
				server.service.on("beforeTokenSigning", listener as any);
			}
		}
	});

	it("should normalize email to lowercase in OIDC authentication", async () => {
		const { headers } = await signInWithTestUser();

		// Register a new provider for this test
		await auth.api.registerSSOProvider({
			body: {
				providerId: "email-case-oidc-provider",
				issuer: server.issuer.url!,
				domain: "email-case-test.com",
				oidcConfig: {
					clientId: "email-case-test-client",
					clientSecret: "test-client-secret",
					discoveryEndpoint: `${server.issuer.url!}/.well-known/openid-configuration`,
					pkce: false,
				},
			},
			headers,
		});

		// Store original listeners and set up mixed-case email
		const originalUserinfoListeners =
			server.service.listeners("beforeUserinfo");
		const originalTokenListeners =
			server.service.listeners("beforeTokenSigning");

		server.service.removeAllListeners("beforeUserinfo");
		server.service.removeAllListeners("beforeTokenSigning");

		const mixedCaseEmail = "OIDCUser@Example.COM";

		server.service.on("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: mixedCaseEmail,
				name: "OIDC Test User",
				sub: "oidc-email-case-test-user",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		server.service.on("beforeTokenSigning", (token) => {
			token.payload.email = mixedCaseEmail;
			token.payload.email_verified = true;
			token.payload.name = "OIDC Test User";
			token.payload.sub = "oidc-email-case-test-user";
		});

		try {
			// First sign in - should create user with lowercase email
			const signInHeaders1 = new Headers();
			const res1 = await authClient.signIn.sso({
				email: `user@email-case-test.com`,
				callbackURL: "/dashboard",
				fetchOptions: {
					throw: true,
					onSuccess: cookieSetter(signInHeaders1),
				},
			});

			const { callbackURL: callbackURL1, headers: sessionHeaders1 } =
				await simulateOAuthFlow(res1.url, signInHeaders1);
			expect(callbackURL1).toContain("/dashboard");

			// Get session and verify email is lowercase
			const session1 = await authClient.getSession({
				fetchOptions: {
					headers: sessionHeaders1,
				},
			});

			expect(session1.data?.user.email).toBe("oidcuser@example.com");
			const firstUserId = session1.data?.user.id;
			expect(firstUserId).toBeDefined();

			// Second sign in with same mixed-case email - should find existing user
			const signInHeaders2 = new Headers();
			const res2 = await authClient.signIn.sso({
				email: `user@email-case-test.com`,
				callbackURL: "/dashboard",
				fetchOptions: {
					throw: true,
					onSuccess: cookieSetter(signInHeaders2),
				},
			});

			const { callbackURL: callbackURL2, headers: sessionHeaders2 } =
				await simulateOAuthFlow(res2.url, signInHeaders2);
			expect(callbackURL2).toContain("/dashboard");

			// Verify same user is returned
			const session2 = await authClient.getSession({
				fetchOptions: {
					headers: sessionHeaders2,
				},
			});

			expect(session2.data?.user.id).toBe(firstUserId);
			expect(session2.data?.user.email).toBe("oidcuser@example.com");
		} finally {
			// Restore original listeners
			server.service.removeAllListeners("beforeUserinfo");
			server.service.removeAllListeners("beforeTokenSigning");
			for (const listener of originalUserinfoListeners) {
				server.service.on("beforeUserinfo", listener);
			}
			for (const listener of originalTokenListeners) {
				server.service.on("beforeTokenSigning", listener);
			}
		}
	});
});

describe("SSO disable implicit sign in", async () => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:8080"],
			plugins: [sso({ disableImplicitSignUp: true }), organization()],
		});

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.issuer.on;
		await server.start(8080, "localhost");
		console.log("Issuer URL:", server.issuer.url); // -> http://localhost:8080
	});

	afterAll(async () => {
		await server.stop();
	});

	server.service.on("beforeUserinfo", (userInfoResponse, req) => {
		userInfoResponse.body = {
			email: "oauth2@test.com",
			name: "OAuth2 Test",
			sub: "oauth2",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	server.service.on("beforeTokenSigning", (token, req) => {
		token.payload.email = "sso-user@localhost:8000.com";
		token.payload.email_verified = true;
		token.payload.name = "Test User";
		token.payload.picture = "https://test.com/picture.png";
	});

	async function simulateOAuthFlow(
		authUrl: string,
		headers: Headers,
		fetchImpl?: (...args: any) => any,
	) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");
		const newHeaders = new Headers(headers);
		let callbackURL = "";
		await betterFetch(location, {
			method: "GET",
			customFetchImpl: fetchImpl || customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders };
	}

	it("should register a new SSO provider", async () => {
		const { headers } = await signInWithTestUser();
		const provider = await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "localhost.com",
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
				providerId: "test",
			},
			headers,
		});
		expect(provider).toMatchObject({
			id: expect.any(String),
			issuer: "http://localhost:8080",
			oidcConfig: {
				issuer: "http://localhost:8080",
				clientId: "test",
				clientSecret: "test",
				authorizationEndpoint: "http://localhost:8080/authorize",
				tokenEndpoint: "http://localhost:8080/token",
				jwksEndpoint: "http://localhost:8080/jwks",
				discoveryEndpoint:
					"http://localhost:8080/.well-known/openid-configuration",
				mapping: {
					id: "sub",
					email: "email",
					emailVerified: "email_verified",
					name: "name",
					image: "picture",
				},
			},
			userId: expect.any(String),
		});
	});

	it("should not create user with SSO provider when sign ups are disabled", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			email: "my-email@localhost.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.url).toContain("http://localhost:8080/authorize");
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Ftest",
		);
		const { callbackURL } = await simulateOAuthFlow(res.url, headers);
		expect(callbackURL).toContain("/api/auth/error?error=signup disabled");
	});

	it("should create user with SSO provider when sign ups are disabled but sign up is requested", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			email: "my-email@localhost.com",
			callbackURL: "/dashboard",
			requestSignUp: true,
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.url).toContain("http://localhost:8080/authorize");
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Ftest",
		);
		const { callbackURL } = await simulateOAuthFlow(res.url, headers);
		expect(callbackURL).toContain("/dashboard");
	});
});

describe("provisioning", async (ctx) => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:8080"],
			plugins: [sso(), organization()],
		});

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.issuer.on;
		await server.start(8080, "localhost");
		console.log("Issuer URL:", server.issuer.url); // -> http://localhost:8080
	});

	afterAll(async () => {
		await server.stop();
	});
	async function simulateOAuthFlow(
		authUrl: string,
		headers: Headers,
		fetchImpl?: (...args: any) => any,
	) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");

		let callbackURL = "";
		const newHeaders = new Headers();
		await betterFetch(location, {
			method: "GET",
			customFetchImpl: fetchImpl || customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return callbackURL;
	}

	server.service.on("beforeUserinfo", (userInfoResponse, req) => {
		userInfoResponse.body = {
			email: "test@localhost.com",
			name: "OAuth2 Test",
			sub: "oauth2",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	server.service.on("beforeTokenSigning", (token, req) => {
		token.payload.email = "sso-user@localhost:8000.com";
		token.payload.email_verified = true;
		token.payload.name = "Test User";
		token.payload.picture = "https://test.com/picture.png";
	});
	it("should provision user", async () => {
		const { headers } = await signInWithTestUser();
		const organization = await auth.api.createOrganization({
			body: {
				name: "Localhost",
				slug: "localhost",
			},
			headers,
		});
		const provider = await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "localhost.com",
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
				providerId: "test2",
				organizationId: organization?.id,
			},
			headers,
		});
		expect(provider).toMatchObject({
			organizationId: organization?.id,
		});
		const newHeaders = new Headers();
		const res = await authClient.signIn.sso({
			email: "my-email@localhost.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(newHeaders),
				throw: true,
			},
		});
		expect(res.url).toContain("http://localhost:8080/authorize");
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Ftest",
		);

		const callbackURL = await simulateOAuthFlow(res.url, newHeaders);
		expect(callbackURL).toContain("/dashboard");
		const org = await auth.api.getFullOrganization({
			query: {
				organizationId: organization?.id || "",
			},
			headers,
		});
		const member = org?.members.find(
			(m: any) => m.user.email === "test@localhost.com",
		);
		expect(member).toMatchObject({
			role: "member",
			user: {
				id: expect.any(String),
				name: "OAuth2 Test",
				email: "test@localhost.com",
				image: "https://test.com/picture.png",
			},
		});
	});

	it("should sign in with SSO provide with org slug", async () => {
		const res = await auth.api.signInSSO({
			body: {
				organizationSlug: "localhost",
				callbackURL: "/dashboard",
			},
		});

		expect(res.url).toContain("http://localhost:8080/authorize");
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/7857
 */
describe("provisionUser should only be called for new users", async () => {
	const provisionUserFn = vi.fn();
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:8080"],
			plugins: [
				sso({
					provisionUser: provisionUserFn,
				}),
				organization(),
			],
		});

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.service.removeAllListeners("beforeUserinfo");
		server.service.removeAllListeners("beforeTokenSigning");
		server.service.on("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "provision-test@localhost.com",
				name: "Provision Test",
				sub: "provision-test-sub",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});
		server.service.on("beforeTokenSigning", (token) => {
			token.payload.email = "provision-test@localhost.com";
			token.payload.email_verified = true;
			token.payload.name = "Provision Test";
			token.payload.picture = "https://test.com/picture.png";
		});
		await server.start(8080, "localhost");
	});

	afterAll(async () => {
		await server.stop();
	});

	async function simulateOAuthFlow(authUrl: string, headers: Headers) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");

		let callbackURL = "";
		const newHeaders = new Headers();
		await betterFetch(location, {
			method: "GET",
			customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders };
	}

	it("should call provisionUser only on first sign-in (new user), not on subsequent sign-ins", async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "localhost.com",
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
				providerId: "provision-test",
			},
			headers,
		});

		provisionUserFn.mockClear();

		// First sign-in: new user -> provisionUser should be called
		const signInHeaders1 = new Headers();
		const res1 = await authClient.signIn.sso({
			email: "user@localhost.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(signInHeaders1),
			},
		});
		await simulateOAuthFlow(res1.url, signInHeaders1);
		expect(provisionUserFn).toHaveBeenCalledTimes(1);

		provisionUserFn.mockClear();

		// Second sign-in: existing user -> provisionUser should NOT be called
		const signInHeaders2 = new Headers();
		const res2 = await authClient.signIn.sso({
			email: "user@localhost.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(signInHeaders2),
			},
		});
		await simulateOAuthFlow(res2.url, signInHeaders2);
		expect(provisionUserFn).toHaveBeenCalledTimes(0);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/7693
 */
describe("SSO shared redirectURI", async () => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:8080"],
			plugins: [
				sso({
					redirectURI: "/sso/callback",
				}),
				organization(),
			],
		});

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	const userinfoHandler = (userInfoResponse: any) => {
		userInfoResponse.body = {
			email: "shared-redirect@test.com",
			name: "Shared Redirect User",
			sub: "shared-redirect-user",
			picture: "https://test.com/shared.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	};

	const tokenHandler = (token: any) => {
		token.payload.email = "shared-redirect@test.com";
		token.payload.email_verified = true;
		token.payload.name = "Shared Redirect User";
		token.payload.picture = "https://test.com/shared.png";
	};

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.service.removeAllListeners("beforeUserinfo");
		server.service.removeAllListeners("beforeTokenSigning");
		server.service.on("beforeUserinfo", userinfoHandler);
		server.service.on("beforeTokenSigning", tokenHandler);
		await server.start(8080, "localhost");
	});

	afterAll(async () => {
		server.service.removeListener("beforeUserinfo", userinfoHandler);
		server.service.removeListener("beforeTokenSigning", tokenHandler);
		await server.stop().catch(() => {});
	});

	async function simulateOAuthFlow(
		authUrl: string,
		headers: Headers,
		fetchImpl?: (...args: any) => any,
	) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");
		const newHeaders = new Headers();
		let callbackURL = "";
		await betterFetch(location, {
			method: "GET",
			customFetchImpl: fetchImpl || customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders };
	}

	it("should return shared redirectURI when registering provider", async () => {
		const { headers } = await signInWithTestUser();
		const provider = await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "shared-redirect.com",
				oidcConfig: {
					clientId: "shared-test",
					clientSecret: "shared-test-secret",
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
				providerId: "shared-test",
			},
			headers,
		});
		// Should use the shared redirect URI, not per-provider
		expect(provider.redirectURI).toBe(
			"http://localhost:3000/api/auth/sso/callback",
		);
		expect(provider.redirectURI).not.toContain("shared-test");
	});

	it("should use shared redirect URI in authorization URL", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			email: "user@shared-redirect.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.url).toContain("http://localhost:8080/authorize");
		// Should use shared redirect URI without providerId in path
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback",
		);
		// Should NOT contain the per-provider path
		expect(res.url).not.toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Fshared-test",
		);
	});

	it("should complete OIDC flow using shared callback endpoint", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			email: "user@shared-redirect.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});
		const { callbackURL, headers: sessionHeaders } = await simulateOAuthFlow(
			res.url,
			headers,
		);
		expect(callbackURL).toContain("/dashboard");

		// Verify session was created
		const session = await authClient.getSession({
			fetchOptions: {
				headers: sessionHeaders,
			},
		});
		expect(session.data?.user.email).toBe("shared-redirect@test.com");
	});
});

describe("OIDC SSO with defaultSSO array", async () => {
	const { customFetchImpl, cookieSetter } = await getTestInstance({
		trustedOrigins: ["http://localhost:8080"],
		plugins: [
			sso({
				defaultSSO: [
					{
						domain: "default-oidc.com",
						providerId: "default-oidc-provider",
						oidcConfig: {
							issuer: "http://localhost:8080",
							clientId: "default-client",
							clientSecret: "default-secret",
							pkce: false,
							// No explicit authorizationEndpoint / tokenEndpoint / jwksEndpoint
							// All resolved via OIDC discovery
							discoveryEndpoint:
								"http://localhost:8080/.well-known/openid-configuration",
						},
					},
					{
						domain: "default-oidc-explicit.com",
						providerId: "default-oidc-provider-explicit",
						oidcConfig: {
							issuer: "http://localhost:8080",
							clientId: "explicit-client",
							clientSecret: "explicit-secret",
							pkce: false,
							// All endpoints set explicitly – discovery should be skipped
							authorizationEndpoint: "http://localhost:8080/authorize",
							tokenEndpoint: "http://localhost:8080/token",
							jwksEndpoint: "http://localhost:8080/jwks",
							discoveryEndpoint:
								"http://localhost:8080/.well-known/openid-configuration",
						},
					},
				],
			}),
			organization(),
		],
	});

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: { customFetchImpl },
	});

	// Shared state set during token signing so the userinfo handler knows which client is active
	let currentEmail = "default-sso-user@default-oidc.com";
	let currentSub = "default-sso-sub";

	const userinfoHandler = (userInfoResponse: any) => {
		userInfoResponse.body = {
			email: currentEmail,
			name: "Default SSO User",
			sub: currentSub,
			picture: "https://test.com/default.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	};

	const tokenHandler = (token: any) => {
		const isExplicit = token.payload.aud === "explicit-client";
		currentEmail = isExplicit
			? "default-sso-user@default-oidc-explicit.com"
			: "default-sso-user@default-oidc.com";
		currentSub = isExplicit ? "explicit-sso-sub" : "default-sso-sub";
		token.payload.email = currentEmail;
		token.payload.email_verified = true;
		token.payload.name = "Default SSO User";
		token.payload.picture = "https://test.com/default.png";
		token.payload.sub = currentSub;
	};

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.service.removeAllListeners("beforeUserinfo");
		server.service.removeAllListeners("beforeTokenSigning");
		server.service.on("beforeUserinfo", userinfoHandler);
		server.service.on("beforeTokenSigning", tokenHandler);
		await server.start(8080, "localhost");
	});

	afterAll(async () => {
		server.service.removeListener("beforeUserinfo", userinfoHandler);
		server.service.removeListener("beforeTokenSigning", tokenHandler);
		await server.stop().catch(() => {});
	});

	async function simulateOAuthFlow(authUrl: string, headers: Headers) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");
		const newHeaders = new Headers();
		let callbackURL = "";
		await betterFetch(location, {
			method: "GET",
			customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders };
	}

	it("should sign in via defaultSSO OIDC using providerId (discovery resolves endpoints)", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			providerId: "default-oidc-provider",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});

		// Authorization URL must point to the mock IdP resolved via discovery
		expect(res.url).toContain("http://localhost:8080/authorize");
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Fdefault-oidc-provider",
		);

		const { callbackURL, headers: sessionHeaders } = await simulateOAuthFlow(
			res.url,
			headers,
		);
		expect(callbackURL).toContain("/dashboard");

		const session = await authClient.getSession({
			fetchOptions: { headers: sessionHeaders },
		});
		expect(session.data?.user.email).toBe("default-sso-user@default-oidc.com");
	});

	it("should sign in via defaultSSO OIDC using email domain matching", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			email: "someone@default-oidc.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.url).toContain("http://localhost:8080/authorize");

		const { callbackURL } = await simulateOAuthFlow(res.url, headers);
		expect(callbackURL).toContain("/dashboard");
	});

	it("should sign in via defaultSSO OIDC with all endpoints explicit (no discovery needed)", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.sso({
			providerId: "default-oidc-provider-explicit",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.url).toContain("http://localhost:8080/authorize");
		expect(res.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fsso%2Fcallback%2Fdefault-oidc-provider-explicit",
		);

		const { callbackURL, headers: sessionHeaders } = await simulateOAuthFlow(
			res.url,
			headers,
		);
		expect(callbackURL).toContain("/dashboard");

		const session = await authClient.getSession({
			fetchOptions: { headers: sessionHeaders },
		});
		expect(session.data?.user.email).toBe(
			"default-sso-user@default-oidc-explicit.com",
		);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8269
 */
describe("SSO OIDC UserInfo endpoint sub claim mapping", async () => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:8080"],
			plugins: [sso(), organization()],
		});

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: { customFetchImpl },
	});

	const userinfoHandler = (userInfoResponse: any) => {
		userInfoResponse.body = {
			sub: "userinfo-only-sub-id",
			email: "userinfo-only@test.com",
			name: "UserInfo Only User",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	};

	// Strip the id_token from the token endpoint response to simulate providers
	// that do not include user claims in the ID token (or return no ID token).
	const beforeResponseHandler = (tokenEndpointResponse: any) => {
		tokenEndpointResponse.body.id_token = undefined;
	};

	const tokenHandler = (token: any) => {
		// Intentionally leave the token payload minimal — no email claim —
		// so that the UserInfo endpoint path is exercised.
	};

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.service.removeAllListeners("beforeUserinfo");
		server.service.removeAllListeners("beforeTokenSigning");
		server.service.removeAllListeners("beforeResponse");
		server.service.on("beforeUserinfo", userinfoHandler);
		server.service.on("beforeTokenSigning", tokenHandler);
		server.service.on("beforeResponse", beforeResponseHandler);
		await server.start(8080, "localhost");
	});

	afterAll(async () => {
		server.service.removeListener("beforeUserinfo", userinfoHandler);
		server.service.removeListener("beforeTokenSigning", tokenHandler);
		server.service.removeListener("beforeResponse", beforeResponseHandler);
		await server.stop().catch(() => {});
	});

	async function simulateOAuthFlow(authUrl: string, headers: Headers) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");
		const newHeaders = new Headers();
		let callbackURL = "";
		await betterFetch(location, {
			method: "GET",
			customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders };
	}

	it("should sign in successfully using sub claim from UserInfo endpoint when no ID token is returned", async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "test.com",
				providerId: "userinfo-sub-test",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					authorizationEndpoint: `${server.issuer.url}/authorize`,
					tokenEndpoint: `${server.issuer.url}/token`,
					jwksEndpoint: `${server.issuer.url}/jwks`,
					userInfoEndpoint: `${server.issuer.url}/userinfo`,
					discoveryEndpoint: `${server.issuer.url}/.well-known/openid-configuration`,
				},
			},
			headers,
		});

		const signInHeaders = new Headers();
		const res = await authClient.signIn.sso({
			email: "user@test.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(signInHeaders),
			},
		});

		const { callbackURL, headers: sessionHeaders } = await simulateOAuthFlow(
			res.url,
			signInHeaders,
		);

		// Should redirect to dashboard, not an error page
		expect(callbackURL).toContain("/dashboard");
		expect(callbackURL).not.toContain("error=invalid_provider");
		expect(callbackURL).not.toContain("missing_user_info");

		// Verify the session was created with the correct email from UserInfo
		const session = await authClient.getSession({
			fetchOptions: { headers: sessionHeaders },
		});
		expect(session.data?.user.email).toBe("userinfo-only@test.com");
	});
});

describe("SSO OIDC with additionalData encoded in state", async () => {
	const provisionUserFn = vi.fn();
	const server = new OAuth2Server();

	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:8080"],
			plugins: [
				sso({
					provisionUser: provisionUserFn,
				}),
				organization(),
			],
		});

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.service.on("beforeUserinfo", (userInfoResponse: any) => {
			userInfoResponse.body = {
				email: "additional-data-oidc@localhost.com",
				name: "Additional Data User",
				sub: "additional-data-oidc-sub",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});
		server.service.on("beforeTokenSigning", (token: any) => {
			token.payload.email = "additional-data-oidc@localhost.com";
			token.payload.email_verified = true;
			token.payload.name = "Additional Data User";
			token.payload.picture = "https://test.com/picture.png";
		});
		await server.start(8080, "localhost");
	});

	afterAll(async () => {
		await server.stop();
	});

	async function simulateOAuthFlow(authUrl: string, headers: Headers) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");
		const newHeaders = new Headers();
		let callbackURL = "";
		await betterFetch(location, {
			method: "GET",
			customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders };
	}

	it("should pass additionalData to provisionUser and expose full relay state via getSSOState on new-user OIDC sign-in", async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "localhost.com",
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
				providerId: "oidc-additional-data",
			},
			headers,
		});

		provisionUserFn.mockClear();
		let capturedSSOState: Awaited<ReturnType<typeof getSSOState>> = null;
		provisionUserFn.mockImplementationOnce(async () => {
			capturedSSOState = await getSSOState();
		});

		const signInHeaders = new Headers();
		const res = await authClient.signIn.sso({
			email: "user@localhost.com",
			callbackURL: "/dashboard",
			additionalData: { tenantId: "acme", role: "admin" },
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(signInHeaders),
			},
		});

		await simulateOAuthFlow(res.url, signInHeaders);

		expect(provisionUserFn).toHaveBeenCalledTimes(1);
		expect(provisionUserFn).toHaveBeenCalledWith(
			expect.objectContaining({
				additionalData: { tenantId: "acme", role: "admin" },
			}),
		);

		// getSSOState exposes the full relay state including internal fields
		expect(capturedSSOState).toMatchObject({
			callbackURL: "/dashboard",
			additionalData: { tenantId: "acme", role: "admin" },
		});
		expect(capturedSSOState).toHaveProperty("expiresAt");
		expect(capturedSSOState).toHaveProperty("codeVerifier");
	});
});

describe("provisionUser should complete before user is passed to org provisioning hooks (OIDC)", async () => {
	const server = new OAuth2Server();
	let dbRef: any = null;

	const { auth, db, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:8080"],
			plugins: [
				sso({
					provisionUser: async ({ user }) => {
						await (dbRef as any).update({
							model: "user",
							where: [{ field: "id", value: user.id }],
							update: { name: "provisioned-user" },
						});
					},
					organizationProvisioning: {
						getRole: async ({ user }) => {
							return (user as any).name === "provisioned-user"
								? "admin"
								: "member";
						},
					},
				}),
				organization(),
			],
		});

	dbRef = db;

	const authClient = createAuthClient({
		plugins: [ssoClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: { customFetchImpl },
	});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.service.on("beforeUserinfo", (userInfoResponse: any) => {
			userInfoResponse.body = {
				email: "provision-hooks-test@localhost.com",
				name: "Original Name",
				sub: "provision-hooks-test-sub",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});
		server.service.on("beforeTokenSigning", (token: any) => {
			token.payload.email = "provision-hooks-test@localhost.com";
			token.payload.email_verified = true;
			token.payload.name = "Original Name";
		});
		await server.start(8080, "localhost");
	});

	afterAll(async () => {
		await server.stop();
	});

	async function simulateOAuthFlow(authUrl: string, headers: Headers) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");

		const newHeaders = new Headers();
		await betterFetch(location, {
			method: "GET",
			customFetchImpl,
			headers,
			onError(context) {
				cookieSetter(newHeaders)(context);
			},
		});

		return newHeaders;
	}

	it("should pass provisioned (re-fetched) user to org provisioning, not stale user", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Provision Hooks Org", slug: "provision-hooks-org" },
			headers,
		});

		await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "localhost.com",
				organizationId: org?.id,
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
				providerId: "provision-hooks-provider",
			},
			headers,
		});

		const signInHeaders = new Headers();
		const res = await authClient.signIn.sso({
			email: "user@localhost.com",
			callbackURL: "/dashboard",
			fetchOptions: {
				throw: true,
				onSuccess: cookieSetter(signInHeaders),
			},
		});

		await simulateOAuthFlow(res.url, signInHeaders);

		const fullOrg = await auth.api.getFullOrganization({
			query: { organizationId: org?.id || "" },
			headers,
		});

		const member = fullOrg?.members.find(
			(m: any) => m.user.email === "provision-hooks-test@localhost.com",
		);

		// provisionUser updates user name to "provisioned-user" in DB.
		// After the fix, user is re-fetched before being passed to getRole.
		// getRole sees user.name === "provisioned-user" → returns "admin".
		// Without the fix, stale user is passed with name "Original Name" → "member".
		expect(member?.role).toBe("admin");
	});
});
