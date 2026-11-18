import type { GenericEndpointContext } from "@better-auth/core";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCimdClientDiscovery } from "./index";
import type { CimdOptions } from "./types";

let instanceSequence = 0;

afterEach(() => {
	vi.restoreAllMocks();
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function metadataResponse(
	clientId: string,
	headers: Record<string, string> = { "cache-control": "max-age=60" },
	clientName = "Coalescing Client",
) {
	return Response.json(
		{
			client_id: clientId,
			client_name: clientName,
			redirect_uris: ["http://127.0.0.1:5199/callback"],
			application_type: "native",
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code"],
			response_types: ["code"],
		},
		{ headers },
	);
}

/** A cacheable document whose client name tells fetches apart. */
function namedMetadataResponse(clientId: string, clientName: string) {
	return metadataResponse(
		clientId,
		{ "cache-control": "max-age=60" },
		clientName,
	);
}

/**
 * One request-scoped runtime: its own database and its own endpoint context,
 * the way a runtime that builds the auth instance per request has them.
 */
async function createRequestContext() {
	instanceSequence += 1;
	const instance = await getTestInstance({
		baseURL: `http://localhost:${3400 + instanceSequence}`,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid"],
			}),
		],
	});
	const context = await instance.auth.$context;
	return {
		context,
		ctx: { context } as unknown as GenericEndpointContext,
		findClient: (clientId: string) =>
			context.adapter.findOne<SchemaClient<Scope[]>>({
				model: "oauthClient",
				where: [{ field: "clientId", value: clientId }],
			}),
	};
}

function createDiscovery(options: Partial<CimdOptions> = {}) {
	const fetchClientMetadataResource = vi.fn(
		async (_input: RequestInfo | URL, _init?: RequestInit) =>
			new Response(null, { status: 500 }),
	);
	const discovery = createCimdClientDiscovery({
		metadataFetchPolicy: { minimumFetchInterval: 0 },
		fetchClientMetadataResource,
		...options,
	});
	return { discovery, fetchClientMetadataResource };
}

