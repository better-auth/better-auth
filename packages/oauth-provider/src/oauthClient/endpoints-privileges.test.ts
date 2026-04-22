import { APIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "../client.js";
import { oauthProvider } from "../oauth.js";
import type { OAuthClient } from "../types/oauth.js";

describe("oauthClient", async () => {
	const providerId = "test";
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const allowedUser = {
		email: "allowed@test.com",
		password: "test123456",
		name: "allowed user",
	};
	const forbiddenUser = {
		email: "forbidden@test.com",
		password: "test123456",
		name: "forbidden user",
	};
	const clientPrivileges = vi.fn(({ user }) => {
		if (user?.email === allowedUser.email) {
			return true;
		}
		return false;
	});
	const { auth, customFetchImpl, signInWithUser } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				clientReference() {
					return "oauth-client-test";
				},
				clientPrivileges,
			}),
			jwt(),
		],
	});
	await auth.api.signUpEmail({
		body: allowedUser,
	});
	await auth.api.signUpEmail({
		body: forbiddenUser,
	});
	const { headers: allowedUserHeaders } = await signInWithUser(
		allowedUser.email,
		allowedUser.password,
	);
	const { headers: forbiddenUserHeaders } = await signInWithUser(
		forbiddenUser.email,
		forbiddenUser.password,
	);

	const unauthedAuthClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});
	const allowedAuthClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
			headers: allowedUserHeaders,
		},
	});
	const forbiddenAuthClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
			headers: forbiddenUserHeaders,
		},
	});

	const testClientInput: Omit<OAuthClient, "client_id"> = {
		client_name: "accept name",
		client_uri: "https://example.com/ok",
		logo_uri: "https://example.com/logo.png",
		contacts: ["test@example.com"],
		tos_uri: "https://example.com/terms",
		policy_uri: "https://example.com/policy",
	};
	let oauthClient: OAuthClient;

	beforeEach(() => {
		clientPrivileges.mockClear();
	});

	it("should not create client with unauthenticated session", async () => {
		const client = await unauthedAuthClient.oauth2.createClient({
			...testClientInput,
			redirect_uris: [redirectUri],
		});
		expect(client.error).toMatchObject({
			status: 401,
			statusText: "UNAUTHORIZED",
		});
		expect(client.data).toMatchObject({});
	});

	it("should not create client with forbidden user", async () => {
		const client = await forbiddenAuthClient.oauth2.createClient({
			...testClientInput,
			redirect_uris: [redirectUri],
		});
		expect(client.error).toMatchObject({
			status: 401,
			statusText: "UNAUTHORIZED",
		});
		expect(client.data).toMatchObject({});

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should create client with allowed user", async () => {
		const client = await allowedAuthClient.oauth2.createClient({
			...testClientInput,
			redirect_uris: [redirectUri],
		});
		expect(client?.data?.client_id).toBeDefined();
		expect(client?.data?.user_id).toBeUndefined();
		expect(client?.data?.reference_id).toBeDefined();
		expect(client?.data?.client_secret).toBeDefined();
		expect(client?.data?.client_id_issued_at).toBeDefined();

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should not create client with forbidden user via admin api", async () => {
		try {
			await auth.api.adminCreateOAuthClient({
				headers: forbiddenUserHeaders,
				body: {
					...testClientInput,
					redirect_uris: [redirectUri],
					skip_consent: true,
				},
			});
			throw new Error("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			if (error instanceof APIError) {
				expect(error.statusCode).toBe(401);
				expect(error.status).toBe("UNAUTHORIZED");
			}
		}

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should create client with allowed user via admin api", async () => {
		const adminClient = await auth.api.adminCreateOAuthClient({
			headers: allowedUserHeaders,
			body: {
				...testClientInput,
				redirect_uris: [redirectUri],
			},
		});
		expect(adminClient?.client_id).toBeDefined();
		expect(adminClient?.user_id).toBeUndefined();
		expect(adminClient?.reference_id).toBeDefined();
		expect(adminClient?.client_secret).toBeDefined();
		expect(adminClient.client_id_issued_at).toBeDefined();

		const client = await allowedAuthClient.oauth2.getClient({
			query: {
				client_id: adminClient.client_id,
			},
		});
		expect(client?.data?.client_id).toBeDefined();
		expect(client?.data?.user_id).toBeUndefined();
		expect(client?.data?.reference_id).toBeDefined();
		expect(client?.data?.client_secret).toBeUndefined();
		expect(client.data?.client_id_issued_at).toBeDefined();
		oauthClient = client.data!;
		oauthClient.client_secret = adminClient.client_secret;

		expect(clientPrivileges).toHaveBeenCalledTimes(2);
	});

	it("should not get a client with forbidden user", async () => {
		const client = await forbiddenAuthClient.oauth2.getClient({
			query: {
				client_id: oauthClient.client_id,
			},
		});
		expect(client.error).toMatchObject({
			status: 401,
			statusText: "UNAUTHORIZED",
		});
		expect(client.data).toMatchObject({});

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should get a client with allowed user", async () => {
		const client = await allowedAuthClient.oauth2.getClient({
			query: {
				client_id: oauthClient.client_id,
			},
		});
		const { client_secret, ...check } = client.data ?? {};
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should get public-only information about a client with any user", async () => {
		const allowedClient = await allowedAuthClient.oauth2.publicClient({
			query: {
				client_id: oauthClient.client_id,
			},
		});
		expect(allowedClient.data).toMatchObject({
			client_id: oauthClient.client_id,
			...testClientInput,
		});

		const forbiddenClient = await forbiddenAuthClient.oauth2.publicClient({
			query: {
				client_id: oauthClient.client_id,
			},
		});
		expect(forbiddenClient.data).toMatchObject({
			client_id: oauthClient.client_id,
			...testClientInput,
		});

		expect(clientPrivileges).toHaveBeenCalledTimes(0);
	});

	it("should not get clients with forbidden user", async () => {
		const clients = await forbiddenAuthClient.oauth2.getClients();
		expect(clients.error).toMatchObject({
			status: 401,
			statusText: "UNAUTHORIZED",
		});
		expect(clients.data).toMatchObject({});

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should get clients with allowed user", async () => {
		const clients = await allowedAuthClient.oauth2.getClients();
		expect(clients?.data?.length).toBe(2);
		const [_, client] = clients.data ?? [];
		const { client_secret, ...check } = client ?? {};
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should not update the client with forbidden user", async () => {
		const newRedirectUri = `https://example.com/api/auth/oauth2/callback/${providerId}`;
		const client = await forbiddenAuthClient.oauth2.updateClient({
			client_id: oauthClient.client_id,
			update: {
				redirect_uris: [redirectUri, newRedirectUri],
			},
		});
		expect(client.error).toMatchObject({
			status: 401,
			statusText: "UNAUTHORIZED",
		});
		expect(client.data).toMatchObject({});

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should update the client with allowed user", async () => {
		const newRedirectUri = `https://example.com/api/auth/oauth2/callback/${providerId}`;
		const client = await allowedAuthClient.oauth2.updateClient({
			client_id: oauthClient.client_id,
			update: {
				redirect_uris: [redirectUri, newRedirectUri],
			},
		});
		const { client_secret, ...check } = client.data ?? {};
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject({
			...expected,
			redirect_uris: [redirectUri, newRedirectUri],
		});
		oauthClient = client.data!;

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should not rotate the client secret with forbidden user", async () => {
		const client = await forbiddenAuthClient.oauth2.client.rotateSecret({
			client_id: oauthClient.client_id,
		});
		expect(client.error).toMatchObject({
			status: 401,
			statusText: "UNAUTHORIZED",
		});
		expect(client.data).toMatchObject({});

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should rotate the client secret with allowed user", async () => {
		const client = await allowedAuthClient.oauth2.client.rotateSecret({
			client_id: oauthClient.client_id,
		});
		const { client_secret, ...check } = client.data ?? {};
		const { client_secret: clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeDefined();
		expect(client_secret).not.toBe(clientSecret);
		expect(check).toMatchObject(expected);
		oauthClient = client.data!;

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should not delete the client with forbidden user", async () => {
		const client = await forbiddenAuthClient.oauth2.deleteClient({
			client_id: oauthClient.client_id,
		});
		expect(client.error).toMatchObject({
			status: 401,
			statusText: "UNAUTHORIZED",
		});
		expect(client.data).toMatchObject({});

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});

	it("should delete the client with allowed user", async () => {
		const client = await allowedAuthClient.oauth2.deleteClient({
			client_id: oauthClient.client_id,
		});
		expect(client.data).toBeNull();

		expect(clientPrivileges).toHaveBeenCalledTimes(1);
	});
});
