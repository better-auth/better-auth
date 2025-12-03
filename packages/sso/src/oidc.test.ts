import { betterFetch } from "@better-fetch/fetch";
import { createAuthClient } from "better-auth/client";
import { organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";
import * as discoveryModule from "./oidc/discovery";

let server = new OAuth2Server();

describe("SSO", async () => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
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
					tokenEndpointAuthentication: "client_secret_basic",
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
				tokenEndpointAuthentication: "client_secret_basic",
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
					tokenEndpointAuthentication: "client_secret_basic",
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
						tokenEndpointAuthentication: "client_secret_basic",
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
});

describe("SSO disable implicit sign in", async () => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
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
					tokenEndpointAuthentication: "client_secret_basic",
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
				tokenEndpointAuthentication: "client_secret_basic",
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
					tokenEndpointAuthentication: "client_secret_basic",
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

describe("OIDC Discovery errors at registration", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [sso(), organization()],
	});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		await server.start(8080, "localhost");
	});

	afterAll(async () => {
		await server.stop().catch(() => {});
	});

	it("should fail registration when IdP only supports unsupported token auth methods", async () => {
		// The mock server advertises only "none" which we don't support
		// Without tokenEndpointAuthentication override, discovery should fail
		const { headers } = await signInWithTestUser();

		await expect(
			auth.api.registerSSOProvider({
				body: {
					issuer: server.issuer.url!,
					domain: "unsupported-auth.com",
					providerId: "unsupported-auth-provider",
					oidcConfig: {
						clientId: "test",
						clientSecret: "test",
						// Note: NOT providing tokenEndpointAuthentication
						// so discovery will check the IdP's advertised methods
					},
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: {
				code: "unsupported_token_auth_method",
			},
		});
	});

	it("should fail registration when discovery endpoint returns invalid issuer", async () => {
		const { headers } = await signInWithTestUser();

		// Use a mismatched issuer - the mock server's issuer is http://localhost:8080
		// but we claim a different issuer
		await expect(
			auth.api.registerSSOProvider({
				body: {
					issuer: "https://different-issuer.example.com",
					domain: "mismatch.com",
					providerId: "issuer-mismatch-provider",
					oidcConfig: {
						clientId: "test",
						clientSecret: "test",
						tokenEndpointAuthentication: "client_secret_basic",
						// Point discovery to the mock server (which will return different issuer)
						discoveryEndpoint: `${server.issuer.url}/.well-known/openid-configuration`,
					},
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: {
				code: "issuer_mismatch",
			},
		});
	});

	it("should map connection failures during discovery to BAD_GATEWAY + discovery_unexpected_error", async () => {
		const { headers } = await signInWithTestUser();

		// Connection failure (ECONNREFUSED against unused localhost port)
		// must surface as discovery_unexpected_error → BAD_GATEWAY
		await expect(
			auth.api.registerSSOProvider({
				body: {
					issuer: "http://127.0.0.1:59999",
					domain: "unreachable.com",
					providerId: "unreachable-provider",
					oidcConfig: {
						clientId: "test",
						clientSecret: "test",
						tokenEndpointAuthentication: "client_secret_basic",
					},
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "BAD_GATEWAY",
			body: {
				code: "discovery_unexpected_error",
			},
		});
	}, 5000); // 5s timeout: ECONNREFUSED is fast, but allow buffer for CI

	it("should succeed when user provides all required endpoints (discovery still validates)", async () => {
		const { headers } = await signInWithTestUser();

		const provider = await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "full-config.com",
				providerId: "full-config-provider",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					// Providing all endpoints + tokenEndpointAuthentication
					// Discovery still runs but our values override
					authorizationEndpoint: `${server.issuer.url}/custom-authorize`,
					tokenEndpoint: `${server.issuer.url}/custom-token`,
					jwksEndpoint: `${server.issuer.url}/custom-jwks`,
					userInfoEndpoint: `${server.issuer.url}/custom-userinfo`,
					tokenEndpointAuthentication: "client_secret_post",
				},
			},
			headers,
		});

		// User-provided values should be preserved (not overwritten by discovery)
		expect(provider.oidcConfig).toMatchObject({
			authorizationEndpoint: `${server.issuer.url}/custom-authorize`,
			tokenEndpoint: `${server.issuer.url}/custom-token`,
			jwksEndpoint: `${server.issuer.url}/custom-jwks`,
			userInfoEndpoint: `${server.issuer.url}/custom-userinfo`,
			tokenEndpointAuthentication: "client_secret_post",
		});
	});

	it("should hydrate missing endpoints from discovery", async () => {
		const { headers } = await signInWithTestUser();

		const provider = await auth.api.registerSSOProvider({
			body: {
				issuer: server.issuer.url!,
				domain: "partial-config.com",
				providerId: "partial-config-provider",
				oidcConfig: {
					clientId: "test",
					clientSecret: "test",
					// Only providing required overrides, let discovery fill the rest
					tokenEndpointAuthentication: "client_secret_basic",
				},
			},
			headers,
		});

		// Endpoints should be hydrated from discovery
		expect(provider.oidcConfig).toMatchObject({
			issuer: server.issuer.url,
			authorizationEndpoint: `${server.issuer.url}/authorize`,
			tokenEndpoint: `${server.issuer.url}/token`,
			jwksEndpoint: `${server.issuer.url}/jwks`,
			tokenEndpointAuthentication: "client_secret_basic",
		});
	});
});

