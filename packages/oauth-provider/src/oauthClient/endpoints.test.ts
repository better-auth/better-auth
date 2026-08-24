import { createAuthClient } from "better-auth/client";
import { makeSignature } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "../client";
import { oauthProvider } from "../oauth";
import type { OAuthClient } from "../types/oauth";

type TestOAuthClientUiMetadata = Pick<
	OAuthClient,
	| "client_name"
	| "client_uri"
	| "contacts"
	| "logo_uri"
	| "policy_uri"
	| "tos_uri"
>;

describe("oauthClient", async () => {
	const providerId = "test";
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "https://rp.example.com";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email", "offline_access", "m2m:read"],
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

	const testUiClientInput: TestOAuthClientUiMetadata = {
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

	it("round-trips application_type through user create and update with redirect revalidation", async () => {
		const created = await authClient.oauth2.createClient({
			application_type: "native",
			redirect_uris: ["com.example.desktop:/callback"],
			token_endpoint_auth_method: "client_secret_post",
		});
		expect(created.error).toBeNull();
		expect(created.data).toMatchObject({
			application_type: "native",
			token_endpoint_auth_method: "client_secret_post",
		});
		expect(created.data?.client_secret).toBeDefined();
		expect(created.data).not.toHaveProperty("public");
		expect(created.data).not.toHaveProperty("type");

		const invalidUpdate = await authClient.oauth2.updateClient({
			client_id: created.data!.client_id,
			update: { application_type: "web" },
		});
		expect(invalidUpdate.error?.status).toBe(400);

		const updated = await authClient.oauth2.updateClient({
			client_id: created.data!.client_id,
			update: {
				application_type: "web",
				redirect_uris: ["https://client.example.com/callback"],
			},
		});
		expect(updated.error).toBeNull();
		expect(updated.data?.application_type).toBe("web");
		await authClient.oauth2.deleteClient({
			client_id: created.data!.client_id,
		});
	});

	it("round-trips application_type through admin create and update", async () => {
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				application_type: "native",
				redirect_uris: ["com.example.admin:/callback"],
				token_endpoint_auth_method: "client_secret_basic",
			},
		});
		expect(created.application_type).toBe("native");
		expect(created.client_secret).toBeDefined();

		await expect(
			auth.api.adminUpdateOAuthClient({
				headers,
				body: {
					client_id: created.client_id,
					update: { application_type: "web" },
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_redirect_uri" }),
		});

		const updated = await auth.api.adminUpdateOAuthClient({
			headers,
			body: {
				client_id: created.client_id,
				update: {
					application_type: "web",
					redirect_uris: ["https://admin.example.com/callback"],
				},
			},
		});
		expect(updated.application_type).toBe("web");
		expect(updated).not.toHaveProperty("public");
		expect(updated).not.toHaveProperty("type");
		await authClient.oauth2.deleteClient({ client_id: created.client_id });
	});

	it("fails closed when no privilege callback can configure client_credentials scopes", async () => {
		await expect(
			auth.api.adminCreateOAuthClient({
				headers,
				body: {
					grant_types: ["client_credentials"],
					client_credentials_scopes: ["m2m:read"],
				},
			}),
		).rejects.toMatchObject({
			status: "UNAUTHORIZED",
		});
	});

	it("rejects client_credentials scope authority for public clients", async () => {
		await expect(
			auth.api.adminCreateOAuthClient({
				headers,
				body: {
					grant_types: ["client_credentials"],
					token_endpoint_auth_method: "none",
					client_credentials_scopes: ["m2m:read"],
				},
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
		});

		const publicClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["client_credentials"],
				token_endpoint_auth_method: "none",
			},
		});
		await expect(
			auth.api.adminUpdateOAuthClient({
				headers,
				body: {
					client_id: publicClient.client_id,
					update: {
						client_credentials_scopes: ["m2m:read"],
					},
				},
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
		});
		await authClient.oauth2.deleteClient({
			client_id: publicClient.client_id,
		});
	});

	it("does not let an administrative update mutate unowned client metadata", async () => {
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
			},
		});
		const context = await auth.$context;
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: created.client_id }],
			update: { userId: null, referenceId: null },
		});

		await expect(
			auth.api.adminUpdateOAuthClient({
				headers,
				body: {
					client_id: created.client_id,
					update: { client_name: "Cross-owner mutation" },
				},
			}),
		).rejects.toMatchObject({ status: "UNAUTHORIZED" });
		await context.adapter.delete({
			model: "oauthClient",
			where: [{ field: "clientId", value: created.client_id }],
		});
	});

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

	it("should not allow token endpoint authentication method updates", async () => {
		const client = await authClient.oauth2.updateClient({
			client_id: oauthClient.client_id,
			update: {
				// @ts-expect-error
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
		const newRedirectUri = `https://example.com/api/auth/callback/${providerId}`;
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
		let response: Response | undefined;
		const client = await authClient.oauth2.client.rotateSecret(
			{ client_id: oauthClient.client_id },
			{
				onResponse(context) {
					response = context.response;
				},
			},
		);
		const { client_secret, ...check } = client.data ?? {};
		const { client_secret: clientSecret, ...expected } = oauthClient;
		expect(client_secret).toBeDefined();
		expect(client_secret).not.toBe(clientSecret);
		expect(check).toMatchObject(expected);
		// The rotated secret must not be cached.
		expect(response?.headers.get("Cache-Control")).toBe("no-store");
		expect(response?.headers.get("Pragma")).toBe("no-cache");
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
	const redirectUri = "https://rp.example.com/callback";
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

	it("rejects a bare JWK array when a user creates a client", async () => {
		const result = await authClient.oauth2.createClient({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
			// @ts-expect-error RFC 7517 requires a JWK Set object.
			jwks: [{ ...publicJwk, kid: "bare-user-key", alg: "RS256", use: "sig" }],
		});

		expect(result.error?.status).toBe(400);
	});

	it("should create private_key_jwt clients with jwks and jwks_uri", async () => {
		const inlineJwks = {
			keys: [
				{ ...publicJwk, kid: "crud-inline-key", alg: "RS256", use: "sig" },
			],
		};
		const inlineClient = await authClient.oauth2.createClient({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
			jwks: inlineJwks,
		});
		expect(inlineClient.data?.client_id).toBeDefined();
		expect(inlineClient.data?.client_secret).toBeUndefined();
		expect(inlineClient.data?.token_endpoint_auth_method).toBe(
			"private_key_jwt",
		);
		expect(inlineClient.data?.jwks).toEqual(inlineJwks);
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
