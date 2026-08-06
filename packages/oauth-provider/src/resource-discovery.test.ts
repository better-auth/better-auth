import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import { registerClientMetadataDocument } from "./register";
import {
	invalidateResourceCache,
	resetSeedStateForTests,
	seedResourcesOnce,
} from "./resources";
import type {
	OAuthClientResource,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "./types";
import { getClient } from "./utils";

beforeEach(() => {
	vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	vi.spyOn(logger, "info").mockImplementation(() => undefined);
});
afterEach(() => {
	vi.restoreAllMocks();
	invalidateResourceCache();
});

const boot = async (
	options: Partial<OAuthOptions<Scope[]>> = {},
	useTransactionalMemory = false,
) => {
	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		...options,
	} as OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		...(useTransactionalMemory ? { database: undefined } : {}),
		plugins: [jwt(), oauthProvider(opts)],
	});
	resetSeedStateForTests();
	const ctx = await instance.auth.$context;
	await seedResourcesOnce(ctx as unknown as AuthContext, opts);
	return { ...instance, ctx, opts };
};

describe("DCR — resources field (RFC 7591 §2 extension)", () => {
	it("unions registration defaults with explicit resources and dedupes the final links", async () => {
		const defaultResource = "https://api.example.com/default";
		const requestedResource = "https://api.example.com/requested";
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: [defaultResource, requestedResource],
			clientRegistrationDefaultResources: [defaultResource, defaultResource],
			clientRegistrationAllowedResources: [requestedResource],
		});

		const result = (await instance.auth.api.registerOAuthClient({
			body: {
				redirect_uris: ["https://app.example.com/callback"],
				resources: [requestedResource, defaultResource, requestedResource],
			},
		})) as { client_id: string; resources?: string[] };

		expect(result.resources).toEqual([defaultResource, requestedResource]);
		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: result.client_id }],
		});
		expect(links.map((link) => link.resourceId).sort()).toEqual(
			[defaultResource, requestedResource].sort(),
		);
	});

	it("rejects explicit resources outside the effective registration allowlist", async () => {
		const defaultResource = "https://api.example.com/default-only";
		const disallowedResource =
			"https://api.example.com/configured-but-disallowed";
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: [defaultResource, disallowedResource],
			clientRegistrationDefaultResources: [defaultResource],
		});

		await expect(
			instance.auth.api.registerOAuthClient({
				body: {
					redirect_uris: ["https://app.example.com/callback"],
					resources: [disallowedResource],
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects registration resource policies that name unconfigured resources", () => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: ["https://api.example.com/configured"],
				clientRegistrationAllowedResources: [
					"https://api.example.com/not-configured",
				],
			}),
		).toThrow(/not-configured.*not found in resources/);
	});

	it("registers a client with valid resources and creates link rows", async () => {
		const resource = "https://api.example.com/dcr-link";
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: [resource],
			clientRegistrationAllowedResources: [resource],
		});

		const result = (await instance.auth.api.registerOAuthClient({
			body: {
				redirect_uris: ["https://app.example.com/callback"],
				resources: [resource],
			},
		})) as { client_id: string; resources?: string[] };

		expect(result.client_id).toBeDefined();
		expect(result.resources).toEqual([resource]);

		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: result.client_id }],
		});
		expect(links?.length).toBe(1);
		expect(links?.[0]?.resourceId).toBe(resource);

		const storedClient = await instance.ctx.adapter.findOne<{
			metadata?: string | Record<string, unknown> | null;
		}>({
			model: "oauthClient",
			where: [{ field: "clientId", value: result.client_id }],
		});
		const metadata =
			typeof storedClient?.metadata === "string"
				? JSON.parse(storedClient.metadata)
				: storedClient?.metadata;
		expect(metadata ?? {}).not.toHaveProperty("resources");
	});

	it("rejects an explicit resource when no registration resources are allowed", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: ["https://api.example.com/exists"],
		});
		await expect(
			instance.auth.api.registerOAuthClient({
				body: {
					redirect_uris: ["https://app.example.com/callback"],
					resources: ["https://api.example.com/exists"],
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects registration when one requested resource is disabled", async () => {
		const resource = "https://api.example.com/disabled-test";
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: [resource],
			clientRegistrationAllowedResources: [resource],
		});
		await instance.ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: resource }],
			update: { disabled: true },
		});
		await expect(
			instance.auth.api.registerOAuthClient({
				body: {
					redirect_uris: ["https://app.example.com/callback"],
					resources: [resource],
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("registration without resources still works (no behavior change)", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
		});
		const result = (await instance.auth.api.registerOAuthClient({
			body: {
				redirect_uris: ["https://app.example.com/callback"],
			},
		})) as { client_id: string; resources?: string[] };
		expect(result.client_id).toBeDefined();
		expect(result.resources).toBeUndefined();
	});
});

