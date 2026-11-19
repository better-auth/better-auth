import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "../oauth";
import type {
	ClientDiscovery,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "../types";

const clientDiscoveryId = "update-discovery";

type IsCrossOriginJwksUriAllowed = NonNullable<
	ClientDiscovery["isCrossOriginJwksUriAllowed"]
>;

describe("adminUpdateOAuthClient on a client with a jwks_uri", async () => {
	const isCrossOriginJwksUriAllowed = vi.fn<IsCrossOriginJwksUriAllowed>(
		() => false,
	);
	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		scopes: ["openid", "read"],
		clientPrivileges: () => true,
		extensions: [
			{
				clientDiscovery: {
					id: clientDiscoveryId,
					matches: (clientId: string) =>
						clientId.startsWith("https://client.example/"),
					resolve: (_ctx, _clientId, existing) => existing,
					fetchClientMetadataResource: () =>
						Promise.reject(new Error("unused")),
					isCrossOriginJwksUriAllowed,
				},
			},
		],
	} satisfies OAuthOptions<Scope[]>;
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL: "http://localhost:3000",
		plugins: [jwt(), oauthProvider(opts)],
	});
	const context = await auth.$context;
	const { headers } = await signInWithTestUser();

	afterEach(() => {
		isCrossOriginJwksUriAllowed.mockReset();
		isCrossOriginJwksUriAllowed.mockImplementation(() => false);
	});

	/** Stores a client the way a discovery registers one, without an owner. */
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
				redirectUris: [],
				tokenEndpointAuthMethod: "private_key_jwt",
				grantTypes: ["client_credentials"],
				clientCredentialsScopes: [],
				jwksUri: input.jwksUri,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
	}

	function setClientCredentialsScopes(clientId: string) {
		return auth.api.adminUpdateOAuthClient({
			headers,
			body: {
				client_id: clientId,
				update: { client_credentials_scopes: ["read"] },
			},
		});
	}

	async function getStoredScopes(clientId: string) {
		const client = await context.adapter.findOne<SchemaClient<Scope[]>>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
		return client?.clientCredentialsScopes;
	}

	/**
	 * Registration accepts a discovered client's `jwks_uri` on its `client_id`
	 * origin (`checkOAuthClient` in `register.ts`), so the update must too.
	 */
	it("sets client_credentials_scopes on a discovered client whose jwks_uri shares the client_id origin", async () => {
		const clientId = "https://client.example/same-origin/client.json";
		await storeClient({
			clientId,
			jwksUri: "https://client.example/same-origin/jwks.json",
			clientDiscoveryId,
		});

		const updated = await setClientCredentialsScopes(clientId);

		expect(updated.client_credentials_scopes).toEqual(["read"]);
		expect(await getStoredScopes(clientId)).toEqual(["read"]);
		expect(isCrossOriginJwksUriAllowed).not.toHaveBeenCalled();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11916
	 */
	describe("cross-origin jwks_uri", () => {
		it("sets client_credentials_scopes when the discovery allows the jwks_uri origin", async () => {
			const clientId = "https://client.example/allowed/client.json";
			const jwksUri = "https://keys.example/allowed/jwks.json";
			await storeClient({ clientId, jwksUri, clientDiscoveryId });
			isCrossOriginJwksUriAllowed.mockImplementation(() => true);

			const updated = await setClientCredentialsScopes(clientId);

			expect(updated.client_credentials_scopes).toEqual(["read"]);
			expect(await getStoredScopes(clientId)).toEqual(["read"]);
			expect(isCrossOriginJwksUriAllowed).toHaveBeenCalledWith(
				{ clientId, jwksUri },
				expect.anything(),
			);
		});

		it("refuses the update with the existing error when the discovery no longer allows the jwks_uri origin", async () => {
			const clientId = "https://client.example/revoked/client.json";
			await storeClient({
				clientId,
				jwksUri: "https://keys.example/revoked/jwks.json",
				clientDiscoveryId,
			});

			const response = await auth.api.adminUpdateOAuthClient({
				headers,
				body: {
					client_id: clientId,
					update: { client_credentials_scopes: ["read"] },
				},
				asResponse: true,
			});

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				error: "invalid_client_metadata",
				error_description:
					"jwks_uri must belong to a trusted origin or the Client ID Metadata Document origin",
			});
			expect(isCrossOriginJwksUriAllowed).toHaveBeenCalled();
			expect(await getStoredScopes(clientId)).toEqual([]);
		});

		it("still refuses a managed client whose jwks_uri is on an untrusted origin", async () => {
			const clientId = "managed-untrusted-jwks-uri";
			await storeClient({
				clientId,
				jwksUri: "https://keys.example/managed/jwks.json",
			});
			isCrossOriginJwksUriAllowed.mockImplementation(() => true);

			const response = await auth.api.adminUpdateOAuthClient({
				headers,
				body: {
					client_id: clientId,
					update: { client_credentials_scopes: ["read"] },
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
			expect(await getStoredScopes(clientId)).toEqual([]);
		});
	});
});
