import { describe, expect, it } from "vitest";
import { oauthProvider } from "../oauth";
import { getTestInstance } from "../../../test-utils/test-instance";
import { jwt } from "../../jwt";
import type { OAuthClient } from "packages/better-auth/src/oauth-2.1/types";

describe("oauthClient", async () => {
	const providerId = "test";
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const { auth, signInWithTestUser } = await getTestInstance({
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
	const { headers, user } = await signInWithTestUser();

	let oauthClient: OAuthClient;
	let oauthPublicClient: OAuthClient;
	it("should create clients with minimum requirements", async () => {
		const client = await auth.api.createOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
			},
		});
		expect(client?.client_id).toBeDefined();
		expect(client?.user_id).toBeDefined();
		expect(client?.client_secret).toBeDefined();
		oauthClient = client;

		const publicClient = await auth.api.createOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				redirect_uris: [redirectUri],
			},
		});
		expect(publicClient?.client_id).toBeDefined();
		expect(publicClient?.user_id).toBeDefined();
		expect(publicClient?.client_secret).toBeUndefined();
		oauthPublicClient = publicClient;
	});

	it("should get a client", async () => {
		const client = await auth.api.getOAuthClient({
			headers,
			params: {
				id: oauthClient.client_id,
			},
		});
		const { client_secret, ...check } = client;
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);
	});

	it("should get user's clients", async () => {
		const clients = await auth.api.getOAuthClients({
			headers,
			query: {
				user_id: user.id,
			},
		});
		expect(clients?.length).toBe(2);
		const [client, clientPublic] = clients;
		const { client_secret, ...check } = client;
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);
		const { client_secret: clientSecretPublic, ...checkPublic } = clientPublic;
		const { client_secret: _clientSecretPublic, ...expectedPublic } =
			oauthPublicClient;
		expect(clientSecretPublic).toBeUndefined();
		expect(checkPublic).toMatchObject(expectedPublic);
	});

	it("should not allow client to become public", async () => {
		const client = await auth.api.updateOAuthClient({
			headers,
			params: {
				id: oauthClient.client_id,
			},
			body: {
				public: true,
				token_endpoint_auth_method: "none",
				client_secret: undefined,
			},
		});
		const { client_secret, ...check } = client;
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);
	});

	it("should not allow updates to client_secret", async () => {
		const client = await auth.api.updateOAuthClient({
			headers,
			params: {
				id: oauthClient.client_id,
			},
			body: {
				client_secret: "bad_request",
			},
		});
		const { client_secret, ...check } = client;
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject(expected);
	});

	it("should update the client", async () => {
		const newRedirectUri = `https://example.com/api/auth/oauth2/callback/${providerId}`;
		const client = await auth.api.updateOAuthClient({
			headers,
			params: {
				id: oauthClient.client_id,
			},
			body: {
				redirect_uris: [redirectUri, newRedirectUri],
			},
		});
		const { client_secret, ...check } = client;
		const { client_secret: _clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeUndefined();
		expect(check).toMatchObject({
			...expected,
			redirect_uris: [redirectUri, newRedirectUri],
		});
		oauthClient = client;
	});

	it("should rotate the client secret", async () => {
		const client = await auth.api.rotateClientSecret({
			headers,
			params: {
				id: oauthClient.client_id,
			},
		});
		const { client_secret, ...check } = client;
		const { client_secret: clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeDefined();
		expect(client_secret).not.toBe(clientSecret);
		expect(check).toMatchObject(expected);
		oauthClient = client;
	});

	it("should delete the client", async () => {
		const client = await auth.api.deleteOAuthClient({
			headers,
			params: {
				id: oauthClient.client_id,
			},
		});
		expect(client).toBeUndefined();
	});
});