describe("managed client registration resources", () => {
	it("links server-owned defaults during managed client creation", async () => {
		const defaultResource = "https://api.example.com/managed-default";
		const instance = await boot(
			{
				resources: [defaultResource],
				clientRegistrationDefaultResources: [defaultResource],
			},
			true,
		);
		const { headers } = await instance.signInWithTestUser();

		const result = (await instance.auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://app.example.com/callback"],
			},
		})) as { client_id: string; resources?: string[] };

		expect(result.resources).toEqual([defaultResource]);
		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: result.client_id }],
		});
		expect(links).toEqual([
			expect.objectContaining({
				clientId: result.client_id,
				resourceId: defaultResource,
			}),
		]);
	});

	it("rolls back the client when a resource link cannot be inserted", async () => {
		const clientName = "transaction-rollback-client";
		const defaultResource = "https://api.example.com/rollback-default";
		const instance = await boot(
			{
				resources: [defaultResource],
				clientRegistrationDefaultResources: [defaultResource],
			},
			true,
		);
		const { headers } = await instance.signInWithTestUser();
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) =>
				originalTransaction(async (transactionAdapter) => {
					const originalCreate =
						transactionAdapter.create.bind(transactionAdapter);
					vi.spyOn(transactionAdapter, "create").mockImplementation(
						async (data) => {
							if (data.model === "oauthClientResource") {
								throw new Error("forced resource-link insertion failure");
							}
							return originalCreate(data);
						},
					);
					return callback(transactionAdapter);
				}),
		);

		await expect(
			instance.auth.api.adminCreateOAuthClient({
				headers,
				body: {
					client_name: clientName,
					redirect_uris: ["https://app.example.com/callback"],
				},
			}),
		).rejects.toThrow("forced resource-link insertion failure");

		const storedClient = await instance.ctx.adapter.findOne({
			model: "oauthClient",
			where: [{ field: "name", value: clientName }],
		});
		expect(storedClient).toBeNull();
	});
});

