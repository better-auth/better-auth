import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import type {
	ClientDiscovery,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "./types";

const baseURL = "http://localhost:3000";
const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;
const clientDiscoveryId = "cross-origin-discovery";

type IsCrossOriginJwksUriAllowed = NonNullable<
	ClientDiscovery["isCrossOriginJwksUriAllowed"]
>;

/**
 * @see https://github.com/better-auth/better-auth/issues/11916
 */
describe("ClientDiscovery.isCrossOriginJwksUriAllowed", async () => {
	const keyPair = await generateKeyPair("ES256", { extractable: true });
	const jwks = {
		keys: [
			{
				...(await exportJWK(keyPair.publicKey)),
				kid: "key-1",
				alg: "ES256",
				use: "sig",
			},
		],
	};
	const fetchClientMetadataResource = vi.fn(async () => Response.json(jwks));
	const isCrossOriginJwksUriAllowed = vi.fn<IsCrossOriginJwksUriAllowed>(
		() => false,
	);
	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		scopes: ["openid", "read"],
		extensions: [
			{
				clientDiscovery: {
					id: clientDiscoveryId,
					matches: (clientId: string) =>
						clientId.startsWith("https://client.example/"),
					resolve: (_ctx, _clientId, existing) => existing,
					fetchClientMetadataResource,
					isCrossOriginJwksUriAllowed,
				},
			},
		],
	} satisfies OAuthOptions<Scope[]>;
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL,
		trustedOrigins: ["https://trusted-keys.example"],
		plugins: [jwt(), oauthProvider(opts)],
	});
	const context = await auth.$context;

	afterEach(() => {
		isCrossOriginJwksUriAllowed.mockReset();
		isCrossOriginJwksUriAllowed.mockImplementation(() => false);
		fetchClientMetadataResource.mockClear();
	});

	/** Stores a client as if a discovery had already registered it. */
	async function storeClient(input: {
		clientId: string;
		jwksUri: string;
		clientDiscoveryId?: string;
	}) {
		await context.adapter.create<SchemaClient<Scope[]>>({
			model: "oauthClient",
			data: {
				clientId: input.clientId,
				clientDiscoveryId: input.clientDiscoveryId,
				name: "Stored private_key_jwt client",
				redirectUris: [],
				tokenEndpointAuthMethod: "private_key_jwt",
				grantTypes: ["client_credentials"],
				clientCredentialsScopes: ["read"],
				jwksUri: input.jwksUri,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
	}

	async function requestToken(clientId: string) {
		const now = Math.floor(Date.now() / 1000);
		const assertion = await new SignJWT({})
			.setProtectedHeader({ alg: "ES256", kid: "key-1" })
			.setIssuer(clientId)
			.setSubject(clientId)
			.setAudience(tokenEndpoint)
			.setIssuedAt(now)
			.setExpirationTime(now + 60)
			.setJti(crypto.randomUUID())
			.sign(keyPair.privateKey);
		const response = await auth.handler(
			new Request(tokenEndpoint, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					scope: "read",
					client_id: clientId,
					client_assertion_type: CLIENT_ASSERTION_TYPE,
					client_assertion: assertion,
				}),
			}),
		);
		return {
			status: response.status,
			body: (await response.json()) as Record<string, unknown>,
		};
	}

	it("authenticates a stored discovery client whose cross-origin jwks_uri the discovery allows", async () => {
		const clientId = "https://client.example/allowed/client.json";
		const jwksUri = "https://keys.example/allowed/jwks.json";
		await storeClient({ clientId, jwksUri, clientDiscoveryId });
		isCrossOriginJwksUriAllowed.mockImplementation(() => true);

		const token = await requestToken(clientId);

		expect(token.status, JSON.stringify(token.body)).toBe(200);
		expect(token.body.access_token).toEqual(expect.any(String));
		expect(isCrossOriginJwksUriAllowed).toHaveBeenCalledWith(
			{ clientId, jwksUri },
			expect.objectContaining({ path: "/oauth2/token" }),
		);
		expect(fetchClientMetadataResource).toHaveBeenCalledWith(
			jwksUri,
			expect.any(Object),
		);
	});

	it.each([
		["returns false", () => false],
		[
			"throws",
			() => {
				throw new Error("policy unavailable");
			},
		],
		["rejects", () => Promise.reject(new Error("policy unavailable"))],
	] satisfies [string, IsCrossOriginJwksUriAllowed][])(
		"refuses the assertion with the existing error when the predicate %s",
		async (name, implementation) => {
			const slug = name.replaceAll(" ", "-");
			const clientId = `https://client.example/${slug}/client.json`;
			await storeClient({
				clientId,
				jwksUri: `https://keys.example/${slug}/jwks.json`,
				clientDiscoveryId,
			});
			isCrossOriginJwksUriAllowed.mockImplementation(implementation);

			const token = await requestToken(clientId);

			expect(token.status).toBe(400);
			expect(token.body).toEqual({
				error: "invalid_client",
				error_description: "client jwks_uri is not trusted",
			});
			expect(isCrossOriginJwksUriAllowed).toHaveBeenCalled();
			expect(fetchClientMetadataResource).not.toHaveBeenCalled();
		},
	);

	it("is not consulted for a jwks_uri on the client_id origin or a trusted origin", async () => {
		const sameOriginClientId = "https://client.example/same-origin/client.json";
		const trustedClientId = "https://client.example/trusted/client.json";
		await storeClient({
			clientId: sameOriginClientId,
			jwksUri: "https://client.example/same-origin/jwks.json",
			clientDiscoveryId,
		});
		await storeClient({
			clientId: trustedClientId,
			jwksUri: "https://trusted-keys.example/jwks.json",
			clientDiscoveryId,
		});

		expect((await requestToken(sameOriginClientId)).status).toBe(200);
		expect((await requestToken(trustedClientId)).status).toBe(200);
		expect(isCrossOriginJwksUriAllowed).not.toHaveBeenCalled();
	});

	it("still refuses a stored private-host jwks_uri when the predicate allows it", async () => {
		const clientId = "https://client.example/private-host/client.json";
		await storeClient({
			clientId,
			jwksUri: "https://169.254.169.254/jwks.json",
			clientDiscoveryId,
		});
		isCrossOriginJwksUriAllowed.mockImplementation(() => true);

		const token = await requestToken(clientId);

		expect(token.status).toBe(400);
		expect(token.body).toEqual({
			error: "invalid_client",
			error_description:
				"jwks_uri must not point to a private or reserved address",
		});
		expect(isCrossOriginJwksUriAllowed).not.toHaveBeenCalled();
		expect(fetchClientMetadataResource).not.toHaveBeenCalled();
	});

	describe("managed clients", () => {
		it("still require a trusted origin to register a cross-origin jwks_uri", async () => {
			isCrossOriginJwksUriAllowed.mockImplementation(() => true);
			const { headers } = await signInWithTestUser();

			const response = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: ["https://client.example/callback"],
					token_endpoint_auth_method: "private_key_jwt",
					jwks_uri: "https://keys.example/managed/jwks.json",
				},
				asResponse: true,
			});

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				error: "invalid_client_metadata",
				error_description:
					"jwks_uri must belong to a trusted origin or the Client ID Metadata Document origin",
			});
			expect(isCrossOriginJwksUriAllowed).not.toHaveBeenCalled();
		});

		it("still require a trusted origin to authenticate with a cross-origin jwks_uri", async () => {
			const clientId = "managed-cross-origin-client";
			await storeClient({
				clientId,
				jwksUri: "https://keys.example/managed/jwks.json",
			});
			isCrossOriginJwksUriAllowed.mockImplementation(() => true);

			const token = await requestToken(clientId);

			expect(token.status).toBe(400);
			expect(token.body).toEqual({
				error: "invalid_client",
				error_description: "client jwks_uri is not trusted",
			});
			expect(isCrossOriginJwksUriAllowed).not.toHaveBeenCalled();
		});
	});
});