describe("CIMD in-flight coalescing", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/12358
	 */
	it("persists a coalesced fetch with each request's own context", async () => {
		const clientId = "https://coalesced-contexts.example/client.json";
		const { discovery, fetchClientMetadataResource } = createDiscovery();
		const response = deferred<Response>();
		fetchClientMetadataResource.mockImplementation(() => response.promise);
		const first = await createRequestContext();
		const second = await createRequestContext();

		const firstResolution = discovery.resolve(first.ctx, clientId, null);
		const secondResolution = discovery.resolve(second.ctx, clientId, null);
		await vi.waitFor(() => {
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		});
		response.resolve(metadataResponse(clientId));

		await expect(firstResolution).resolves.toMatchObject({ clientId });
		await expect(secondResolution).resolves.toMatchObject({ clientId });
		expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		expect(await first.findClient(clientId)).toMatchObject({ clientId });
		expect(await second.findClient(clientId)).toMatchObject({ clientId });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12358
	 */
	it("converges requests sharing one database on a single client row", async () => {
		const clientId = "https://shared-database.example/client.json";
		const { discovery, fetchClientMetadataResource } = createDiscovery();
		const response = deferred<Response>();
		fetchClientMetadataResource.mockImplementation(() => response.promise);
		const request = await createRequestContext();

		const resolutions = [1, 2, 3].map(() =>
			discovery.resolve(request.ctx, clientId, null),
		);
		await vi.waitFor(() => {
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		});
		response.resolve(metadataResponse(clientId));

		for (const resolution of resolutions) {
			await expect(resolution).resolves.toMatchObject({ clientId });
		}
		const rows = await request.context.adapter.findMany({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
		expect(rows).toHaveLength(1);
		expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12358
	 */
	it("keeps one request's persistence failure from failing a request that joined its fetch", async () => {
		const clientId = "https://isolated-failure.example/client.json";
		const { discovery, fetchClientMetadataResource } = createDiscovery();
		const response = deferred<Response>();
		fetchClientMetadataResource.mockImplementation(() => response.promise);
		const first = await createRequestContext();
		const second = await createRequestContext();
		vi.spyOn(first.context.adapter, "transaction").mockRejectedValue(
			new Error("forced client persistence failure"),
		);

		const firstResolution = discovery.resolve(first.ctx, clientId, null);
		const secondResolution = discovery.resolve(second.ctx, clientId, null);
		await vi.waitFor(() => {
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		});
		response.resolve(metadataResponse(clientId));

		await expect(firstResolution).rejects.toThrow(
			"forced client persistence failure",
		);
		await expect(secondResolution).resolves.toMatchObject({ clientId });
		expect(await first.findClient(clientId)).toBeNull();
		expect(await second.findClient(clientId)).toMatchObject({ clientId });
	});

	it("drops a fetched document and paces the next fetch when persistence fails", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const clientId = "https://persistence-backoff.example/client.json";
		const { discovery, fetchClientMetadataResource } = createDiscovery({
			metadataFetchPolicy: undefined,
		});
		fetchClientMetadataResource.mockImplementation(async () =>
			metadataResponse(clientId),
		);
		const request = await createRequestContext();
		vi.spyOn(request.context.adapter, "transaction").mockRejectedValueOnce(
			new Error("forced client persistence failure"),
		);

		await expect(
			discovery.resolve(request.ctx, clientId, null),
		).rejects.toThrow("forced client persistence failure");
		await expect(
			discovery.resolve(request.ctx, clientId, null),
		).rejects.toMatchObject({ body: { error: "temporarily_unavailable" } });
		expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);

		now += 1_000;
		await expect(
			discovery.resolve(request.ctx, clientId, null),
		).resolves.toMatchObject({ clientId });
		expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
	});

	it("drops the cached document when persisting a revalidated one fails", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const clientId = "https://revalidation-failure.example/client.json";
		const { discovery, fetchClientMetadataResource } = createDiscovery({
			metadataFetchPolicy: undefined,
		});
		const request = await createRequestContext();
		fetchClientMetadataResource.mockImplementationOnce(async () =>
			metadataResponse(clientId, {
				"cache-control": "no-cache",
				etag: '"v1"',
			}),
		);
		const created = await discovery.resolve(request.ctx, clientId, null);

		now += 1_000;
		fetchClientMetadataResource.mockImplementationOnce(
			async () => new Response(null, { status: 304 }),
		);
		vi.spyOn(request.context.adapter, "transaction").mockRejectedValueOnce(
			new Error("forced client persistence failure"),
		);
		await expect(
			discovery.resolve(request.ctx, clientId, created),
		).rejects.toThrow("forced client persistence failure");

		now += 1_000;
		fetchClientMetadataResource.mockImplementationOnce(async () =>
			metadataResponse(clientId),
		);
		await expect(
			discovery.resolve(request.ctx, clientId, created),
		).resolves.toMatchObject({ clientId });
		const revalidationHeaders = new Headers(
			fetchClientMetadataResource.mock.calls[1]?.[1]?.headers,
		);
		const refetchHeaders = new Headers(
			fetchClientMetadataResource.mock.calls[2]?.[1]?.headers,
		);
		expect(revalidationHeaders.get("if-none-match")).toBe('"v1"');
		expect(refetchHeaders.has("if-none-match")).toBe(false);
	});

	describe("requests that do not wait for each other's saves", () => {
		/**
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("does not hold a request for a joined request whose save never settles", async () => {
			const clientId = "https://stuck-joiner.example/client.json";
			const { discovery, fetchClientMetadataResource } = createDiscovery();
			const response = deferred<Response>();
			fetchClientMetadataResource.mockImplementationOnce(
				() => response.promise,
			);
			fetchClientMetadataResource.mockImplementation(async () =>
				metadataResponse(clientId, { "cache-control": "no-store" }),
			);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			const later = await createRequestContext();
			vi.spyOn(joiner.context.adapter, "transaction").mockImplementationOnce(
				() => new Promise<never>(() => {}),
			);

			const leaderResolution = discovery.resolve(leader.ctx, clientId, null);
			void discovery.resolve(joiner.ctx, clientId, null);
			await vi.waitFor(() => {
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
			});
			response.resolve(
				metadataResponse(clientId, { "cache-control": "no-store" }),
			);

			await expect(leaderResolution).resolves.toMatchObject({ clientId });
			await expect(
				discovery.resolve(later.ctx, clientId, null),
			).resolves.toMatchObject({ clientId });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("does not hold a request for the fetching request's save that never settles", async () => {
			const clientId = "https://stuck-leader.example/client.json";
			const { discovery, fetchClientMetadataResource } = createDiscovery();
			const response = deferred<Response>();
			fetchClientMetadataResource.mockImplementationOnce(
				() => response.promise,
			);
			fetchClientMetadataResource.mockImplementation(async () =>
				metadataResponse(clientId, { "cache-control": "no-store" }),
			);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			const later = await createRequestContext();
			vi.spyOn(leader.context.adapter, "transaction").mockImplementationOnce(
				() => new Promise<never>(() => {}),
			);

			void discovery.resolve(leader.ctx, clientId, null);
			const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
			await vi.waitFor(() => {
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
			});
			response.resolve(
				metadataResponse(clientId, { "cache-control": "no-store" }),
			);

			await expect(joinerResolution).resolves.toMatchObject({ clientId });
			await expect(
				discovery.resolve(later.ctx, clientId, null),
			).resolves.toMatchObject({ clientId });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("leaves a joined request's pending save and later requests alone when the fetching request's save fails", async () => {
			const clientId = "https://failed-leader.example/client.json";
			const { discovery, fetchClientMetadataResource } = createDiscovery();
			const response = deferred<Response>();
			fetchClientMetadataResource.mockImplementationOnce(
				() => response.promise,
			);
			fetchClientMetadataResource.mockImplementation(async () =>
				metadataResponse(clientId),
			);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			const later = await createRequestContext();
			vi.spyOn(leader.context.adapter, "transaction").mockRejectedValueOnce(
				new Error("forced client persistence failure"),
			);
			const saveGate = deferred<void>();
			const transaction = joiner.context.adapter.transaction.bind(
				joiner.context.adapter,
			);
			vi.spyOn(joiner.context.adapter, "transaction").mockImplementationOnce(
				async (callback) => {
					await saveGate.promise;
					return transaction(callback);
				},
			);

			const leaderResolution = discovery.resolve(leader.ctx, clientId, null);
			const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
			await vi.waitFor(() => {
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
			});
			response.resolve(metadataResponse(clientId));
			await expect(leaderResolution).rejects.toThrow(
				"forced client persistence failure",
			);

			// The failed save dropped the document, so this request fetches again
			// while the joined request is still saving.
			await expect(
				discovery.resolve(later.ctx, clientId, null),
			).resolves.toMatchObject({ clientId });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);

			saveGate.resolve();
			await expect(joinerResolution).resolves.toMatchObject({ clientId });
			expect(await joiner.findClient(clientId)).toMatchObject({ clientId });
		});

		/**
		 * The fetched document is cached before any request saves it, and a cache
		 * hit returns the stored client. A runtime that ends the fetching request
		 * mid-save would otherwise leave the older stored client in use for the
		 * cache lifetime.
		 *
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("saves a refreshed document for a later request when the fetching request's save never settles", async () => {
			let now = 1_800_000_000_000;
			vi.spyOn(Date, "now").mockImplementation(() => now);
			const clientId = "https://refresh-in-progress.example/client.json";
			const onClientRefreshed = vi.fn();
			const { discovery, fetchClientMetadataResource } = createDiscovery({
				onClientRefreshed,
			});
			const request = await createRequestContext();
			fetchClientMetadataResource
				.mockImplementationOnce(async () =>
					namedMetadataResponse(clientId, "Old"),
				)
				.mockImplementationOnce(async () =>
					namedMetadataResponse(clientId, "New"),
				);
			const stored = await discovery.resolve(request.ctx, clientId, null);

			now += 120_000;
			vi.spyOn(request.context.adapter, "transaction").mockImplementationOnce(
				() => new Promise<never>(() => {}),
			);
			void discovery.resolve(request.ctx, clientId, stored);
			await vi.waitFor(() => {
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
			});
			// Let the fetch finish so the refresh is stuck in its save.
			await new Promise((resolve) => setTimeout(resolve, 10));

			await expect(
				discovery.resolve(request.ctx, clientId, stored),
			).resolves.toMatchObject({ name: "New" });
			const saved = await request.findClient(clientId);
			expect(saved?.name).toBe("New");
			await expect(
				discovery.resolve(request.ctx, clientId, saved),
			).resolves.toBe(saved);
			expect(onClientRefreshed).toHaveBeenCalledTimes(1);
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
		});

		/**
		 * Two refreshes of one client can overlap when a document is not cacheable.
		 * The resolver does not order their saves, and the next fetch stores the
		 * document the origin serves then.
		 *
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("converges on the served document when two refreshes save out of order", async () => {
			const clientId = "https://overlapping-refresh.example/client.json";
			const names = ["Seed", "First", "Second", "Second"];
			const { discovery, fetchClientMetadataResource } = createDiscovery();
			fetchClientMetadataResource.mockImplementation(async () =>
				Response.json(
					{
						client_id: clientId,
						client_name: names.shift(),
						redirect_uris: ["http://127.0.0.1:5199/callback"],
						application_type: "native",
						token_endpoint_auth_method: "none",
						grant_types: ["authorization_code"],
						response_types: ["code"],
					},
					{ headers: { "cache-control": "no-store" } },
				),
			);
			const request = await createRequestContext();
			const seeded = await discovery.resolve(request.ctx, clientId, null);
			const saveGate = deferred<void>();
			const transaction = request.context.adapter.transaction.bind(
				request.context.adapter,
			);
			vi.spyOn(request.context.adapter, "transaction").mockImplementationOnce(
				async (callback) => {
					await saveGate.promise;
					return transaction(callback);
				},
			);

			const first = discovery.resolve(request.ctx, clientId, seeded);
			await vi.waitFor(() => {
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
			});
			await new Promise((resolve) => setTimeout(resolve, 10));
			const second = await discovery.resolve(request.ctx, clientId, seeded);
			saveGate.resolve();
			const firstClient = await first;

			expect(firstClient?.name).toBe("First");
			expect(second?.name).toBe("Second");
			const current = await request.findClient(clientId);
			const converged = await discovery.resolve(request.ctx, clientId, current);
			expect(converged?.name).toBe("Second");
			expect((await request.findClient(clientId))?.name).toBe("Second");
		});
	});

	describe("a fetch that never settles", () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		/**
		 * A runtime that ends the request that started a fetch can leave the fetch
		 * pending forever.
		 *
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("lets a joined request fetch for itself and returns the abandoned fetch's permit", async () => {
			const clientId = "https://abandoned-fetch.example/client.json";
			const { discovery, fetchClientMetadataResource } = createDiscovery({
				metadataFetchPolicy: {
					minimumFetchInterval: 0,
					maximumConcurrentFetches: 1,
				},
			});
			fetchClientMetadataResource.mockImplementationOnce(
				() => new Promise<Response>(() => {}),
			);
			fetchClientMetadataResource.mockImplementation(async () =>
				metadataResponse(clientId),
			);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

			void discovery.resolve(leader.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
			const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(9_999);
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);

			await expect(joinerResolution).resolves.toMatchObject({ clientId });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
			expect(await joiner.findClient(clientId)).toMatchObject({ clientId });
			await expect(
				discovery.resolve(joiner.ctx, clientId, null),
			).resolves.toMatchObject({ clientId });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
		});

		it("keeps an abandoned fetch that finishes later from overwriting the fetch that replaced it", async () => {
			const clientId = "https://abandoned-late.example/client.json";
			const leaderPolicy = deferred<boolean>();
			const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
			isMetadataDocumentUrlAllowed.mockImplementationOnce(
				() => leaderPolicy.promise,
			);
			const { discovery, fetchClientMetadataResource } = createDiscovery({
				isMetadataDocumentUrlAllowed,
			});
			const names = ["Replacement", "Abandoned"];
			fetchClientMetadataResource.mockImplementation(async () =>
				namedMetadataResponse(clientId, names.shift() ?? "unexpected"),
			);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			const later = await createRequestContext();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

			const leaderResolution = discovery.resolve(leader.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(0);
			const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(10_000);
			await expect(joinerResolution).resolves.toMatchObject({
				name: "Replacement",
			});

			leaderPolicy.resolve(true);
			await expect(leaderResolution).resolves.toMatchObject({
				name: "Replacement",
			});
			expect((await leader.findClient(clientId))?.name).toBe("Replacement");
			await expect(
				discovery.resolve(later.ctx, clientId, null),
			).resolves.toMatchObject({ name: "Replacement" });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
		});

		/**
		 * The origin can answer the abandoned fetch with a document older than the
		 * one its replacement cached. Saving it would leave the stored client
		 * behind a fresh cache entry, and later requests trust the stored client.
		 *
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("keeps an abandoned fetch's older document out of a shared database", async () => {
			const clientId = "https://abandoned-shared-database.example/client.json";
			const leaderPolicy = deferred<boolean>();
			const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
			isMetadataDocumentUrlAllowed.mockImplementationOnce(
				() => leaderPolicy.promise,
			);
			const { discovery, fetchClientMetadataResource } = createDiscovery({
				isMetadataDocumentUrlAllowed,
			});
			const leaderResponse = deferred<Response>();
			// The replacement fetches while the leader is still in its policy check.
			fetchClientMetadataResource.mockImplementationOnce(async () =>
				namedMetadataResponse(clientId, "New"),
			);
			fetchClientMetadataResource.mockImplementationOnce(
				() => leaderResponse.promise,
			);
			const request = await createRequestContext();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

			const leaderResolution = discovery.resolve(request.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(0);
			const joinerResolution = discovery.resolve(request.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(10_000);
			await expect(joinerResolution).resolves.toMatchObject({ name: "New" });
			expect((await request.findClient(clientId))?.name).toBe("New");

			leaderPolicy.resolve(true);
			await vi.advanceTimersByTimeAsync(0);
			leaderResponse.resolve(namedMetadataResponse(clientId, "Old"));
			await expect(leaderResolution).resolves.toMatchObject({ name: "New" });

			const stored = await request.findClient(clientId);
			expect(stored?.name).toBe("New");
			await expect(
				discovery.resolve(request.ctx, clientId, stored),
			).resolves.toMatchObject({ name: "New" });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
		});

		/**
		 * A request whose fetch was retired resolves again and can find the
		 * replacement's fresh cache entry. The stored client it started with is
		 * then older than that entry.
		 *
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("saves the replacement's cached document for a request whose fetch was retired", async () => {
			const clientId = "https://abandoned-stored-client.example/client.json";
			const leaderPolicy = deferred<boolean>();
			const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
			isMetadataDocumentUrlAllowed
				.mockImplementationOnce(async () => true)
				.mockImplementationOnce(() => leaderPolicy.promise);
			const { discovery, fetchClientMetadataResource } = createDiscovery({
				isMetadataDocumentUrlAllowed,
			});
			fetchClientMetadataResource
				.mockImplementationOnce(async () =>
					metadataResponse(clientId, { "cache-control": "no-store" }, "Old"),
				)
				// The replacement fetches while the leader is still in its policy check.
				.mockImplementationOnce(async () =>
					namedMetadataResponse(clientId, "New"),
				)
				.mockImplementationOnce(async () =>
					namedMetadataResponse(clientId, "Old"),
				);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			await discovery.resolve(leader.ctx, clientId, null);
			const storedBeforeRefresh = await leader.findClient(clientId);
			expect(storedBeforeRefresh?.name).toBe("Old");
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

			const leaderResolution = discovery.resolve(
				leader.ctx,
				clientId,
				storedBeforeRefresh,
			);
			await vi.advanceTimersByTimeAsync(0);
			const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(10_000);
			await expect(joinerResolution).resolves.toMatchObject({ name: "New" });
			expect((await leader.findClient(clientId))?.name).toBe("Old");

			leaderPolicy.resolve(true);
			await expect(leaderResolution).resolves.toMatchObject({ name: "New" });
			expect((await leader.findClient(clientId))?.name).toBe("New");
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(3);
		});

		/**
		 * The stored client the request started with is older than the cached
		 * entry, and a cache hit returns the stored client, so the entry must not
		 * outlive a failed save.
		 *
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("drops the replacement's cached document when saving it after a retired fetch fails", async () => {
			const clientId = "https://abandoned-failed-save.example/client.json";
			const leaderPolicy = deferred<boolean>();
			const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
			isMetadataDocumentUrlAllowed
				.mockImplementationOnce(async () => true)
				.mockImplementationOnce(() => leaderPolicy.promise);
			const { discovery, fetchClientMetadataResource } = createDiscovery({
				isMetadataDocumentUrlAllowed,
			});
			fetchClientMetadataResource
				.mockImplementationOnce(async () =>
					metadataResponse(clientId, { "cache-control": "no-store" }, "Old"),
				)
				.mockImplementationOnce(async () =>
					namedMetadataResponse(clientId, "New"),
				)
				.mockImplementationOnce(async () =>
					namedMetadataResponse(clientId, "Old"),
				)
				.mockImplementationOnce(async () =>
					namedMetadataResponse(clientId, "New"),
				);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			await discovery.resolve(leader.ctx, clientId, null);
			const storedBeforeRefresh = await leader.findClient(clientId);
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

			const leaderResolution = discovery.resolve(
				leader.ctx,
				clientId,
				storedBeforeRefresh,
			);
			void Promise.resolve(leaderResolution).catch(() => {});
			await vi.advanceTimersByTimeAsync(0);
			const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(10_000);
			await expect(joinerResolution).resolves.toMatchObject({ name: "New" });

			vi.spyOn(leader.context.adapter, "transaction").mockRejectedValueOnce(
				new Error("forced client persistence failure"),
			);
			leaderPolicy.resolve(true);
			await expect(leaderResolution).rejects.toThrow(
				"forced client persistence failure",
			);

			await expect(
				discovery.resolve(leader.ctx, clientId, storedBeforeRefresh),
			).resolves.toMatchObject({ name: "New" });
			expect((await leader.findClient(clientId))?.name).toBe("New");
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(4);
		});

		it("does not let an abandoned fetch that fails later pace the fetch that replaced it", async () => {
			const clientId = "https://abandoned-failure.example/client.json";
			let failLeaderPolicy!: (error: Error) => void;
			const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
			isMetadataDocumentUrlAllowed.mockImplementationOnce(
				() =>
					new Promise<boolean>((_resolve, reject) => {
						failLeaderPolicy = reject;
					}),
			);
			const { discovery, fetchClientMetadataResource } = createDiscovery({
				isMetadataDocumentUrlAllowed,
				metadataFetchPolicy: { minimumFetchInterval: 3_600 },
			});
			fetchClientMetadataResource.mockImplementation(async () =>
				metadataResponse(clientId, { "cache-control": "no-store" }),
			);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			const later = await createRequestContext();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

			const leaderResolution = discovery.resolve(leader.ctx, clientId, null);
			void Promise.resolve(leaderResolution).catch(() => {});
			await vi.advanceTimersByTimeAsync(0);
			const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(10_000);
			// The abandoned fetch's pacing record is gone, so the replacement ran.
			await expect(joinerResolution).resolves.toMatchObject({ clientId });

			// The retired fetch's failure is not reported: the request that started
			// it resolves again and fetches, which the failure's pacing would refuse.
			failLeaderPolicy(new Error("policy service failed"));
			await expect(leaderResolution).resolves.toMatchObject({ clientId });
			await expect(
				discovery.resolve(later.ctx, clientId, null),
			).resolves.toMatchObject({ clientId });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(3);
		});

		/**
		 * A fetch past its lease is retired when a request for another client
		 * needs its slot. A late answer is still the newest document when no
		 * fetch for that client started after it was retired.
		 *
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		describe("a fetch whose lease ran out", () => {
			it("uses its late document when no newer fetch for the client started", async () => {
				const clientId = "https://lease-late.example/client.json";
				const otherClientId = "https://lease-late-other.example/client.json";
				const leaderPolicy = deferred<boolean>();
				const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
				isMetadataDocumentUrlAllowed.mockImplementationOnce(
					() => leaderPolicy.promise,
				);
				const { discovery, fetchClientMetadataResource } = createDiscovery({
					isMetadataDocumentUrlAllowed,
					metadataFetchPolicy: {
						minimumFetchInterval: 0,
						maximumConcurrentFetches: 1,
					},
				});
				fetchClientMetadataResource.mockImplementation(async (input) =>
					namedMetadataResponse(String(input), "Late"),
				);
				const leader = await createRequestContext();
				const other = await createRequestContext();
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

				const leaderResolution = discovery.resolve(leader.ctx, clientId, null);
				await vi.advanceTimersByTimeAsync(10_000);
				await expect(
					discovery.resolve(other.ctx, otherClientId, null),
				).resolves.toMatchObject({ clientId: otherClientId });

				leaderPolicy.resolve(true);
				await expect(leaderResolution).resolves.toMatchObject({
					name: "Late",
				});
				expect((await leader.findClient(clientId))?.name).toBe("Late");
				await expect(
					discovery.resolve(other.ctx, clientId, null),
				).resolves.toMatchObject({ name: "Late" });
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
			});

			it("saves its late document for a later request when the request that started it never finishes saving", async () => {
				const clientId = "https://lease-late-unsaved.example/client.json";
				const otherClientId =
					"https://lease-late-unsaved-other.example/client.json";
				const leaderPolicy = deferred<boolean>();
				const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
				isMetadataDocumentUrlAllowed
					.mockImplementationOnce(async () => true)
					.mockImplementationOnce(() => leaderPolicy.promise);
				const { discovery, fetchClientMetadataResource } = createDiscovery({
					isMetadataDocumentUrlAllowed,
					metadataFetchPolicy: {
						minimumFetchInterval: 0,
						maximumConcurrentFetches: 1,
					},
				});
				fetchClientMetadataResource
					.mockImplementationOnce(async () =>
						metadataResponse(clientId, { "cache-control": "no-store" }, "Old"),
					)
					.mockImplementation(async (input) =>
						namedMetadataResponse(String(input), "Late"),
					);
				const leader = await createRequestContext();
				const other = await createRequestContext();
				await discovery.resolve(leader.ctx, clientId, null);
				const storedBeforeRefresh = await leader.findClient(clientId);
				expect(storedBeforeRefresh?.name).toBe("Old");
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

				void discovery.resolve(leader.ctx, clientId, storedBeforeRefresh);
				await vi.advanceTimersByTimeAsync(10_000);
				await discovery.resolve(other.ctx, otherClientId, null);
				vi.spyOn(leader.context.adapter, "transaction").mockImplementationOnce(
					() => new Promise<never>(() => {}),
				);
				leaderPolicy.resolve(true);
				await vi.advanceTimersByTimeAsync(0);

				await expect(
					discovery.resolve(leader.ctx, clientId, storedBeforeRefresh),
				).resolves.toMatchObject({ name: "Late" });
				expect((await leader.findClient(clientId))?.name).toBe("Late");
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(3);
			});

			it("does not use its late document once a newer fetch for the client started", async () => {
				const clientId = "https://lease-replaced.example/client.json";
				const otherClientId =
					"https://lease-replaced-other.example/client.json";
				const leaderPolicy = deferred<boolean>();
				const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
				isMetadataDocumentUrlAllowed.mockImplementationOnce(
					() => leaderPolicy.promise,
				);
				const { discovery, fetchClientMetadataResource } = createDiscovery({
					isMetadataDocumentUrlAllowed,
					metadataFetchPolicy: {
						minimumFetchInterval: 0,
						maximumConcurrentFetches: 1,
					},
				});
				const names = ["Replacement", "Retired", "Replacement"];
				fetchClientMetadataResource.mockImplementation(async (input) =>
					String(input) === clientId
						? metadataResponse(
								clientId,
								{ "cache-control": "no-store" },
								names.shift(),
							)
						: metadataResponse(String(input)),
				);
				const leader = await createRequestContext();
				const later = await createRequestContext();
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

				const leaderResolution = discovery.resolve(leader.ctx, clientId, null);
				await vi.advanceTimersByTimeAsync(10_000);
				await discovery.resolve(later.ctx, otherClientId, null);
				// The replacement cannot be cached, so it leaves no entry to compare.
				await expect(
					discovery.resolve(later.ctx, clientId, null),
				).resolves.toMatchObject({ name: "Replacement" });

				leaderPolicy.resolve(true);
				await expect(leaderResolution).resolves.toMatchObject({
					name: "Replacement",
				});
				expect((await leader.findClient(clientId))?.name).toBe("Replacement");
			});

			it("does not report its failure to a request that joined it", async () => {
				const clientId = "https://lease-failure.example/client.json";
				const otherClientId = "https://lease-failure-other.example/client.json";
				let failLeaderPolicy!: (error: Error) => void;
				const isMetadataDocumentUrlAllowed = vi.fn(async () => true);
				isMetadataDocumentUrlAllowed.mockImplementationOnce(
					() =>
						new Promise<boolean>((_resolve, reject) => {
							failLeaderPolicy = reject;
						}),
				);
				const { discovery, fetchClientMetadataResource } = createDiscovery({
					isMetadataDocumentUrlAllowed,
					metadataFetchPolicy: {
						minimumFetchInterval: 0,
						maximumConcurrentFetches: 1,
					},
				});
				fetchClientMetadataResource.mockImplementation(async (input) =>
					metadataResponse(String(input)),
				);
				const leader = await createRequestContext();
				const joiner = await createRequestContext();
				const other = await createRequestContext();
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

				const leaderResolution = discovery.resolve(leader.ctx, clientId, null);
				await vi.advanceTimersByTimeAsync(5_000);
				const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
				await vi.advanceTimersByTimeAsync(5_000);
				// The lease runs out while the joined request still waits.
				await discovery.resolve(other.ctx, otherClientId, null);

				failLeaderPolicy(new Error("policy service failed"));
				await expect(joinerResolution).resolves.toMatchObject({ clientId });
				await expect(leaderResolution).resolves.toMatchObject({ clientId });
				expect(await joiner.findClient(clientId)).toMatchObject({ clientId });
				expect(await leader.findClient(clientId)).toMatchObject({ clientId });
			});
		});

		it("lets a later request fetch after a joined request gave up", async () => {
			const clientId = "https://abandoned-then-later.example/client.json";
			const { discovery, fetchClientMetadataResource } = createDiscovery();
			fetchClientMetadataResource.mockImplementationOnce(
				() => new Promise<Response>(() => {}),
			);
			fetchClientMetadataResource.mockImplementation(async () =>
				metadataResponse(clientId, { "cache-control": "no-store" }),
			);
			const leader = await createRequestContext();
			const joiner = await createRequestContext();
			const later = await createRequestContext();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

			void discovery.resolve(leader.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(0);
			const joinerResolution = discovery.resolve(joiner.ctx, clientId, null);
			await vi.advanceTimersByTimeAsync(10_000);
			await joinerResolution;

			await expect(
				discovery.resolve(later.ctx, clientId, null),
			).resolves.toMatchObject({ clientId });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(3);
		});

		/**
		 * Only the fetching request or a request for the same client can otherwise
		 * return a permit, so a fetch whose request the runtime ended would hold it
		 * for good and keep every other client at the concurrency limit.
		 *
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it.each([
			{
				limit: "global",
				metadataFetchPolicy: { maximumConcurrentFetches: 1 },
				stuckClientId: "https://stuck-permit.example/client.json",
				otherClientId: "https://other-origin.example/client.json",
			},
			{
				limit: "per-origin",
				metadataFetchPolicy: { maximumConcurrentFetchesPerOrigin: 1 },
				stuckClientId: "https://shared-origin.example/stuck.json",
				otherClientId: "https://shared-origin.example/other.json",
			},
		])(
			"lets another client reclaim the $limit permit of a fetch past its lease",
			async ({ metadataFetchPolicy, stuckClientId, otherClientId }) => {
				const { discovery, fetchClientMetadataResource } = createDiscovery({
					metadataFetchPolicy: {
						minimumFetchInterval: 0,
						...metadataFetchPolicy,
					},
				});
				fetchClientMetadataResource.mockImplementationOnce(
					() => new Promise<Response>(() => {}),
				);
				fetchClientMetadataResource.mockImplementation(async (input) =>
					metadataResponse(String(input)),
				);
				const stuck = await createRequestContext();
				const other = await createRequestContext();
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

				void discovery.resolve(stuck.ctx, stuckClientId, null);
				await vi.advanceTimersByTimeAsync(9_999);
				await expect(
					discovery.resolve(other.ctx, otherClientId, null),
				).rejects.toMatchObject({ body: { error: "temporarily_unavailable" } });

				await vi.advanceTimersByTimeAsync(1);
				await expect(
					discovery.resolve(other.ctx, otherClientId, null),
				).resolves.toMatchObject({ clientId: otherClientId });
				// The retired fetch also left the in-flight map, so its client fetches again.
				await expect(
					discovery.resolve(stuck.ctx, stuckClientId, null),
				).resolves.toMatchObject({ clientId: stuckClientId });
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(3);
			},
		);

		/**
		 * @see https://github.com/better-auth/better-auth/issues/12358
		 */
		it("lets another client reclaim the slot of a fetch past its lease when client fetch state is full", async () => {
			const stuckClientId = "https://full-client-state.example/stuck.json";
			const otherClientId = "https://full-client-state.example/other.json";
			const { discovery, fetchClientMetadataResource } = createDiscovery({
				maxCacheEntries: 1,
			});
			fetchClientMetadataResource.mockImplementationOnce(
				() => new Promise<Response>(() => {}),
			);
			fetchClientMetadataResource.mockImplementation(async (input) =>
				metadataResponse(String(input)),
			);
			const stuck = await createRequestContext();
			const other = await createRequestContext();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

			void discovery.resolve(stuck.ctx, stuckClientId, null);
			await vi.advanceTimersByTimeAsync(9_999);
			await expect(
				discovery.resolve(other.ctx, otherClientId, null),
			).rejects.toMatchObject({
				body: {
					error: "temporarily_unavailable",
					error_description: "metadata fetch client state is at capacity",
				},
			});

			await vi.advanceTimersByTimeAsync(1);
			await expect(
				discovery.resolve(other.ctx, otherClientId, null),
			).resolves.toMatchObject({ clientId: otherClientId });
		});
	});
});

describe("CIMD DNS lookup limit refusal", () => {
	it("keeps the backoff a failed save recorded while the refused fetch was in flight", async () => {
		const clientId = "https://capacity-backoff.example/client.json";
		const { discovery, fetchClientMetadataResource } = createDiscovery({
			metadataFetchPolicy: { minimumFetchInterval: 60 },
		});
		const refusedFetchHeld = deferred<void>();
		fetchClientMetadataResource
			.mockImplementationOnce(async () =>
				metadataResponse(clientId, { "cache-control": "no-store" }),
			)
			.mockImplementationOnce(async () => {
				await refusedFetchHeld.promise;
				throw Object.assign(
					new TypeError("metadata DNS lookup limit exceeded"),
					{
						code: "ERR_CIMD_DNS_LOOKUP_LIMIT",
					},
				);
			});
		const saving = await createRequestContext();
		const refused = await createRequestContext();
		const saveHeld = deferred<void>();
		let holding = false;
		vi.spyOn(saving.context.adapter, "transaction").mockImplementation(
			async () => {
				holding = true;
				await saveHeld.promise;
				throw new Error("forced client persistence failure");
			},
		);
		const savingResolution = discovery.resolve(saving.ctx, clientId, null);
		void Promise.resolve(savingResolution).catch(() => {});
		await vi.waitFor(() => expect(holding).toBe(true));
		const refusedResolution = discovery.resolve(refused.ctx, clientId, null);
		void Promise.resolve(refusedResolution).catch(() => {});
		await vi.waitFor(() =>
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2),
		);

		saveHeld.resolve();
		await expect(savingResolution).rejects.toThrow(
			"forced client persistence failure",
		);
		refusedFetchHeld.resolve();
		await expect(refusedResolution).rejects.toMatchObject({
			body: { error: "temporarily_unavailable" },
		});

		await expect(
			discovery.resolve(refused.ctx, clientId, null),
		).rejects.toMatchObject({
			body: {
				error_description:
					"metadata document fetch is within the per-client minimum interval",
			},
		});
		expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
	});
});

describe("CIMD resolution of a cached document", () => {
	it("returns the stored client on a cache hit without rewriting it", async () => {
		const clientId = "https://cache-hit-existing.example/client.json";
		const onClientRefreshed = vi.fn();
		const { discovery, fetchClientMetadataResource } = createDiscovery({
			onClientRefreshed,
		});
		fetchClientMetadataResource.mockImplementation(async () =>
			metadataResponse(clientId),
		);
		const request = await createRequestContext();
		await discovery.resolve(request.ctx, clientId, null);
		await request.context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update: { name: "Edited out of band" },
		});
		const stored = await request.findClient(clientId);

		const resolved = await discovery.resolve(request.ctx, clientId, stored);

		expect(resolved).toBe(stored);
		expect(onClientRefreshed).not.toHaveBeenCalled();
		expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		expect((await request.findClient(clientId))?.name).toBe(
			"Edited out of band",
		);
	});

	it("saves a newer cached document again when an older save lands after it", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const clientId = "https://out-of-order-saves.example/client.json";
			const { discovery, fetchClientMetadataResource } = createDiscovery();
			const shortLived = (clientName: string) =>
				metadataResponse(
					clientId,
					{ "cache-control": "max-age=1" },
					clientName,
				);
			const request = await createRequestContext();
			fetchClientMetadataResource.mockResolvedValueOnce(shortLived("v0"));
			await discovery.resolve(request.ctx, clientId, null);
			vi.setSystemTime(Date.now() + 1_100);

			const transaction = request.context.adapter.transaction.bind(
				request.context.adapter,
			);
			const olderSaveHeld = deferred<void>();
			let holding = false;
			vi.spyOn(request.context.adapter, "transaction").mockImplementation(
				async (callback) => {
					if (!holding) {
						holding = true;
						await olderSaveHeld.promise;
					}
					return transaction(callback as never);
				},
			);
			fetchClientMetadataResource.mockResolvedValueOnce(shortLived("v1"));
			const olderSave = discovery.resolve(
				request.ctx,
				clientId,
				await request.findClient(clientId),
			);
			await vi.waitFor(() => expect(holding).toBe(true));
			vi.setSystemTime(Date.now() + 1_100);

			fetchClientMetadataResource.mockResolvedValueOnce(
				namedMetadataResponse(clientId, "v2"),
			);
			await discovery.resolve(
				request.ctx,
				clientId,
				await request.findClient(clientId),
			);
			olderSaveHeld.resolve();
			await olderSave;
			expect((await request.findClient(clientId))?.name).toBe("v1");

			const resolved = await discovery.resolve(
				request.ctx,
				clientId,
				await request.findClient(clientId),
			);

			expect(resolved?.name).toBe("v2");
			expect((await request.findClient(clientId))?.name).toBe("v2");
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it("drops a cached document whose first save fails while the fetching request is still saving", async () => {
		const clientId = "https://failed-first-save.example/client.json";
		const { discovery, fetchClientMetadataResource } = createDiscovery();
		fetchClientMetadataResource.mockImplementation(async () =>
			metadataResponse(clientId),
		);
		const fetching = await createRequestContext();
		const other = await createRequestContext();
		const transaction = fetching.context.adapter.transaction.bind(
			fetching.context.adapter,
		);
		const fetchingSaveHeld = deferred<void>();
		let holding = false;
		vi.spyOn(fetching.context.adapter, "transaction").mockImplementation(
			async (callback) => {
				holding = true;
				await fetchingSaveHeld.promise;
				return transaction(callback as never);
			},
		);
		const fetchingResolution = discovery.resolve(fetching.ctx, clientId, null);
		await vi.waitFor(() => expect(holding).toBe(true));

		vi.spyOn(other.context.adapter, "transaction").mockRejectedValueOnce(
			new Error("forced client persistence failure"),
		);
		await expect(discovery.resolve(other.ctx, clientId, null)).rejects.toThrow(
			"forced client persistence failure",
		);
		await expect(
			discovery.resolve(other.ctx, clientId, null),
		).resolves.toMatchObject({ clientId });
		expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);

		fetchingSaveHeld.resolve();
		await expect(fetchingResolution).resolves.toMatchObject({ clientId });
	});

	it("runs the fetch policy once per fetch and not on a cache hit", async () => {
		const clientId = "https://policy-once.example/client.json";
		const isMetadataDocumentUrlAllowed = vi.fn(() => true);
		const { discovery, fetchClientMetadataResource } = createDiscovery({
			isMetadataDocumentUrlAllowed,
		});
		fetchClientMetadataResource.mockImplementation(async () =>
			metadataResponse(clientId),
		);
		const request = await createRequestContext();

		const created = await discovery.resolve(request.ctx, clientId, null);
		expect(isMetadataDocumentUrlAllowed).toHaveBeenCalledTimes(1);

		await discovery.resolve(request.ctx, clientId, created);
		expect(isMetadataDocumentUrlAllowed).toHaveBeenCalledTimes(1);
		expect(fetchClientMetadataResource).toHaveBeenCalledTimes(1);
	});
});
