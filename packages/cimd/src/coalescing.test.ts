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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12358
	 */
	it("does not serve a stored client from a refreshed document before the refresh is saved", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const clientId = "https://refresh-ordering.example/client.json";
		const { discovery, fetchClientMetadataResource } = createDiscovery();
		const request = await createRequestContext();
		fetchClientMetadataResource.mockImplementationOnce(async () =>
			metadataResponse(clientId),
		);
		const stored = await discovery.resolve(request.ctx, clientId, null);

		now += 120_000;
		fetchClientMetadataResource.mockImplementationOnce(async () =>
			Response.json(
				{
					client_id: clientId,
					client_name: "Coalescing Client",
					redirect_uris: ["http://127.0.0.1:5199/renamed"],
					application_type: "native",
					token_endpoint_auth_method: "none",
					grant_types: ["authorization_code"],
					response_types: ["code"],
				},
				{ headers: { "cache-control": "max-age=60" } },
			),
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
		const concurrent = discovery.resolve(request.ctx, clientId, stored);
		saveGate.resolve();

		await expect(refresh).resolves.toMatchObject({
			redirectUris: ["http://127.0.0.1:5199/renamed"],
		});
		await expect(concurrent).resolves.toMatchObject({
			redirectUris: ["http://127.0.0.1:5199/renamed"],
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
