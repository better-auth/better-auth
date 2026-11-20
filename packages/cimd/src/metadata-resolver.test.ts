import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { createCimdClientDiscovery, createCimdMetadataResolver } from "./index";
import type { CimdMetadataResolver, CimdOptions } from "./types";

let portSequence = 0;

const RICH_PROVIDER_OPTIONS = {
	pairwiseSecret: "a-test-pairwise-secret-of-length",
	pushedAuthorizationRequests: { enabled: true },
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function sampleMetadata(clientId: string, extra: Record<string, unknown> = {}) {
	return {
		client_id: clientId,
		client_name: "Test Client",
		redirect_uris: ["https://client.example/callback"],
		token_endpoint_auth_method: "none",
		grant_types: ["authorization_code"],
		response_types: ["code"],
		...extra,
	};
}

function documentResponse(body: unknown, cacheControl = "max-age=3600") {
	return Response.json(body, {
		headers: { "cache-control": cacheControl },
	});
}

/**
 * One request's endpoint context, backed by its own database, as a runtime that
 * builds its auth instance per request has.
 */
async function createRequestContext(
	providerOptions: Record<string, unknown> = {},
) {
	portSequence += 1;
	const instance = await getTestInstance({
		baseURL: `http://localhost:${3900 + portSequence}`,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid"],
				...providerOptions,
			}),
		],
	});
	const context = await instance.auth.$context;
	const ctx = { context } as unknown as GenericEndpointContext;
	const readClient = async (clientId: string) =>
		(await context.adapter.findOne({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		})) as SchemaClient<Scope[]> | null;
	return { ctx, readClient };
}

