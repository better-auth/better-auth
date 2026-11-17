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
) {
	return Response.json(
		{
			client_id: clientId,
			client_name: "Coalescing Client",
			redirect_uris: ["http://127.0.0.1:5199/callback"],
			application_type: "native",
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code"],
			response_types: ["code"],
		},
		{ headers },
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

		it("answers a request from the stored client while a refresh is still saving", async () => {
			let now = 1_800_000_000_000;
			vi.spyOn(Date, "now").mockImplementation(() => now);
			const clientId = "https://refresh-in-progress.example/client.json";
			const { discovery, fetchClientMetadataResource } = createDiscovery();
			const request = await createRequestContext();
			fetchClientMetadataResource.mockImplementationOnce(async () =>
				metadataResponse(clientId),
			);
			const stored = await discovery.resolve(request.ctx, clientId, null);

			now += 120_000;
			fetchClientMetadataResource.mockImplementationOnce(async () =>
				metadataResponse(clientId),
			);
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

			const refresh = discovery.resolve(request.ctx, clientId, stored);
			await vi.waitFor(() => {
				expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
			});
			// Let the fetch finish so the refresh is waiting on its save.
			await new Promise((resolve) => setTimeout(resolve, 10));

			await expect(
				discovery.resolve(request.ctx, clientId, stored),
			).resolves.toBe(stored);
			saveGate.resolve();
			await expect(refresh).resolves.toMatchObject({ clientId });
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
			const documentNamed = (name: string) =>
				Response.json(
					{
						client_id: clientId,
						client_name: name,
						redirect_uris: ["http://127.0.0.1:5199/callback"],
						application_type: "native",
						token_endpoint_auth_method: "none",
						grant_types: ["authorization_code"],
						response_types: ["code"],
					},
					{ headers: { "cache-control": "max-age=60" } },
				);
			const names = ["Replacement", "Abandoned"];
			fetchClientMetadataResource.mockImplementation(async () =>
				documentNamed(names.shift() ?? "unexpected"),
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
				name: "Abandoned",
			});
			await expect(
				discovery.resolve(later.ctx, clientId, null),
			).resolves.toMatchObject({ name: "Replacement" });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
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

			failLeaderPolicy(new Error("policy service failed"));
			await expect(leaderResolution).rejects.toThrow("policy service failed");
			await expect(
				discovery.resolve(later.ctx, clientId, null),
			).resolves.toMatchObject({ clientId });
			expect(fetchClientMetadataResource).toHaveBeenCalledTimes(2);
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
