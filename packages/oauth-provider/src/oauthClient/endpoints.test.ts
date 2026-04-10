import { createAuthClient } from "better-auth/client";
import { makeSignature } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "../client";
import { oauthProvider } from "../oauth";
import type { OAuthClient } from "../types/oauth";

describe("oauthClient", async () => {
	const providerId = "test";
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				allowPublicClientPrelogin: true,
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
		expect(client.data?.client_id_issued_at).toBeDefined();
		oauthClient = client.data!;

		const publicClient = await authClient.oauth2.createClient({
			token_endpoint_auth_method: "none",
			redirect_uris: [redirectUri],
		});
		expect(publicClient?.data?.client_id).toBeDefined();
		expect(publicClient?.data?.user_id).toBeDefined();
		expect(publicClient?.data?.client_secret).toBeUndefined();
		expect(publicClient.data?.client_id_issued_at).toBeDefined();
		oauthPublicClient = publicClient.data!;

		const uiClient = await authClient.oauth2.createClient({
			...testUiClientInput,
			redirect_uris: [redirectUri],
		});
		expect(uiClient?.data?.client_id).toBeDefined();
		expect(uiClient?.data?.user_id).toBeDefined();
		expect(uiClient?.data?.client_secret).toBeDefined();
		expect(uiClient.data?.client_id_issued_at).toBeDefined();
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

	it("should get public-only information about a client prelogin", async () => {
		// Creates mock valid search params
		const signedParams = new URLSearchParams({
			exp: `${Math.floor(Date.now() / 1000) + 60}`,
		});
		const sig = await makeSignature(
			signedParams.toString(),
			(auth.options as unknown as { secret: string }).secret,
		);
		signedParams.set("sig", sig);

		const client = await authClient.oauth2.publicClientPrelogin({
			client_id: oauthUiClient.client_id,
			oauth_query: signedParams.toString(),
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

describe("oauthClient private_key_jwt clients", async () => {
	const baseUrl = "http://localhost:3002";
	const redirectUri = "http://localhost:5002/callback";
	const trustedJwksUri = "https://trusted.example.com/.well-known/jwks.json";
	const { signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		trustedOrigins: [
			"https://trusted.example.com",
			"https://trusted-updated.example.com",
		],
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				allowPublicClientPrelogin: true,
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

	let publicJwk: JsonWebKey;
	let jwksClient: OAuthClient;
	let jwksUriClient: OAuthClient;

	beforeAll(async () => {
		const { publicKey } = await generateKeyPair("RS256", { extractable: true });
		publicJwk = await exportJWK(publicKey);
	});

	it("should create private_key_jwt clients with jwks and jwks_uri", async () => {
		const inlineClient = await authClient.oauth2.createClient({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
			jwks: [
				{ ...publicJwk, kid: "crud-inline-key", alg: "RS256", use: "sig" },
			],
		});
		expect(inlineClient.data?.client_id).toBeDefined();
		expect(inlineClient.data?.client_secret).toBeUndefined();
		expect(inlineClient.data?.token_endpoint_auth_method).toBe(
			"private_key_jwt",
		);
		expect(inlineClient.data?.jwks).toEqual([
			{ ...publicJwk, kid: "crud-inline-key", alg: "RS256", use: "sig" },
		]);
		jwksClient = inlineClient.data!;

		const remoteClient = await authClient.oauth2.createClient({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
			jwks_uri: trustedJwksUri,
		});
		expect(remoteClient.data?.client_id).toBeDefined();
		expect(remoteClient.data?.client_secret).toBeUndefined();
		expect(remoteClient.data?.token_endpoint_auth_method).toBe(
			"private_key_jwt",
		);
		expect(remoteClient.data?.jwks_uri).toBe(trustedJwksUri);
		jwksUriClient = remoteClient.data!;
	});

	it("should get private_key_jwt clients without leaking secrets", async () => {
		const inlineClient = await authClient.oauth2.getClient({
			query: { client_id: jwksClient.client_id },
		});
		expect(inlineClient.data?.client_secret).toBeUndefined();
		expect(inlineClient.data?.jwks).toEqual(jwksClient.jwks);

		const remoteClient = await authClient.oauth2.getClient({
			query: { client_id: jwksUriClient.client_id },
		});
		expect(remoteClient.data?.client_secret).toBeUndefined();
		expect(remoteClient.data?.jwks_uri).toBe(trustedJwksUri);
	});

	it("should include private_key_jwt clients in the client list", async () => {
		const clients = await authClient.oauth2.getClients();
		const byId = new Map(
			(clients.data ?? []).map((client) => [client.client_id, client]),
		);

		expect(byId.get(jwksClient.client_id)?.token_endpoint_auth_method).toBe(
			"private_key_jwt",
		);
		expect(byId.get(jwksClient.client_id)?.jwks).toEqual(jwksClient.jwks);
		expect(byId.get(jwksUriClient.client_id)?.jwks_uri).toBe(trustedJwksUri);
	});

	it("should preserve inline jwks metadata when updating a private_key_jwt client", async () => {
		const updated = await authClient.oauth2.updateClient({
			client_id: jwksClient.client_id,
			update: {
				client_name: "Updated inline client",
				redirect_uris: [redirectUri, "https://example.com/callback"],
			},
		});

		expect(updated.data?.client_name).toBe("Updated inline client");
		expect(updated.data?.jwks).toEqual(jwksClient.jwks);
		expect(updated.data?.redirect_uris).toEqual([
			redirectUri,
			"https://example.com/callback",
		]);
		jwksClient = updated.data!;
	});

	it("should preserve jwks_uri metadata when updating a private_key_jwt client", async () => {
		const updated = await authClient.oauth2.updateClient({
			client_id: jwksUriClient.client_id,
			update: {
				client_name: "Updated remote client",
				redirect_uris: [
					redirectUri,
					"https://trusted-updated.example.com/callback",
				],
			},
		});

		expect(updated.data?.client_name).toBe("Updated remote client");
		expect(updated.data?.jwks_uri).toBe(trustedJwksUri);
		expect(updated.data?.redirect_uris).toEqual([
			redirectUri,
			"https://trusted-updated.example.com/callback",
		]);
		jwksUriClient = updated.data!;
	});

	it("should reject client secret rotation for private_key_jwt clients", async () => {
		const result = await authClient.oauth2.client.rotateSecret({
			client_id: jwksClient.client_id,
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
		expect(result.error?.status).toBeLessThan(500);
	});
});
