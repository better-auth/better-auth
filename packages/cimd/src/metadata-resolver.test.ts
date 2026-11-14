import type { GenericEndpointContext } from "@better-auth/core";
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { createCimdClientDiscovery, createCimdMetadataResolver } from "./index";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function sampleMetadata(clientId: string) {
	return {
		client_id: clientId,
		client_name: "Test Client",
		redirect_uris: ["https://client.example/callback"],
		token_endpoint_auth_method: "none",
		grant_types: ["authorization_code"],
		response_types: ["code"],
	};
}

describe("CimdMetadataResolver", () => {
	it("resolves and caches client metadata independently without database or auth instance", async () => {
		const clientId = "https://standalone.example/metadata.json";
		const fetchResource = vi.fn(async () =>
			Response.json(sampleMetadata(clientId), {
				headers: {
					"content-type": "application/json",
					"cache-control": "max-age=3600",
				},
			}),
		);

		const resolver = createCimdMetadataResolver({
			fetchClientMetadataResource: fetchResource,
		});

		// 1. Resolve directly as function
		const metadata = await resolver(clientId);
		expect(metadata).not.toBeNull();
		expect(metadata?.client_id).toBe(clientId);
		expect(metadata?.client_name).toBe("Test Client");
		expect(fetchResource).toHaveBeenCalledTimes(1);

		// 2. Resolve via .resolve() hits fresh cache
		const cached = await resolver.resolve(clientId);
		expect(cached).toEqual(metadata);
		expect(fetchResource).toHaveBeenCalledTimes(1);

		// 3. Resolve via .resolveWithDetails() reports isFresh: true
		const details = await resolver.resolveWithDetails(clientId);
		expect(details).not.toBeNull();
		expect(details?.isFresh).toBe(true);
		expect(details?.metadata).toEqual(metadata);
		expect(fetchResource).toHaveBeenCalledTimes(1);

		// 4. Invalidate / evict triggers re-fetch
		resolver.invalidate(clientId);
		const refreshedDetails = await resolver.resolveWithDetails(clientId);
		expect(refreshedDetails?.isFresh).toBe(false);
		expect(fetchResource).toHaveBeenCalledTimes(2);
	});

	it("returns null for non-candidate client IDs", async () => {
		const fetchResource = vi.fn();
		const resolver = createCimdMetadataResolver({
			fetchClientMetadataResource: fetchResource,
		});

		expect(await resolver("not-a-url")).toBeNull();
		expect(await resolver("http://insecure.example/client.json")).toBeNull();
		expect(fetchResource).not.toHaveBeenCalled();
	});

	it("can be passed directly to createCimdClientDiscovery", () => {
		const fetchResource = vi.fn();
		const resolver = createCimdMetadataResolver({
			fetchClientMetadataResource: fetchResource,
		});

		const discovery = createCimdClientDiscovery(resolver, {
			fetchClientMetadataResource: fetchResource,
		});

		expect(discovery.id).toBe("cimd");
		expect(discovery.matches("https://valid.example/metadata.json")).toBe(true);
		expect(discovery.matches("plain-id")).toBe(false);
		expect(discovery.discoveryMetadata).toEqual({
			client_id_metadata_document_supported: true,
		});
	});

	it("shares network fetch but uses isolated request contexts for persistence (#12358)", async () => {
		const clientId = "https://scoped-ctx.example/metadata.json";
		const fetchBarrier = deferred<Response>();
		const fetchResource = vi.fn(async () => fetchBarrier.promise);

		const sharedMetadataResolver = createCimdMetadataResolver({
			fetchClientMetadataResource: fetchResource,
		});

		// Create two separate test instances representing request-scoped contexts
		const instanceA = await getTestInstance({
			baseURL: "http://localhost:3901",
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid"],
				}),
			],
		});

		const instanceB = await getTestInstance({
			baseURL: "http://localhost:3902",
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid"],
				}),
			],
		});

		const discoveryA = createCimdClientDiscovery({
			fetchClientMetadataResource: fetchResource,
			metadataResolver: sharedMetadataResolver,
		});

		const discoveryB = createCimdClientDiscovery({
			fetchClientMetadataResource: fetchResource,
			metadataResolver: sharedMetadataResolver,
		});

		const contextA = await instanceA.auth.$context;
		const contextB = await instanceB.auth.$context;

		const ctxA = {
			context: contextA,
		} as unknown as GenericEndpointContext;

		const ctxB = {
			context: contextB,
		} as unknown as GenericEndpointContext;

		// Concurrently resolve the uncached client in both contexts
		const promiseA = discoveryA.resolve(ctxA, clientId, null);
		const promiseB = discoveryB.resolve(ctxB, clientId, null);

		// Verify network fetch is in flight and coalesced
		await vi.waitFor(() => {
			expect(fetchResource).toHaveBeenCalledTimes(1);
		});

		// Release the fetch barrier
		fetchBarrier.resolve(
			Response.json(sampleMetadata(clientId), {
				headers: {
					"content-type": "application/json",
					"cache-control": "max-age=3600",
				},
			}),
		);

		const [clientA, clientB] = await Promise.all([promiseA, promiseB]);

		// Both contexts successfully registered the client
		expect(clientA).not.toBeNull();
		expect(clientB).not.toBeNull();
		expect(clientA?.clientId).toBe(clientId);
		expect(clientB?.clientId).toBe(clientId);

		// Only one HTTP request was performed
		expect(fetchResource).toHaveBeenCalledTimes(1);

		// Verify that each instance's database has the client registered in its own storage
		const dbClientA = await contextA.adapter.findOne({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
		const dbClientB = await contextB.adapter.findOne({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});

		expect(dbClientA).not.toBeNull();
		expect(dbClientB).not.toBeNull();
		expect(dbClientA?.clientId).toBe(clientId);
		expect(dbClientB?.clientId).toBe(clientId);
	});
});
