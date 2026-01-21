import { betterFetch } from "@better-fetch/fetch";
import { createAuthClient } from "better-auth/client";
import { organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

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
		expect(callbackURL).toContain(
			"/api/auth/error/error?error=signup disabled",
		);
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
			(m: any) => m.user.email === "sso-user@localhost:8000.com",
		);
		expect(member).toMatchObject({
			role: "member",
			user: {
				id: expect.any(String),
				name: "Test User",
				email: "sso-user@localhost:8000.com",
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
