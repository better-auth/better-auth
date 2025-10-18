import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	getTestInstanceMemory as getTestInstanceMemory,
	getTestInstance,
} from "better-auth/test";
import { sso } from ".";
import { OAuth2Server } from "oauth2-mock-server";
import { betterFetch } from "@better-fetch/fetch";
import { organization } from "better-auth/plugins";
import { createAuthClient } from "better-auth/client";
import { ssoClient } from "./client";

let server = new OAuth2Server();

describe("SSO", async () => {
	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstanceMemory({
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

describe("SSO Foreign Key Constraints", async () => {
	// Create a dedicated server instance for this test suite
	const fkConstraintsServer = new OAuth2Server();

	const { auth, runWithUser, customFetchImpl } = await getTestInstance({
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
		await fkConstraintsServer.issuer.keys.generate("RS256");
		fkConstraintsServer.issuer.on;
		await fkConstraintsServer.start(8083, "localhost");

		// Set up token signing
		fkConstraintsServer.service.on("beforeTokenSigning", (token, req) => {
			token.payload.email = "sso-user@localhost:8000.com";
			token.payload.email_verified = true;
			token.payload.name = "Test User";
			token.payload.picture = "https://test.com/picture.png";
		});
	});

	afterAll(async () => {
		await fkConstraintsServer.stop();
	});

	it("should not delete SSO provider when creator user is deleted", async () => {
		// Create a user for this test
		const testUser = {
			email: "user-delete-test@example.com",
			password: "password123456",
			name: "User Delete Test",
		};

		const { data: signUpData } = await authClient.signUp.email(testUser);
		const userId = signUpData?.user.id!;

		await runWithUser(testUser.email, testUser.password, async (headers) => {
			const provider = await auth.api.registerSSOProvider({
				body: {
					issuer: fkConstraintsServer.issuer.url!,
					domain: "oidc-delete-test.com",
					oidcConfig: {
						clientId: "test-delete",
						clientSecret: "test-delete",
						authorizationEndpoint: `${fkConstraintsServer.issuer.url}/authorize`,
						tokenEndpoint: `${fkConstraintsServer.issuer.url}/token`,
						jwksEndpoint: `${fkConstraintsServer.issuer.url}/jwks`,
						discoveryEndpoint: `${fkConstraintsServer.issuer.url}/.well-known/openid-configuration`,
						mapping: {
							id: "sub",
							email: "email",
							emailVerified: "email_verified",
							name: "name",
							image: "picture",
						},
					},
					providerId: "oidc-delete-test",
				},
				headers,
			});

			// Verify provider exists before deletion and has the correct userId
			const providerBeforeDelete = await auth.$context.then((ctx) =>
				ctx.adapter.findOne<{
					userId: string | null;
					domain: string;
					providerId: string;
				}>({
					model: "ssoProvider",
					where: [{ field: "providerId", value: "oidc-delete-test" }],
				}),
			);

			expect(providerBeforeDelete).toBeTruthy();
			expect(providerBeforeDelete?.userId).toBe(userId);
		});

		// Delete the user who created the SSO provider (outside runWithUser)
		// The database foreign key constraint with SET NULL should handle setting userId to null
		await auth.$context.then((ctx) =>
			ctx.adapter.delete({
				model: "user",
				where: [
					{
						field: "id",
						value: userId,
					},
				],
			}),
		);

		// Verify SSO provider still exists but userId is null
		const ssoProvider = await auth.$context.then((ctx) =>
			ctx.adapter.findOne<{
				userId: string | null;
				domain: string;
				providerId: string;
			}>({
				model: "ssoProvider",
				where: [
					{
						field: "providerId",
						value: "oidc-delete-test",
					},
				],
			}),
		);

		expect(ssoProvider).toBeTruthy();
		expect(ssoProvider?.userId).toBeNull();
		expect(ssoProvider?.domain).toBe("oidc-delete-test.com");
	});

	it("should delete SSO provider when organization is deleted", async () => {
		// Create a different user for this test
		const testUser = {
			email: "org-delete-test@example.com",
			password: "password123456",
			name: "Org Delete Test",
		};

		await authClient.signUp.email(testUser);

		await runWithUser(testUser.email, testUser.password, async (headers) => {
			// Create an organization
			const org = await auth.api.createOrganization({
				body: {
					name: "Test Org For Cascade Delete",
					slug: "test-org-cascade",
				},
				headers,
			});

			// Register an SSO provider for the organization
			const provider = await auth.api.registerSSOProvider({
				body: {
					issuer: fkConstraintsServer.issuer.url!,
					domain: "org-cascade-delete.com",
					oidcConfig: {
						clientId: "test-org-cascade",
						clientSecret: "test-org-cascade",
						authorizationEndpoint: `${fkConstraintsServer.issuer.url}/authorize`,
						tokenEndpoint: `${fkConstraintsServer.issuer.url}/token`,
						jwksEndpoint: `${fkConstraintsServer.issuer.url}/jwks`,
						discoveryEndpoint: `${fkConstraintsServer.issuer.url}/.well-known/openid-configuration`,
						mapping: {
							id: "sub",
							email: "email",
							emailVerified: "email_verified",
							name: "name",
							image: "picture",
						},
					},
					providerId: "oidc-org-cascade",
					organizationId: org!.id,
				},
				headers,
			});

			// Verify provider exists and is linked to the organization
			const providerBeforeDelete = await auth.$context.then((ctx) =>
				ctx.adapter.findOne<{
					organizationId: string | null;
					domain: string;
					providerId: string;
				}>({
					model: "ssoProvider",
					where: [{ field: "providerId", value: "oidc-org-cascade" }],
				}),
			);

			expect(providerBeforeDelete).toBeTruthy();
			expect(providerBeforeDelete?.organizationId).toBe(org!.id);

			// Delete the organization
			// The database foreign key constraint with CASCADE should handle deleting the SSO provider
			await auth.$context.then((ctx) =>
				ctx.adapter.delete({
					model: "organization",
					where: [
						{
							field: "id",
							value: org!.id,
						},
					],
				}),
			);

			// Verify SSO provider is deleted
			const ssoProvider = await auth.$context.then((ctx) =>
				ctx.adapter.findOne<{
					organizationId: string | null;
					domain: string;
					providerId: string;
				}>({
					model: "ssoProvider",
					where: [
						{
							field: "providerId",
							value: "oidc-org-cascade",
						},
					],
				}),
			);

			expect(ssoProvider).toBeNull();
		});
	});
});
