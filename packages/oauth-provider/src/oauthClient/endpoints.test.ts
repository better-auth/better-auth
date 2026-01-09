import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "../client";
import { oauthProvider } from "../oauth";
import type { OAuthClient } from "../types/oauth";

describe("oauthClient", async () => {
	const providerId = "test";
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const { signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			jwt(),
		],
	});
	const { headers } = await signInWithTestUser();

	const authClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	const testUiClientInput: Omit<OAuthClient, "client_id"> = {
		client_name: "accept name",
		client_uri: "https://example.com/ok",
		logo_uri: "https://example.com/logo.png",
		contacts: ["test@example.com"],
		tos_uri: "https://example.com/terms",
		policy_uri: "https://example.com/policy",
		redirect_uris: [],
	};
	let oauthClient: OAuthClient;
	let oauthPublicClient: OAuthClient;
	let oauthUiClient: OAuthClient;

	it("should create clients with minimum requirements", async () => {
		const client = await authClient.oauth2.createClient({
			redirect_uris: [redirectUri],
		});
		expect(client?.data?.client_id).toBeDefined();
		expect(client?.data?.user_id).toBeDefined();
		expect(client?.data?.client_secret).toBeDefined();
		oauthClient = client.data!;

		const publicClient = await authClient.oauth2.createClient({
			token_endpoint_auth_method: "none",
			redirect_uris: [redirectUri],
		});
		expect(publicClient?.data?.client_id).toBeDefined();
		expect(publicClient?.data?.user_id).toBeDefined();
		expect(publicClient?.data?.client_secret).toBeUndefined();
		oauthPublicClient = publicClient.data!;

		const uiClient = await authClient.oauth2.createClient({
			...testUiClientInput,
			redirect_uris: [redirectUri],
		});
		expect(uiClient?.data?.client_id).toBeDefined();
		expect(uiClient?.data?.user_id).toBeDefined();
		expect(uiClient?.data?.client_secret).toBeDefined();
		oauthUiClient = uiClient.data!;
	});

	it("should get a client", async () => {
		const client = await authClient.oauth2.getClient({
			query: {
				client_id: oauthClient.client_id,
			},
		});
		const { client_secret, ...check } = client.data ?? {};
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);
	});

	it("should get public-only information about a client", async () => {
		const client = await authClient.oauth2.publicClient({
			query: {
				client_id: oauthUiClient.client_id,
			},
		});
		expect(client.data).toMatchObject({
			client_id: oauthUiClient.client_id,
			...testUiClientInput,
		});
	});

	it("should get user's clients", async () => {
		const clients = await authClient.oauth2.getClients();
		expect(clients?.data?.length).toBe(3);
		const [client, clientPublic] = clients.data ?? [];
		const { client_secret, ...check } = client ?? {};
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);
		const { client_secret: clientSecretPublic, ...checkPublic } =
			clientPublic ?? {};
		const { client_secret: _clientSecretPublic, ...expectedPublic } =
			oauthPublicClient;
		expect(clientSecretPublic).toBeUndefined();
		expect(checkPublic).toMatchObject(expectedPublic);
	});

	it("should not allow client to become public", async () => {
		const client = await authClient.oauth2.updateClient({
			client_id: oauthClient.client_id,
			update: {
				// @ts-expect-error
				public: true,
				token_endpoint_auth_method: "none",
				client_secret: undefined,
			},
		});
		const { client_secret, ...check } = client.data ?? {};
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);
	});

	it("should not allow updates to client_secret", async () => {
		const client = await authClient.oauth2.updateClient({
			client_id: oauthClient.client_id,
			update: {
				// @ts-expect-error
				client_secret: "bad_request",
			},
		});
		const { client_secret, ...check } = client.data ?? {};
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);
	});

	it("should update the client", async () => {
		const newRedirectUri = `https://example.com/api/auth/oauth2/callback/${providerId}`;
		const client = await authClient.oauth2.updateClient({
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
	});

	it("should rotate the client secret", async () => {
		const client = await authClient.oauth2.client.rotateSecret({
			client_id: oauthClient.client_id,
		});
		const { client_secret, ...check } = client.data ?? {};
		const { client_secret: clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeDefined();
		expect(client_secret).not.toBe(clientSecret);
		expect(check).toMatchObject(expected);
		oauthClient = client.data!;
	});

	it("should delete the client", async () => {
		const client = await authClient.oauth2.deleteClient({
			client_id: oauthClient.client_id,
		});
		expect(client.data).toBeNull();
	});
});
