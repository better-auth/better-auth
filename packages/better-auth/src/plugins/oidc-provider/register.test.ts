import { describe, expect } from "vitest";
import { oidcProvider, type OAuthClient } from ".";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from "../jwt";
import { oidcClient } from "./client";

describe("oidc register", async (it) => {
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			jwt({
				usesOauthProvider: true,
			}),
			oidcProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				scopes: [
					"openid",
					"profile",
					"email",
					"offline_access",
					"create:test",
					"delete:test",
				],
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const serverClient = createAuthClient({
		plugins: [oidcClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	it("should fail without body", async () => {
		const response = await serverClient.$fetch("/oauth2/register", {
			method: "POST",
		});
		expect(response.error?.status).toBe(400);
	});

	it("should fail without authentication", async () => {
		const unauthenticatedClient = createAuthClient({
			plugins: [oidcClient()],
			baseURL: baseUrl,
			fetchOptions: {
				customFetchImpl,
			},
		});
		const applicationRedirectOnly: Partial<OAuthClient> = {
			redirect_uris: [redirectUri],
		};
		const response = await unauthenticatedClient.$fetch("/oauth2/register", {
			method: "POST",
			body: applicationRedirectOnly,
		});
		expect(response.error?.status).toBe(401);
	});

	it("should register private client with minimum requirements", async () => {
		const applicationRedirectOnly: Partial<OAuthClient> = {
			redirect_uris: [redirectUri],
		};
		const response = await serverClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationRedirectOnly,
			},
		);
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
	});

	it("should fail authorization_code without response type code", async () => {
		const applicationImplicit: Partial<OAuthClient> = {
			response_types: ["token"],
			redirect_uris: [redirectUri],
		};
		const response = await serverClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationImplicit,
			},
		);
		expect(response.error?.status).toBe(400);
	});

	it("should fail type check for public client request", async () => {
		const applicationImplicit: Partial<OAuthClient> = {
			token_endpoint_auth_method: "none",
			type: "web",
			redirect_uris: [redirectUri],
		};
		const response = await serverClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationImplicit,
			},
		);
		expect(response.error?.status).toBe(400);
	});

	it("should fail type check for confidential client request", async () => {
		const applicationImplicit: Partial<OAuthClient> = {
			token_endpoint_auth_method: "client_secret_post",
			type: "native",
			redirect_uris: [redirectUri],
		};
		const response = await serverClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationImplicit,
			},
		);
		expect(response.error?.status).toBe(400);
		const applicationImplicit2: Partial<OAuthClient> = {
			...applicationImplicit,
			type: "user-agent-based",
		};
		const response2 = await serverClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationImplicit,
			},
		);
		expect(response2.error?.status).toBe(400);
	});

	it("should check that certain fields are overwritten", async () => {
		const applicationRequest: OAuthClient = {
			client_id: "bad-actor",
			client_secret: "bad-actor",
			client_secret_expires_at: 0,
			scope: "create:test delete:test",
			//---- Recommended client data ----//
			user_id: "bad-actor",
			client_id_issued_at: Math.round(Date.now() / 1000),
			//---- UI Metadata ----//
			client_name: "accept name",
			client_uri: "https://example.com/ok",
			logo_uri: "https://example.com/logo.png",
			contacts: ["test@example.com"],
			tos_uri: "https://example.com/terms",
			policy_uri: "https://example.com/policy",
			//---- Jwks (only one can be used) ----//
			// jwks: [],
			// jwks_uri: "https://example.com/.well-known/jwks.json",
			//---- User Software Identifiers ----//
			software_id: "custom-software-id",
			software_version: "custom-v1",
			software_statement: "custom software statement",
			//---- Authentication Metadata ----//
			redirect_uris: ["https://example.com/callback"],
			token_endpoint_auth_method: "client_secret_post",
			grant_types: [
				"authorization_code",
				"client_credentials",
				"refresh_token",
			],
			response_types: ["code", "token"],
			//---- RFC6749 Spec ----//
			public: true, // test never set on this (based off of token_endpoint_auth_method)
			type: "web",
			//---- Not Part of RFC7591 Spec ----//
			disabled: false,
		};
		const response = await serverClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationRequest,
			},
		);

		expect(response.data).toMatchObject({
			client_id: expect.any(String),
			client_secret: expect.any(String),
			client_secret_expires_at: 0,
			user_id: expect.any(String),
			client_id_issued_at: expect.any(Number),
			client_name: applicationRequest.client_name,
			client_uri: applicationRequest.client_uri,
			logo_uri: applicationRequest.logo_uri,
			contacts: applicationRequest.contacts,
			tos_uri: applicationRequest.tos_uri,
			policy_uri: applicationRequest.policy_uri,
			software_id: applicationRequest.software_id,
			software_version: applicationRequest.software_version,
			software_statement: applicationRequest.software_statement,
			redirect_uris: applicationRequest.redirect_uris,
			token_endpoint_auth_method: applicationRequest.token_endpoint_auth_method,
			grant_types: applicationRequest.grant_types,
			response_types: applicationRequest.response_types,
			public: false,
			type: applicationRequest.type,
			disabled: null,
		});

		expect(response.data?.client_id).not.toEqual(applicationRequest.client_id);
		expect(response.data?.client_secret).not.toEqual(
			applicationRequest.client_secret,
		);
		expect(response.data?.scope).toBeUndefined();
		expect(response.data?.scope).not.toEqual(applicationRequest.scope);
		expect(response.data?.user_id).not.toEqual(applicationRequest.user_id);

		expect(response.data?.jwks).toBeUndefined();
		expect(response.data?.jwks_uri).toBeUndefined();
	});
});

describe("oidc register - unauthenticated", async (it) => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				usesOauthProvider: true,
			}),
			oidcProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
			}),
		],
	});
	const unauthenticatedClient = createAuthClient({
		plugins: [oidcClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	it("should create public clients without authentication", async () => {
		const applicationRedirectOnly: Partial<OAuthClient> = {
			token_endpoint_auth_method: "none",
			redirect_uris: [redirectUri],
		};
		const response = await unauthenticatedClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationRedirectOnly,
			},
		);
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeUndefined();
	});

	it("should not create confidential clients without authentication", async () => {
		const applicationRedirectOnly: Partial<OAuthClient> = {
			redirect_uris: [redirectUri],
		};
		const response = await unauthenticatedClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationRedirectOnly,
			},
		);
		expect(response.error?.status).toBe(401);
	});
});