describe("CIMD metadata resolver", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/12358
	 */
	describe("createCimdMetadataResolver", () => {
		it("resolves a document and then answers from the cache", async () => {
			const clientId = "https://standalone.example/metadata.json";
			const fetchClientMetadataResource = vi.fn(async () =>
				documentResponse(sampleMetadata(clientId)),
			);
			const resolve = createCimdMetadataResolver({
				fetchClientMetadataResource,
			});
			const { ctx } = await createRequestContext();

			const fetched = await resolve(ctx, clientId);
			const cached = await resolve(ctx, clientId);

			expect(fetched).toMatchObject({
				metadata: { client_id: clientId, client_name: "Test Client" },
				fromCache: false,
			});
			expect(cached).toMatchObject({
				metadata: fetched?.metadata,
				fromCache: true,
			});
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		});

		it("returns null for a client_id that is not a metadata document URL", async () => {
			const fetchClientMetadataResource = vi.fn();
			const resolve = createCimdMetadataResolver({
				fetchClientMetadataResource,
			});
			const { ctx } = await createRequestContext();

			expect(await resolve(ctx, "plain-client")).toBeNull();
			expect(await resolve(ctx, "http://insecure.example/client")).toBeNull();
			expect(fetchClientMetadataResource).not.toHaveBeenCalled();
		});

		it("hands each caller its own copy of the document", async () => {
			const clientId = "https://copies.example/metadata.json";
			const barrier = deferred<Response>();
			const resolve = createCimdMetadataResolver({
				fetchClientMetadataResource: () => barrier.promise,
			});
			const { ctx } = await createRequestContext();

			const first = resolve(ctx, clientId);
			const joined = resolve(ctx, clientId);
			barrier.resolve(documentResponse(sampleMetadata(clientId)));
			const [firstResolution, joinedResolution] = await Promise.all([
				first,
				joined,
			]);
			if (!firstResolution || !joinedResolution) throw new Error("no result");
			firstResolution.metadata.client_name = "Changed";
			firstResolution.metadata.redirect_uris = ["https://evil.example/cb"];

			expect(joinedResolution.metadata.client_name).toBe("Test Client");
			const cached = await resolve(ctx, clientId);
			expect(cached?.metadata.client_name).toBe("Test Client");
			expect(cached?.metadata.redirect_uris).toEqual([
				"https://client.example/callback",
			]);
		});

		it("runs the URL policy with each request's context before any fetch", async () => {
			const clientId = "https://policy.example/metadata.json";
			const fetchClientMetadataResource = vi.fn(async () =>
				documentResponse(sampleMetadata(clientId)),
			);
			const isMetadataDocumentUrlAllowed = vi.fn<
				NonNullable<CimdOptions["isMetadataDocumentUrlAllowed"]>
			>(async () => true);
			const resolve = createCimdMetadataResolver({
				fetchClientMetadataResource,
				isMetadataDocumentUrlAllowed,
			});
			const requestA = await createRequestContext();
			const requestB = await createRequestContext();

			await Promise.all([
				resolve(requestA.ctx, clientId),
				resolve(requestB.ctx, clientId),
			]);

			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
			expect(isMetadataDocumentUrlAllowed).toHaveBeenCalledWith(
				clientId,
				requestA.ctx,
			);
			expect(isMetadataDocumentUrlAllowed).toHaveBeenCalledWith(
				clientId,
				requestB.ctx,
			);
		});

		it("does not run the URL policy for a fresh cache hit", async () => {
			const clientId = "https://policy-hit.example/metadata.json";
			const isMetadataDocumentUrlAllowed = vi.fn<
				NonNullable<CimdOptions["isMetadataDocumentUrlAllowed"]>
			>(async () => true);
			const resolve = createCimdMetadataResolver({
				fetchClientMetadataResource: async () =>
					documentResponse(sampleMetadata(clientId)),
				isMetadataDocumentUrlAllowed,
			});
			const { ctx } = await createRequestContext();

			await resolve(ctx, clientId);
			await resolve(ctx, clientId);

			expect(isMetadataDocumentUrlAllowed).toHaveBeenCalledTimes(1);
		});
	});

	describe("discovery with a shared resolver", () => {
		const transport =
			vi.fn<NonNullable<CimdOptions["fetchClientMetadataResource"]>>();

		function discoveryFor(
			metadataResolver: CimdMetadataResolver,
			options: Pick<CimdOptions, "onClientCreated" | "onClientRefreshed"> = {},
		) {
			return createCimdClientDiscovery({ metadataResolver, ...options });
		}

		it("shares one fetch between per-request discoveries and saves in each request's database", async () => {
			const clientId = "https://shared.example/metadata.json";
			const barrier = deferred<Response>();
			const fetchClientMetadataResource = vi.fn(() => barrier.promise);
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource,
			});
			const requestA = await createRequestContext();
			const requestB = await createRequestContext();

			const resolvedA = discoveryFor(resolver).resolve(
				requestA.ctx,
				clientId,
				null,
			);
			const resolvedB = discoveryFor(resolver).resolve(
				requestB.ctx,
				clientId,
				null,
			);
			await vi.waitFor(() =>
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1),
			);
			barrier.resolve(documentResponse(sampleMetadata(clientId)));
			await Promise.all([resolvedA, resolvedB]);

			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
			expect((await requestA.readClient(clientId))?.clientId).toBe(clientId);
			expect((await requestB.readClient(clientId))?.clientId).toBe(clientId);
		});

		it("serves each adapter's own stored client during an outage", async () => {
			const clientId = "https://shared-outage.example/client.json";
			const transport = vi.fn(async () =>
				documentResponse(sampleMetadata(clientId), "no-cache"),
			);
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource: transport,
				metadataStaleIfError: "1h",
				metadataFetchPolicy: { minimumFetchInterval: 0 },
			});
			const first = await createRequestContext();
			const second = await createRequestContext();
			const a = discoveryFor(resolver);
			const b = discoveryFor(resolver);
			const storedA = await a.resolve(first.ctx, clientId, null);
			const storedB = await b.resolve(second.ctx, clientId, null);
			expect(storedA).not.toBe(storedB);
			transport.mockImplementation(
				async () => new Response(null, { status: 503 }),
			);
			expect(await a.resolve(first.ctx, clientId, storedA)).toBe(storedA);
			expect(await b.resolve(second.ctx, clientId, storedB)).toBe(storedB);
			expect(b.jwksStaleIfError).toBe(3600);
		});

		it("honors a terminal metadata response observed by the standalone resolver", async () => {
			const clientId = "https://shared-terminal.example/client.json";
			const transport = vi.fn(async () =>
				documentResponse(sampleMetadata(clientId), "no-cache"),
			);
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource: transport,
				metadataStaleIfError: "1h",
				metadataFetchPolicy: { minimumFetchInterval: 0 },
			});
			const request = await createRequestContext();
			const discovery = discoveryFor(resolver);
			const stored = await discovery.resolve(request.ctx, clientId, null);
			transport.mockImplementationOnce(
				async () => new Response(null, { status: 404 }),
			);
			await expect(resolver(request.ctx, clientId)).rejects.toMatchObject({
				body: { error: "invalid_client" },
			});
			transport.mockImplementation(
				async () => new Response(null, { status: 503 }),
			);
			await expect(
				discovery.resolve(request.ctx, clientId, stored),
			).rejects.toMatchObject({ body: { error: "invalid_client" } });
		});

		it("keeps a save rejection local to the adapter when another adapter saves the same document", async () => {
			const clientId = "https://shared-rejection.example/client.json";
			const transport = vi.fn(async () =>
				documentResponse(sampleMetadata(clientId), "no-cache"),
			);
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource: transport,
				metadataStaleIfError: "1h",
				metadataFetchPolicy: { minimumFetchInterval: 0 },
			});
			const healthy = await createRequestContext(RICH_PROVIDER_OPTIONS);
			const restricted = await createRequestContext();
			const healthyDiscovery = discoveryFor(resolver);
			const restrictedDiscovery = discoveryFor(resolver);
			const first = await healthyDiscovery.resolve(healthy.ctx, clientId, null);
			const second = await restrictedDiscovery.resolve(
				restricted.ctx,
				clientId,
				null,
			);
			const pending = deferred<Response>();
			transport.mockImplementationOnce(() => pending.promise);
			const accepted = healthyDiscovery.resolve(healthy.ctx, clientId, first);
			const rejected = expect(
				restrictedDiscovery.resolve(restricted.ctx, clientId, second),
			).rejects.toMatchObject({ body: { error: "invalid_client_metadata" } });
			pending.resolve(
				documentResponse(
					sampleMetadata(clientId, {
						require_pushed_authorization_requests: true,
					}),
					"no-cache",
				),
			);
			const updated = await accepted;
			await rejected;
			transport.mockImplementation(
				async () => new Response(null, { status: 503 }),
			);
			expect(
				await healthyDiscovery.resolve(healthy.ctx, clientId, updated),
			).toBe(updated);
			await expect(
				restrictedDiscovery.resolve(restricted.ctx, clientId, second),
			).rejects.toMatchObject({ body: { error: "invalid_client" } });
		});

		it("keeps the cached document when one request cannot save it", async () => {
			const clientId = "https://shared-failed-save.example/metadata.json";
			const fetchClientMetadataResource = vi.fn(async () =>
				documentResponse(sampleMetadata(clientId)),
			);
			const discovery = discoveryFor(
				createCimdMetadataResolver({ fetchClientMetadataResource }),
			);
			const broken = await createRequestContext({
				grantTypes: ["client_credentials"],
			});
			const healthy = await createRequestContext();

			await expect(
				discovery.resolve(broken.ctx, clientId, null),
			).rejects.toMatchObject({ body: { error: "invalid_client_metadata" } });
			const client = await discovery.resolve(healthy.ctx, clientId, null);

			expect(client?.clientId).toBe(clientId);
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		});

		it("applies the policy set on the resolver to a discovery that uses it", async () => {
			const clientId = "https://refused.example/metadata.json";
			const fetchClientMetadataResource = vi.fn();
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource,
				isMetadataDocumentUrlAllowed: () => false,
			});
			const request = await createRequestContext();

			await expect(
				discoveryFor(resolver).resolve(request.ctx, clientId, null),
			).rejects.toMatchObject({
				status: "BAD_REQUEST",
				body: {
					error: "invalid_client",
					error_description:
						"client_id URL is not permitted by the server's fetch policy",
				},
			});
			expect(fetchClientMetadataResource).not.toHaveBeenCalled();
		});

		it("applies the metadata profile set on the resolver", async () => {
			const clientId = "https://profile.example/metadata.json";
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource: async () =>
					documentResponse(
						sampleMetadata(clientId, { client_name: undefined }),
					),
				metadataProfile: "mcp-2026-07-28",
			});
			const request = await createRequestContext();

			await expect(
				discoveryFor(resolver).resolve(request.ctx, clientId, null),
			).rejects.toMatchObject({
				body: {
					error: "invalid_client",
					error_description: "client_name must be a non-empty string",
				},
			});
		});

		it("applies the origin-bound fields set on the resolver", async () => {
			const clientId = "https://bound.example/metadata.json";
			const document = sampleMetadata(clientId, {
				client_uri: "https://elsewhere.example/about",
			});
			const request = await createRequestContext();

			const bound = createCimdMetadataResolver({
				originBoundFields: ["client_uri"],
				fetchClientMetadataResource: async () => documentResponse(document),
			});
			await expect(
				discoveryFor(bound).resolve(request.ctx, clientId, null),
			).rejects.toMatchObject({ body: { error: "invalid_client" } });

			const unbound = createCimdMetadataResolver({
				fetchClientMetadataResource: async () => documentResponse(document),
				originBoundFields: [],
			});
			const client = await discoveryFor(unbound).resolve(
				request.ctx,
				clientId,
				null,
			);
			expect(client?.uri).toBe("https://elsewhere.example/about");
		});

		it.each([
			["fetchClientMetadataResource", transport],
			["isMetadataDocumentUrlAllowed", () => true],
			["maxCacheEntries", 10],
			["metadataFetchPolicy", { minimumFetchInterval: 0 }],
			["metadataProfile", "mcp-2026-07-28"],
			["metadataRevalidationInterval", "10m"],
			["metadataStaleIfError", "10m"],
			["originBoundFields", []],
		] as const)("rejects %s next to a shared resolver", (option, value) => {
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource: transport,
			});
			// TypeScript rejects this combination; JavaScript callers reach the check.
			const options = {
				metadataResolver: resolver,
				[option]: value,
			} as unknown as CimdOptions;

			expect(() => createCimdClientDiscovery(options)).toThrow(BetterAuthError);
			expect(() => createCimdClientDiscovery(options)).toThrow(option);
		});

		it("fetches discovery-owned resources with the shared resolver's transport", () => {
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource: transport,
			});

			const discovery = discoveryFor(resolver);

			expect(discovery.fetchClientMetadataResource).toBe(transport);
		});

		it("uses the key origin policy of the discovery handling the request", () => {
			const resolver = createCimdMetadataResolver({
				fetchClientMetadataResource: transport,
			});
			const isCrossOriginJwksUriAllowed = vi.fn(() => true);
			const discovery = createCimdClientDiscovery({
				metadataResolver: resolver,
				isCrossOriginJwksUriAllowed,
			});
			expect(discovery.isCrossOriginJwksUriAllowed).toBe(
				isCrossOriginJwksUriAllowed,
			);
			expect(
				discoveryFor(resolver).isCrossOriginJwksUriAllowed,
			).toBeUndefined();
		});

		it("rejects a shared resolver that carries no transport", () => {
			const resolver = (async () => null) as unknown as CimdMetadataResolver;

			expect(() =>
				createCimdClientDiscovery({ metadataResolver: resolver }),
			).toThrow("fetchClientMetadataResource");
		});

		/**
		 * A resolver shared with other discoveries can hold a document that was saved
		 * through another database, so a cache hit has to check this database's row.
		 */
		describe("reconciling a stored client with a cached document", () => {
			async function jwksFor(keyId: string) {
				const { publicKey } = (await crypto.subtle.generateKey(
					{ name: "ECDSA", namedCurve: "P-256" },
					true,
					["sign", "verify"],
				)) as CryptoKeyPair;
				const jwk = await crypto.subtle.exportKey("jwk", publicKey);
				return { keys: [{ ...jwk, kid: keyId, alg: "ES256", use: "sig" }] };
			}

			const fieldChanges: Array<
				[field: string, before: unknown, after: unknown, extra?: object]
			> = [
				["client_name", "Old Name", "New Name"],
				[
					"client_uri",
					"https://reconcile.example/a",
					"https://reconcile.example/b",
				],
				[
					"logo_uri",
					"https://reconcile.example/a.png",
					"https://reconcile.example/b.png",
				],
				[
					"tos_uri",
					"https://reconcile.example/a-tos",
					"https://reconcile.example/b-tos",
				],
				[
					"policy_uri",
					"https://reconcile.example/a-p",
					"https://reconcile.example/b-p",
				],
				["software_id", "app-a", "app-b"],
				["software_version", "1.0.0", "2.0.0"],
				["contacts", ["a@reconcile.example"], ["b@reconcile.example"]],
				[
					"redirect_uris",
					["https://client.example/callback"],
					["https://client.example/callback", "https://client.example/other"],
				],
				["application_type", "web", "native"],
				["dpop_bound_access_tokens", false, true],
				["dpop_bound_access_tokens", true, false],
				["dpop_bound_access_tokens", true, undefined],
				["dpop_bound_access_tokens", false, undefined],
				["require_pushed_authorization_requests", true, undefined],
				["require_pushed_authorization_requests", false, undefined],
				["require_pushed_authorization_requests", false, true],
				["subject_type", "public", "pairwise"],
				[
					"frontchannel_logout_uri",
					"https://client.example/logout-a",
					"https://client.example/logout-b",
				],
				["frontchannel_logout_session_required", false, true],
			];

			it.each(fieldChanges)(
				"refreshes the stored client when %s changed (%j to %j)",
				async (field, before, after) => {
					const clientId = `https://reconcile.example/${field}-${String(JSON.stringify(after)).length}.json`;
					const stale = await createRequestContext(RICH_PROVIDER_OPTIONS);
					const current = await createRequestContext(RICH_PROVIDER_OPTIONS);
					const documentFor = (value: unknown) =>
						sampleMetadata(clientId, { [field]: value });

					// The stale database saved the document as it was before.
					const beforeDiscovery = discoveryFor(
						createCimdMetadataResolver({
							fetchClientMetadataResource: async () =>
								documentResponse(documentFor(before)),
						}),
					);
					await beforeDiscovery.resolve(stale.ctx, clientId, null);
					const staleClient = await stale.readClient(clientId);

					// Another request through the shared resolver caches the new document.
					const resolver = createCimdMetadataResolver({
						fetchClientMetadataResource: async () =>
							documentResponse(documentFor(after)),
					});
					const discovery = discoveryFor(resolver);
					await discovery.resolve(current.ctx, clientId, null);

					const refreshed = await discovery.resolve(
						stale.ctx,
						clientId,
						staleClient,
					);
					expect(await stale.readClient(clientId)).toEqual(refreshed);
					expect(refreshed).not.toEqual(staleClient);
				},
			);

			it("preserves a stored pairwise subject type when the document omits it", async () => {
				const clientId = "https://reconcile.example/pairwise.json";
				const request = await createRequestContext(RICH_PROVIDER_OPTIONS);
				const first = discoveryFor(
					createCimdMetadataResolver({
						fetchClientMetadataResource: async () =>
							documentResponse(
								sampleMetadata(clientId, {
									subject_type: "pairwise",
									client_name: "Before",
								}),
							),
					}),
				);
				const stored = await first.resolve(request.ctx, clientId, null);
				const current = discoveryFor(
					createCimdMetadataResolver({
						fetchClientMetadataResource: async () =>
							documentResponse(
								sampleMetadata(clientId, { client_name: "After" }),
							),
					}),
				);
				const other = await createRequestContext(RICH_PROVIDER_OPTIONS);
				await current.resolve(other.ctx, clientId, null);
				const refreshed = await current.resolve(request.ctx, clientId, stored);
				expect(refreshed).toMatchObject({
					subjectType: "pairwise",
					name: "After",
				});
				expect(await current.resolve(request.ctx, clientId, refreshed)).toBe(
					refreshed,
				);
			});

			it("refreshes the stored client when the key set changed", async () => {
				const clientId = "https://reconcile.example/jwks.json";
				const stale = await createRequestContext();
				const current = await createRequestContext();
				const documentFor = (jwks: unknown) =>
					sampleMetadata(clientId, {
						token_endpoint_auth_method: "private_key_jwt",
						jwks,
					});
				const beforeJwks = await jwksFor("before");
				const afterJwks = await jwksFor("after");
				await discoveryFor(
					createCimdMetadataResolver({
						fetchClientMetadataResource: async () =>
							documentResponse(documentFor(beforeJwks)),
					}),
				).resolve(stale.ctx, clientId, null);
				const staleClient = await stale.readClient(clientId);

				const discovery = discoveryFor(
					createCimdMetadataResolver({
						fetchClientMetadataResource: async () =>
							documentResponse(documentFor(afterJwks)),
					}),
				);
				await discovery.resolve(current.ctx, clientId, null);
				await discovery.resolve(stale.ctx, clientId, staleClient);

				expect(
					JSON.parse((await stale.readClient(clientId))?.jwks ?? ""),
				).toEqual(afterJwks);
			});

			it("does not save again when the stored client already matches", async () => {
				const clientId = "https://reconcile.example/matching.json";
				const jwks = await jwksFor("matching");
				const document = sampleMetadata(clientId, {
					client_uri: "https://reconcile.example/about",
					logo_uri: "https://reconcile.example/logo.png",
					tos_uri: "https://reconcile.example/tos",
					policy_uri: "https://reconcile.example/policy",
					contacts: ["owner@reconcile.example"],
					software_id: "matching-app",
					software_version: "3.1.4",
					application_type: "web",
					dpop_bound_access_tokens: true,
					require_pushed_authorization_requests: true,
					token_endpoint_auth_method: "private_key_jwt",
					jwks,
					redirect_uris: [
						"https://client.example/callback",
						"https://client.example/second",
					],
				});
				const onClientRefreshed = vi.fn();
				const discovery = discoveryFor(
					createCimdMetadataResolver({
						fetchClientMetadataResource: async () => documentResponse(document),
					}),
					{ onClientRefreshed },
				);
				const request = await createRequestContext(RICH_PROVIDER_OPTIONS);

				await discovery.resolve(request.ctx, clientId, null);
				const stored = await request.readClient(clientId);
				const again = await discovery.resolve(request.ctx, clientId, stored);

				expect(again).toBe(stored);
				expect(onClientRefreshed).not.toHaveBeenCalled();
			});

			it("does not save again when the provider has no scopes", async () => {
				const clientId = "https://reconcile.example/no-scopes.json";
				const onClientRefreshed = vi.fn();
				const discovery = discoveryFor(
					createCimdMetadataResolver({
						fetchClientMetadataResource: async () =>
							documentResponse(
								sampleMetadata(clientId, {
									dpop_bound_access_tokens: false,
									require_pushed_authorization_requests: false,
								}),
							),
					}),
					{ onClientRefreshed },
				);
				const request = await createRequestContext({ scopes: [] });

				await discovery.resolve(request.ctx, clientId, null);
				const stored = await request.readClient(clientId);
				const again = await discovery.resolve(request.ctx, clientId, stored);

				expect(again).toBe(stored);
				expect(onClientRefreshed).not.toHaveBeenCalled();
			});

			it("clears omitted DPoP and PAR settings once for a minimal document", async () => {
				const clientId = "https://reconcile.example/minimal.json";
				const onClientRefreshed = vi.fn();
				const discovery = discoveryFor(
					createCimdMetadataResolver({
						fetchClientMetadataResource: async () =>
							documentResponse({
								client_id: clientId,
								redirect_uris: ["https://client.example/callback"],
							}),
					}),
					{ onClientRefreshed },
				);
				const request = await createRequestContext();

				await discovery.resolve(request.ctx, clientId, null);
				const stored = await request.readClient(clientId);
				const cleared = await discovery.resolve(request.ctx, clientId, stored);
				expect(cleared).toMatchObject({
					dpopBoundAccessTokens: null,
					requirePushedAuthorizationRequests: null,
				});
				const again = await discovery.resolve(request.ctx, clientId, cleared);

				expect(again).toBe(cleared);
				expect(onClientRefreshed).toHaveBeenCalledTimes(1);
			});

			describe("grant types and scopes", () => {
				/**
				 * A document that leaves the grants out registers the client with the
				 * default grant, so a stored client that kept a wider list from an
				 * older document is stale.
				 */
				it("refreshes the stored client when the document stops listing grant_types", async () => {
					const clientId = "https://reconcile.example/dropped-grants.json";
					const onClientRefreshed = vi.fn();
					const staleRequest = await createRequestContext();
					const currentRequest = await createRequestContext();

					await discoveryFor(
						createCimdMetadataResolver({
							fetchClientMetadataResource: async () =>
								documentResponse(
									sampleMetadata(clientId, {
										grant_types: ["authorization_code", "refresh_token"],
									}),
								),
						}),
					).resolve(staleRequest.ctx, clientId, null);
					const staleClient = await staleRequest.readClient(clientId);
					expect(staleClient?.grantTypes).toEqual([
						"authorization_code",
						"refresh_token",
					]);

					const discovery = discoveryFor(
						createCimdMetadataResolver({
							fetchClientMetadataResource: async () =>
								documentResponse(
									sampleMetadata(clientId, { grant_types: undefined }),
								),
						}),
						{ onClientRefreshed },
					);
					await discovery.resolve(currentRequest.ctx, clientId, null);
					await discovery.resolve(staleRequest.ctx, clientId, staleClient);

					expect((await staleRequest.readClient(clientId))?.grantTypes).toEqual(
						["authorization_code"],
					);
					expect(onClientRefreshed).toHaveBeenCalledTimes(1);
				});

				it("refreshes the stored client when the document lists more grant_types", async () => {
					const clientId = "https://reconcile.example/added-grants.json";
					const staleRequest = await createRequestContext();
					const currentRequest = await createRequestContext();

					await discoveryFor(
						createCimdMetadataResolver({
							fetchClientMetadataResource: async () =>
								documentResponse(sampleMetadata(clientId)),
						}),
					).resolve(staleRequest.ctx, clientId, null);
					const staleClient = await staleRequest.readClient(clientId);

					const discovery = discoveryFor(
						createCimdMetadataResolver({
							fetchClientMetadataResource: async () =>
								documentResponse(
									sampleMetadata(clientId, {
										grant_types: ["authorization_code", "refresh_token"],
									}),
								),
						}),
					);
					await discovery.resolve(currentRequest.ctx, clientId, null);
					await discovery.resolve(staleRequest.ctx, clientId, staleClient);

					expect((await staleRequest.readClient(clientId))?.grantTypes).toEqual(
						["authorization_code", "refresh_token"],
					);
				});

				it("does not save again when the document lists fewer scopes than the server registers", async () => {
					const clientId = "https://reconcile.example/narrow-scope.json";
					const onClientRefreshed = vi.fn();
					const discovery = discoveryFor(
						createCimdMetadataResolver({
							fetchClientMetadataResource: async () =>
								documentResponse(
									sampleMetadata(clientId, {
										scope: "openid",
										dpop_bound_access_tokens: false,
										require_pushed_authorization_requests: false,
									}),
								),
						}),
						{ onClientRefreshed },
					);
					const request = await createRequestContext({
						scopes: ["openid", "profile"],
					});

					await discovery.resolve(request.ctx, clientId, null);
					const stored = await request.readClient(clientId);
					const again = await discovery.resolve(request.ctx, clientId, stored);

					expect(again).toBe(stored);
					expect(onClientRefreshed).not.toHaveBeenCalled();
				});
			});
		});
	});
});