describe("Runtime fallback discovery (legacy providers)", async () => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter, db } =
		await getTestInstance({
			plugins: [sso(), organization()],
		});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		await server.start(8080, "localhost");
	});

	afterAll(async () => {
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

	async function createLegacyProvider(
		providerId: string,
		oidcConfig: Record<string, unknown>,
	) {
		const { headers } = await signInWithTestUser();
		const session = await auth.api.getSession({ headers });
		if (!session?.user?.id) throw new Error("No user session");

		await db.create({
			model: "ssoProvider",
			data: {
				providerId,
				issuer: server.issuer.url!,
				domain: `${providerId}.example.com`,
				userId: session.user.id,
				oidcConfig: JSON.stringify(oidcConfig),
			},
		});

		return { headers };
	}

	it("should complete OAuth flow for legacy provider missing tokenEndpoint and jwksEndpoint", async () => {
		await createLegacyProvider("legacy-incomplete", {
			issuer: server.issuer.url!,
			clientId: "test",
			clientSecret: "test",
			authorizationEndpoint: `${server.issuer.url}/authorize`,
			tokenEndpointAuthentication: "client_secret_basic",
		});

		const ssoHeaders = new Headers();
		const signInRes = await auth.api.signInSSO({
			body: {
				providerId: "legacy-incomplete",
				callbackURL: "/dashboard",
			},
			headers: ssoHeaders,
			asResponse: true,
		});

		cookieSetter(ssoHeaders)({ response: signInRes } as any);
		const responseData = await signInRes.json();

		expect(responseData.url).toContain(`${server.issuer.url}/authorize`);

		const { callbackURL } = await simulateOAuthFlow(
			responseData.url,
			ssoHeaders,
		);

		expect(callbackURL).toContain("/dashboard");
		expect(callbackURL).not.toContain("error=");
	});

	it("should complete OAuth flow for legacy provider with complete config (no discovery needed)", async () => {
		await createLegacyProvider("legacy-complete", {
			issuer: server.issuer.url!,
			clientId: "test",
			clientSecret: "test",
			authorizationEndpoint: `${server.issuer.url}/authorize`,
			tokenEndpoint: `${server.issuer.url}/token`,
			jwksEndpoint: `${server.issuer.url}/jwks`,
			tokenEndpointAuthentication: "client_secret_basic",
		});

		const ssoHeaders = new Headers();
		const signInRes = await auth.api.signInSSO({
			body: {
				providerId: "legacy-complete",
				callbackURL: "/dashboard",
			},
			headers: ssoHeaders,
			asResponse: true,
		});

		cookieSetter(ssoHeaders)({ response: signInRes } as any);
		const responseData = await signInRes.json();

		expect(responseData.url).toContain(`${server.issuer.url}/authorize`);

		const { callbackURL } = await simulateOAuthFlow(
			responseData.url,
			ssoHeaders,
		);

		expect(callbackURL).not.toContain("discovery");
		expect(callbackURL).not.toContain("token_endpoint_not_found");
		expect(callbackURL).not.toContain("jwks_endpoint_not_found");
	});

	it("should NOT call discoverOIDCConfig when provider has tokenEndpoint and jwksEndpoint", async () => {
		const discoverSpy = vi.spyOn(discoveryModule, "discoverOIDCConfig");

		await createLegacyProvider("legacy-no-discovery", {
			issuer: server.issuer.url!,
			clientId: "test",
			clientSecret: "test",
			authorizationEndpoint: `${server.issuer.url}/authorize`,
			tokenEndpoint: `${server.issuer.url}/token`,
			jwksEndpoint: `${server.issuer.url}/jwks`,
			tokenEndpointAuthentication: "client_secret_basic",
		});

		const ssoHeaders = new Headers();
		const signInRes = await auth.api.signInSSO({
			body: {
				providerId: "legacy-no-discovery",
				callbackURL: "/dashboard",
			},
			headers: ssoHeaders,
			asResponse: true,
		});

		cookieSetter(ssoHeaders)({ response: signInRes } as any);
		const responseData = await signInRes.json();
		expect(responseData.url).toContain(`${server.issuer.url}/authorize`);

		await simulateOAuthFlow(responseData.url, ssoHeaders);

		expect(discoverSpy).not.toHaveBeenCalled();
		discoverSpy.mockRestore();
	});
});