describe("trusted client cache provenance", () => {
	it("does not cache a discovery-owned client when its ID is trusted", async () => {
		const clientId = "https://client.example.com/trusted-discovery.json";
		const discovery = {
			id: "trusted-test-discovery",
			matches: (candidateClientId: string) => candidateClientId === clientId,
			resolve: (
				_ctx: GenericEndpointContext,
				_candidateClientId: string,
				existingClient: SchemaClient<Scope[]> | null,
			) => existingClient,
		};
		const instance = await boot({
			cachedTrustedClients: new Set([clientId]),
			extensions: [{ clientDiscovery: discovery }],
		});
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		await registerClientMetadataDocument(endpointContext, instance.opts, {
			clientId,
			clientDiscoveryId: discovery.id,
			metadata: {
				client_id: clientId,
				client_name: "Trusted Discovery Client",
				redirect_uris: ["https://client.example.com/callback"],
				token_endpoint_auth_method: "none",
			},
		});

		await expect(
			getClient(endpointContext, instance.opts, clientId),
		).resolves.toMatchObject({ clientDiscoveryId: discovery.id });
		instance.opts.extensions = [];

		await expect(
			getClient(endpointContext, instance.opts, clientId),
		).resolves.toBeNull();
	});

	it("isolates trusted client cache entries between provider options", async () => {
		const clientId = "https://client.example.com/provider-isolation.json";
		const discovery = {
			id: "provider-one-discovery",
			matches: (candidateClientId: string) => candidateClientId === clientId,
			resolve: (
				_ctx: GenericEndpointContext,
				_candidateClientId: string,
				existingClient: SchemaClient<Scope[]> | null,
			) => existingClient,
		};
		const providerOne = await boot({
			cachedTrustedClients: new Set([clientId]),
			extensions: [{ clientDiscovery: discovery }],
		});
		const providerOneContext = {
			context: providerOne.ctx,
		} as unknown as GenericEndpointContext;
		await registerClientMetadataDocument(providerOneContext, providerOne.opts, {
			clientId,
			clientDiscoveryId: discovery.id,
			metadata: {
				client_id: clientId,
				client_name: "Provider One Client",
				redirect_uris: ["https://one.example.com/callback"],
				token_endpoint_auth_method: "none",
			},
		});
		await expect(
			getClient(providerOneContext, providerOne.opts, clientId),
		).resolves.toMatchObject({ name: "Provider One Client" });

		const providerTwo = await boot({
			cachedTrustedClients: new Set([clientId]),
		});
		await providerTwo.ctx.adapter.create<SchemaClient<Scope[]>>({
			model: "oauthClient",
			data: {
				clientId,
				clientDiscoveryId: null,
				name: "Provider Two Client",
				redirectUris: ["https://two.example.com/callback"],
				tokenEndpointAuthMethod: "none",
				applicationType: "web",
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await expect(
			getClient(
				{
					context: providerTwo.ctx,
				} as unknown as GenericEndpointContext,
				providerTwo.opts,
				clientId,
			),
		).resolves.toMatchObject({ name: "Provider Two Client" });
	});
});

describe("canonical client metadata document registration", () => {
	it("fails closed when the persisted client discovery is not installed", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/orphaned-discovery.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;

		await registerClientMetadataDocument(endpointContext, instance.opts, {
			clientId,
			clientDiscoveryId: "removed-client-discovery",
			metadata: {
				client_id: clientId,
				redirect_uris: ["https://client.example.com/callback"],
				token_endpoint_auth_method: "none",
			},
		});

		await expect(
			getClient(endpointContext, instance.opts, clientId),
		).resolves.toBeNull();
	});

	it("preserves omitted application type as null while validating a loopback redirect", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/metadata.json";

		const result = await registerClientMetadataDocument(
			{ context: instance.ctx } as unknown as GenericEndpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					redirect_uris: ["http://127.0.0.1:5198/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);

		expect(result.client.applicationType).toBeNull();
		expect(result.client.clientDiscoveryId).toBe("test-client-discovery");
		const storedClient = await instance.ctx.adapter.findOne({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
		expect(storedClient).toMatchObject({
			applicationType: null,
			clientDiscoveryId: "test-client-discovery",
		});
	});

	it("persists through the configured oauthClient model", async () => {
		const model = "customCimdOAuthClient";
		const instance = await boot({
			schema: { oauthClient: { modelName: model } },
		});
		const createdModels: string[] = [];
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) =>
				originalTransaction(async (transactionAdapter) => {
					const originalCreate =
						transactionAdapter.create.bind(transactionAdapter);
					vi.spyOn(transactionAdapter, "create").mockImplementation(
						async (data) => {
							createdModels.push(data.model);
							return originalCreate(data);
						},
					);
					return callback(transactionAdapter);
				}),
		);
		const clientId = "https://client.example.com/custom-metadata.json";

		await registerClientMetadataDocument(
			{ context: instance.ctx } as unknown as GenericEndpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					redirect_uris: ["https://app.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);

		const storedClient = await instance.ctx.adapter.findOne({
			model,
			where: [{ field: "clientId", value: clientId }],
		});
		expect(storedClient).toMatchObject({ clientId });
		expect(createdModels).toContain(model);
	});

	it("atomically refreshes custom client and resource models without duplicating links", async () => {
		const clientModel = "customCimdOAuthClient";
		const clientResourceModel = "customCimdOAuthClientResource";
		const resource = "https://api.example.com/cimd";
		const instance = await boot({
			resources: [resource],
			clientRegistrationDefaultResources: [resource],
			schema: {
				oauthClient: { modelName: clientModel },
				oauthClientResource: { modelName: clientResourceModel },
			},
		});
		const clientId = "https://client.example.com/refresh.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		const created = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					client_name: "Before Refresh",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);
		await instance.ctx.adapter.update({
			model: clientModel,
			where: [{ field: "clientId", value: clientId }],
			update: {
				disabled: true,
				skipConsent: true,
				enableEndSession: true,
			},
		});
		const operatorClient = await instance.ctx.adapter.findOne({
			model: clientModel,
			where: [{ field: "clientId", value: clientId }],
		});
		if (!operatorClient) throw new Error("created client was not persisted");

		const refreshed = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				existingClient: {
					...created.client,
					...operatorClient,
				},
				metadata: {
					client_id: clientId,
					client_name: "After Refresh",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);

		expect(refreshed.created).toBe(false);
		expect(refreshed.client).toMatchObject({
			name: "After Refresh",
			disabled: true,
			skipConsent: true,
			enableEndSession: true,
		});
		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: clientResourceModel,
			where: [{ field: "clientId", value: clientId }],
		});
		expect(links.map((link) => link.resourceId)).toEqual([resource]);
	});

	it("converges a stale fixed-ID creator after a unique-constraint race", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/concurrent.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		await registerClientMetadataDocument(endpointContext, instance.opts, {
			clientId,
			clientDiscoveryId: "test-client-discovery",
			metadata: {
				client_id: clientId,
				client_name: "First Writer",
				redirect_uris: ["https://client.example.com/callback"],
				token_endpoint_auth_method: "none",
			},
		});

		const converged = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					client_name: "Concurrent Writer",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);
		expect(converged.created).toBe(false);
		expect(converged.client.name).toBe("Concurrent Writer");
	});

	it("does not take over a managed client after a fixed-ID registration race", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/managed-race.json";
		await instance.ctx.adapter.create({
			model: "oauthClient",
			data: {
				clientId,
				clientDiscoveryId: null,
				name: "Managed Client",
				redirectUris: ["https://managed.example.com/callback"],
				tokenEndpointAuthMethod: "none",
				applicationType: "web",
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const collisionCause = Object.assign(
			new Error("unique constraint on managed client"),
			{ code: "23505" },
		);
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) =>
				originalTransaction(async (transactionAdapter) => {
					const originalCreate =
						transactionAdapter.create.bind(transactionAdapter);
					vi.spyOn(transactionAdapter, "create").mockImplementation(
						async (input) => {
							if (input.model === "oauthClient") throw collisionCause;
							return originalCreate(input);
						},
					);
					return callback(transactionAdapter);
				}),
		);

		await expect(
			registerClientMetadataDocument(
				{
					context: instance.ctx,
				} as unknown as GenericEndpointContext,
				instance.opts,
				{
					clientId,
					clientDiscoveryId: "test-client-discovery",
					metadata: {
						client_id: clientId,
						client_name: "Discovered Client",
						redirect_uris: ["https://discovered.example.com/callback"],
						token_endpoint_auth_method: "none",
					},
				},
			),
		).rejects.toBe(collisionCause);

		expect(
			await instance.ctx.adapter.findOne({
				model: "oauthClient",
				where: [{ field: "clientId", value: clientId }],
			}),
		).toMatchObject({
			clientDiscoveryId: null,
			name: "Managed Client",
			redirectUris: ["https://managed.example.com/callback"],
		});
	});

	it("rejects a managed client supplied to the discovery refresh seam", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/managed-refresh.json";
		const managedClient = await instance.ctx.adapter.create<
			SchemaClient<Scope[]>
		>({
			model: "oauthClient",
			data: {
				clientId,
				clientDiscoveryId: null,
				name: "Managed Client",
				redirectUris: ["https://managed.example.com/callback"],
				tokenEndpointAuthMethod: "none",
				applicationType: "web",
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await expect(
			registerClientMetadataDocument(
				{
					context: instance.ctx,
				} as unknown as GenericEndpointContext,
				instance.opts,
				{
					clientId,
					clientDiscoveryId: "test-client-discovery",
					existingClient: managedClient,
					metadata: {
						client_id: clientId,
						client_name: "Discovered Client",
						redirect_uris: ["https://discovered.example.com/callback"],
						token_endpoint_auth_method: "none",
					},
				},
			),
		).rejects.toThrow();
	});

	it("does not overwrite a managed replacement from a stale discovery refresh", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/stale-refresh.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		const discoveredClient = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					client_name: "Discovered Client",
					redirect_uris: ["https://discovered.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);
		await instance.ctx.adapter.delete({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
		await instance.ctx.adapter.create<SchemaClient<Scope[]>>({
			model: "oauthClient",
			data: {
				clientId,
				clientDiscoveryId: null,
				name: "Managed Replacement",
				redirectUris: ["https://managed.example.com/callback"],
				tokenEndpointAuthMethod: "none",
				applicationType: "web",
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await expect(
			registerClientMetadataDocument(endpointContext, instance.opts, {
				clientId,
				clientDiscoveryId: "test-client-discovery",
				existingClient: discoveredClient.client,
				metadata: {
					client_id: clientId,
					client_name: "Stale Refresh",
					redirect_uris: ["https://stale.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			}),
		).rejects.toMatchObject({
			body: {
				error_description: "client no longer exists",
			},
		});

		expect(
			await instance.ctx.adapter.findOne({
				model: "oauthClient",
				where: [{ field: "clientId", value: clientId }],
			}),
		).toMatchObject({
			clientDiscoveryId: null,
			name: "Managed Replacement",
			redirectUris: ["https://managed.example.com/callback"],
		});
	});

	it("converges a metadata refresh only after the exact raced link is committed", async () => {
		const resource = "https://api.example.com/concurrent-link";
		const instance = await boot({ resources: [resource] }, true);
		const clientId = "https://client.example.com/concurrent-link.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		const created = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					client_name: "Before Link Race",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);
		instance.opts.clientRegistrationDefaultResources = [resource];

		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		let transactionAttempts = 0;
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) => {
				transactionAttempts += 1;
				if (transactionAttempts > 1) return originalTransaction(callback);
				try {
					return await originalTransaction(async (transactionAdapter) => {
						const originalCreate =
							transactionAdapter.create.bind(transactionAdapter);
						vi.spyOn(transactionAdapter, "create").mockImplementation(
							async (input) => {
								if (input.model === "oauthClientResource") {
									throw Object.assign(
										new Error("unique constraint on client resource"),
										{ code: "23505" },
									);
								}
								return originalCreate(input);
							},
						);
						return callback(transactionAdapter);
					});
				} catch (error) {
					await instance.ctx.adapter.create({
						model: "oauthClientResource",
						data: {
							clientId,
							resourceId: resource,
							createdAt: new Date(),
						},
					});
					throw error;
				}
			},
		);

		const refreshed = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				existingClient: created.client,
				metadata: {
					client_id: clientId,
					client_name: "After Link Race",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);

		expect(transactionAttempts).toBe(2);
		expect(refreshed.created).toBe(false);
		expect(refreshed.client.name).toBe("After Link Race");
		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: clientId }],
		});
		expect(links.map((link) => link.resourceId)).toEqual([resource]);
	});

	it("rethrows an unproven link-row unique cause without retrying", async () => {
		const resource = "https://api.example.com/unproven-link";
		const instance = await boot({ resources: [resource] }, true);
		const clientId = "https://client.example.com/unproven-link.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		const created = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					client_name: "Before Unproven Link",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);
		instance.opts.clientRegistrationDefaultResources = [resource];

		const uniqueCause = Object.assign(
			new Error("unique constraint without committed link"),
			{ code: "23505" },
		);
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		let transactionAttempts = 0;
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) => {
				transactionAttempts += 1;
				return originalTransaction(async (transactionAdapter) => {
					const originalCreate =
						transactionAdapter.create.bind(transactionAdapter);
					vi.spyOn(transactionAdapter, "create").mockImplementation(
						async (input) => {
							if (input.model === "oauthClientResource") {
								throw uniqueCause;
							}
							return originalCreate(input);
						},
					);
					return callback(transactionAdapter);
				});
			},
		);

		await expect(
			registerClientMetadataDocument(endpointContext, instance.opts, {
				clientId,
				clientDiscoveryId: "test-client-discovery",
				existingClient: created.client,
				metadata: {
					client_id: clientId,
					client_name: "After Unproven Link",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			}),
		).rejects.toBe(uniqueCause);
		expect(transactionAttempts).toBe(1);
		expect(
			await instance.ctx.adapter.findOne({
				model: "oauthClientResource",
				where: [
					{ field: "clientId", value: clientId },
					{ field: "resourceId", value: resource },
				],
			}),
		).toBeNull();
	});

	it("preserves an unrelated unique error thrown by client update", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/update-unique.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		const created = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					client_name: "Before Update Failure",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);
		const uniqueCause = Object.assign(
			new Error("unique constraint from unrelated update field"),
			{ code: "23505" },
		);
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		let transactionAttempts = 0;
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) => {
				transactionAttempts += 1;
				return originalTransaction(async (transactionAdapter) => {
					vi.spyOn(transactionAdapter, "update").mockRejectedValueOnce(
						uniqueCause,
					);
					return callback(transactionAdapter);
				});
			},
		);

		await expect(
			registerClientMetadataDocument(endpointContext, instance.opts, {
				clientId,
				clientDiscoveryId: "test-client-discovery",
				existingClient: created.client,
				metadata: {
					client_id: clientId,
					client_name: "After Update Failure",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			}),
		).rejects.toBe(uniqueCause);
		expect(transactionAttempts).toBe(1);
	});

	it("preserves an unrelated unique error thrown by the transaction", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/transaction-unique.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		const metadata = {
			client_id: clientId,
			client_name: "Transaction Failure",
			redirect_uris: ["https://client.example.com/callback"],
			token_endpoint_auth_method: "none" as const,
		};
		await registerClientMetadataDocument(endpointContext, instance.opts, {
			clientId,
			clientDiscoveryId: "test-client-discovery",
			metadata,
		});
		const uniqueCause = {
			kind: "oauth-client-row-unique",
			cause: new Error("coincidental nested cause"),
			code: "23505",
			message: "unique constraint from transaction",
		};
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		let transactionAttempts = 0;
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) => {
				transactionAttempts += 1;
				if (transactionAttempts === 1) throw uniqueCause;
				return originalTransaction(callback);
			},
		);

		await expect(
			registerClientMetadataDocument(endpointContext, instance.opts, {
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata,
			}),
		).rejects.toBe(uniqueCause);
		expect(transactionAttempts).toBe(1);
	});

	it("does not mask a non-unique persistence failure when the fixed ID already exists", async () => {
		const instance = await boot();
		const clientId = "https://client.example.com/non-unique-failure.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		const metadata = {
			client_id: clientId,
			client_name: "Existing Client",
			redirect_uris: ["https://client.example.com/callback"],
			token_endpoint_auth_method: "none" as const,
		};
		await registerClientMetadataDocument(endpointContext, instance.opts, {
			clientId,
			clientDiscoveryId: "test-client-discovery",
			metadata,
		});
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) =>
				originalTransaction(async (transactionAdapter) => {
					vi.spyOn(transactionAdapter, "create").mockRejectedValueOnce(
						new Error("storage unavailable"),
					);
					return callback(transactionAdapter);
				}),
		);

		await expect(
			registerClientMetadataDocument(endpointContext, instance.opts, {
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata,
			}),
		).rejects.toThrow("storage unavailable");
	});

	it("rolls back a metadata replacement when a new default resource link fails", async () => {
		const originalResource = "https://api.example.com/original";
		const addedResource = "https://api.example.com/added";
		const instance = await boot(
			{
				resources: [originalResource, addedResource],
				clientRegistrationDefaultResources: [originalResource],
			},
			true,
		);
		const clientId = "https://client.example.com/atomic-refresh.json";
		const endpointContext = {
			context: instance.ctx,
		} as unknown as GenericEndpointContext;
		const created = await registerClientMetadataDocument(
			endpointContext,
			instance.opts,
			{
				clientId,
				clientDiscoveryId: "test-client-discovery",
				metadata: {
					client_id: clientId,
					client_name: "Before Atomic Refresh",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			},
		);
		instance.opts.clientRegistrationDefaultResources = [
			originalResource,
			addedResource,
		];
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) =>
				originalTransaction(async (transactionAdapter) => {
					const originalCreate =
						transactionAdapter.create.bind(transactionAdapter);
					vi.spyOn(transactionAdapter, "create").mockImplementation(
						async (input) => {
							if (
								input.model === "oauthClientResource" &&
								input.data.resourceId === addedResource
							) {
								throw new Error("forced refresh-link failure");
							}
							return originalCreate(input);
						},
					);
					return callback(transactionAdapter);
				}),
		);

		await expect(
			registerClientMetadataDocument(endpointContext, instance.opts, {
				clientId,
				clientDiscoveryId: "test-client-discovery",
				existingClient: created.client,
				metadata: {
					client_id: clientId,
					client_name: "After Atomic Refresh",
					redirect_uris: ["https://client.example.com/callback"],
					token_endpoint_auth_method: "none",
				},
			}),
		).rejects.toThrow("forced refresh-link failure");

		expect(
			await instance.ctx.adapter.findOne({
				model: "oauthClient",
				where: [{ field: "clientId", value: clientId }],
			}),
		).toMatchObject({ name: "Before Atomic Refresh" });
		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: clientId }],
		});
		expect(links.map((link) => link.resourceId)).toEqual([originalResource]);
	});
});

describe("canonical dynamic client registration", () => {
	it("persists through the configured oauthClient model", async () => {
		const model = "customDcrOAuthClient";
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			schema: { oauthClient: { modelName: model } },
		});
		const createdModels: string[] = [];
		const originalTransaction = instance.ctx.adapter.transaction.bind(
			instance.ctx.adapter,
		);
		vi.spyOn(instance.ctx.adapter, "transaction").mockImplementation(
			async (callback) =>
				originalTransaction(async (transactionAdapter) => {
					const originalCreate =
						transactionAdapter.create.bind(transactionAdapter);
					vi.spyOn(transactionAdapter, "create").mockImplementation(
						async (data) => {
							createdModels.push(data.model);
							return originalCreate(data);
						},
					);
					return callback(transactionAdapter);
				}),
		);

		const result = await instance.auth.api.registerOAuthClient({
			body: {
				redirect_uris: ["https://app.example.com/callback"],
			},
		});

		const storedClient = await instance.ctx.adapter.findOne({
			model,
			where: [{ field: "clientId", value: result.client_id }],
		});
		expect(storedClient).toMatchObject({ clientId: result.client_id });
		expect(createdModels).toContain(model);
	});
});
