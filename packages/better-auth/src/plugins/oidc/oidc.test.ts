import { afterAll, beforeAll, describe, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidc } from ".";
import { genericOAuth } from "../generic-oauth";
import type { Client } from "./types";
import { createAuthClient } from "../../client";
import { oidcClient } from "./client";
import { genericOAuthClient } from "../generic-oauth/client";
import { listen, type Listener } from "listhen";
import { toNodeHandler } from "../../integrations/node";

describe("oidc", async () => {
	const {
		auth: authorizationServer,
		signInWithTestUser,
		customFetchImpl,
		testUser,
	} = await getTestInstance({
		baseURL: "http://localhost:3000",
		plugins: [
			oidc({
				loginPage: "/login",
				consentPage: "/oauth2/authorize",
				requirePKCE: true,
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const serverClient = createAuthClient({
		plugins: [oidcClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let server: Listener;

	beforeAll(async () => {
		server = await listen(toNodeHandler(authorizationServer.handler), {
			port: 3000,
		});
	});

	afterAll(async () => {
		await server.close();
	});

	let oauthClient: Client = {
		clientId: "test-client-id",
		clientSecret: "test-client-secret-oidc",
		redirectURLs: ["http://localhost:3000/api/auth/oauth2/callback/test"],
		metadata: {},
		icon: "",
		authenticationScheme: "client_secret_post",
		type: "web",
		disabled: false,
		name: "test",
	};

	it("should create oidc client", async ({ expect }) => {
		const createdClient = await serverClient.oauth2.registerClient({
			name: oauthClient.name,
			redirectURLs: oauthClient.redirectURLs,
			icon: oauthClient.icon,
			metadata: {
				custom: "data",
			},
		});
		expect(createdClient.data).toMatchObject({
			id: expect.any(String),
			name: "test",
			icon: "",
			metadata: {
				custom: "data",
			},
			clientId: expect.any(String),
			clientSecret: expect.any(String),
			redirectURLs: ["http://localhost:3000/api/auth/oauth2/callback/test"],
			type: "web",
			authenticationScheme: "client_secret",
			disabled: false,
			userId: expect.any(String),
		});
		if (createdClient.data) {
			oauthClient = createdClient.data;
		}
	});

	it("should sign in the user with the provider", async ({ expect }) => {
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP } = await getTestInstance({
			account: {
				accountLinking: {
					trustedProviders: ["test"],
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test",
							clientId: oauthClient.clientId,
							clientSecret: oauthClient.clientSecret,
							authorizationUrl:
								"http://localhost:3000/api/auth/oauth2/authorize",
							tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
							scopes: ["openid", "profile", "email"],
							pkce: true,
						},
					],
				}),
			],
		});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${oauthClient.clientId}`);

		let redirectURI = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
			},
		});
		expect(redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);

		let callbackURL = "";
		await client.$fetch(redirectURI, {
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/dashboard");
	});

	it("should sign in after a consent flow", async ({ expect }) => {
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: ["test"],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: oauthClient.clientId,
								clientSecret: oauthClient.clientSecret,
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes: ["openid", "profile", "email"],
								prompt: "consent",
								pkce: true,
							},
						],
					}),
				],
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${oauthClient.clientId}`);

		let redirectURI = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
				newHeaders.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(redirectURI).toContain("/oauth2/authorize?client_id=");
		const res = await serverClient.oauth2.consent(
			{
				accept: true,
			},
			{
				headers: newHeaders,
				throw: true,
			},
		);
		expect(res.redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);

		let callbackURL = "";
		await client.$fetch(res.redirectURI, {
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/dashboard");
	});

	it("should sign in after a login flow", async ({ expect }) => {
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: ["test"],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: oauthClient.clientId,
								clientSecret: oauthClient.clientSecret,
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes: ["openid", "profile", "email"],
								prompt: "login",
								pkce: true,
							},
						],
					}),
				],
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${oauthClient.clientId}`);

		let redirectURI = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
			},
		});
		expect(redirectURI).toContain("/login");

		await serverClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: newHeaders,
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
					cookieSetter(newHeaders)(context);
				},
			},
		);
		expect(redirectURI).toContain("/oauth2/authorize?client_id=");
		const res = await serverClient.oauth2.consent(
			{
				accept: true,
			},
			{
				headers: newHeaders,
				throw: true,
			},
		);
		expect(res.redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);
		let callbackURL = "";
		await client.$fetch(res.redirectURI, {
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/dashboard");
	});

});
