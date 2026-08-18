import { BetterAuthError } from "@better-auth/core/error";
import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cimd, createCimdClientDiscovery } from "./index";
import type { CimdMetadataFetchPolicy } from "./types";

const REDIRECT_URI = "http://127.0.0.1:5199/callback";
const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
let instanceSequence = 0;

afterEach(() => {
	vi.restoreAllMocks();
});

function metadata(clientId: string) {
	return {
		client_id: clientId,
		client_name: "Governed Client",
		redirect_uris: [REDIRECT_URI],
		application_type: "native",
		token_endpoint_auth_method: "none",
		grant_types: ["authorization_code"],
		response_types: ["code"],
	};
}

function noStoreMetadata(clientId: string) {
	return Response.json(metadata(clientId), {
		headers: { "cache-control": "no-store" },
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

async function createGovernorHarness(
	metadataFetchPolicy?: CimdMetadataFetchPolicy,
	maxCacheEntries = 8,
) {
	instanceSequence += 1;
	const baseURL = `http://localhost:${3300 + instanceSequence}`;
	const responders = new Map<string, () => Response | Promise<Response>>();
	const fetchClientMetadataResource = vi.fn(
		async (input: RequestInfo | URL): Promise<Response> => {
			const clientId =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			const responder = responders.get(clientId);
			if (!responder) throw new Error(`No responder for ${clientId}`);
			return responder();
		},
	);
	const instance = await getTestInstance({
		baseURL,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid"],
			}),
			cimd({
				fetchClientMetadataResource,
				maxCacheEntries,
				metadataFetchPolicy,
			}),
		],
	});
	const { headers } = await instance.signInWithTestUser();
	const client = createAuthClient({
		baseURL,
		plugins: [oauthProviderClient()],
		fetchOptions: { customFetchImpl: instance.customFetchImpl, headers },
	});

	const authorize = async (clientId: string) => {
		let status = 200;
		let location = "";
		await client.$fetch(
			`${baseURL}/api/auth/oauth2/authorize` +
				`?client_id=${encodeURIComponent(clientId)}` +
				"&response_type=code" +
				`&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
				"&scope=openid" +
				`&code_challenge=${PKCE_CHALLENGE}` +
				"&code_challenge_method=S256",
			{
				onError(context) {
					status = context.response.status;
					location = context.response.headers.get("location") ?? "";
				},
			},
		);
		return { location, status };
	};

	return {
		authorize,
		fetchClientMetadataResource,
		responders,
	};
}

describe("CIMD metadata fetch governor", () => {
	it.each([
		["maximumConcurrentFetches", 0],
		["maximumConcurrentFetchesPerOrigin", 1.5],
		["maximumFetchesPerMinute", -1],
		["maximumFetchesPerOriginPerMinute", Number.NaN],
	] as const)("rejects invalid %s configuration", (field, value) => {
		expect(() =>
			createCimdClientDiscovery({
				fetchClientMetadataResource: async () => new Response(),
				metadataFetchPolicy: { [field]: value },
			}),
		).toThrow(BetterAuthError);
	});

	it("rejects an invalid minimum fetch interval as a configuration error", () => {
		expect(() =>
			createCimdClientDiscovery({
				fetchClientMetadataResource: async () => new Response(),
				metadataFetchPolicy: { minimumFetchInterval: -1 },
			}),
		).toThrow(BetterAuthError);
	});

	it("defaults the per-client minimum fetch interval to one second", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const harness = await createGovernorHarness();
		const clientId = "https://default-pacing.example/client.json";
		harness.responders.set(clientId, () => noStoreMetadata(clientId));

		await harness.authorize(clientId);
		now += 999;
		expect((await harness.authorize(clientId)).status).toBe(429);
		now += 1;
		expect((await harness.authorize(clientId)).location).toContain("/consent");
	});

	it("paces repeated no-store requests without reusing metadata", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const harness = await createGovernorHarness({
			minimumFetchInterval: 10,
		});
		const clientId = "https://paced.example/client.json";
		harness.responders.set(clientId, () => noStoreMetadata(clientId));

		expect((await harness.authorize(clientId)).location).toContain("/consent");
		expect((await harness.authorize(clientId)).status).toBe(429);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);

		now += 10_000;
		expect((await harness.authorize(clientId)).location).toContain("/consent");
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);
	});

	it("fully disables per-client pacing when the interval is zero", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const harness = await createGovernorHarness({ minimumFetchInterval: 0 }, 2);
		const clients = [
			"https://unpaced.example/a.json",
			"https://unpaced.example/b.json",
			"https://unpaced.example/c.json",
		];
		for (const clientId of clients) {
			harness.responders.set(clientId, () => noStoreMetadata(clientId));
		}

		await harness.authorize(clients[0] as string);
		await harness.authorize(clients[1] as string);
		now -= 1_000;
		expect((await harness.authorize(clients[2] as string)).location).toContain(
			"/consent",
		);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(3);
	});

	it("coalesces concurrent same-client resolutions into one fetch", async () => {
		const harness = await createGovernorHarness({
			minimumFetchInterval: 60,
		});
		const clientId = "https://coalesced.example/client.json";
		const response = deferred<Response>();
		harness.responders.set(clientId, () => response.promise);

		const first = harness.authorize(clientId);
		const second = harness.authorize(clientId);
		await vi.waitFor(() => {
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		});
		response.resolve(noStoreMetadata(clientId));

		expect((await first).location).toContain("/consent");
		expect((await second).location).toContain("/consent");
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);
	});

	it("rejects same-origin path spray and releases concurrency after success", async () => {
		const harness = await createGovernorHarness({
			minimumFetchInterval: 0,
			maximumConcurrentFetches: 4,
			maximumConcurrentFetchesPerOrigin: 1,
		});
		const firstClientId = "https://one-origin.example/a.json";
		const secondClientId = "https://one-origin.example/b.json";
		const firstResponse = deferred<Response>();
		harness.responders.set(firstClientId, () => firstResponse.promise);
		harness.responders.set(secondClientId, () =>
			noStoreMetadata(secondClientId),
		);

		const first = harness.authorize(firstClientId);
		await vi.waitFor(() => {
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		});
		expect((await harness.authorize(secondClientId)).status).toBe(429);

		firstResponse.resolve(noStoreMetadata(firstClientId));
		await first;
		expect((await harness.authorize(secondClientId)).location).toContain(
			"/consent",
		);
	});

	it("enforces the global concurrency cap and releases it after failure", async () => {
		const harness = await createGovernorHarness({
			minimumFetchInterval: 0,
			maximumConcurrentFetches: 1,
			maximumConcurrentFetchesPerOrigin: 1,
		});
		const firstClientId = "https://first-origin.example/a.json";
		const secondClientId = "https://second-origin.example/b.json";
		const firstResponse = deferred<Response>();
		harness.responders.set(firstClientId, () => firstResponse.promise);
		harness.responders.set(secondClientId, () =>
			noStoreMetadata(secondClientId),
		);

		const first = harness.authorize(firstClientId);
		await vi.waitFor(() => {
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		});
		expect((await harness.authorize(secondClientId)).status).toBe(429);

		firstResponse.reject(new Error("network failed"));
		expect((await first).status).toBeGreaterThanOrEqual(400);
		expect((await harness.authorize(secondClientId)).location).toContain(
			"/consent",
		);
	});

	it("enforces rolling one-minute global and per-origin budgets", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const harness = await createGovernorHarness({
			minimumFetchInterval: 0,
			maximumFetchesPerMinute: 2,
			maximumFetchesPerOriginPerMinute: 1,
		});
		const clients = [
			"https://budget-a.example/a.json",
			"https://budget-a.example/b.json",
			"https://budget-b.example/c.json",
			"https://budget-c.example/d.json",
		];
		for (const clientId of clients) {
			harness.responders.set(clientId, () => noStoreMetadata(clientId));
		}

		await harness.authorize(clients[0] as string);
		expect((await harness.authorize(clients[1] as string)).status).toBe(429);
		await harness.authorize(clients[2] as string);
		expect((await harness.authorize(clients[3] as string)).status).toBe(429);

		now += 60_000;
		expect((await harness.authorize(clients[3] as string)).location).toContain(
			"/consent",
		);
	});

	it("does not evict a live per-client minimum interval at capacity", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const harness = await createGovernorHarness(
			{ minimumFetchInterval: 60 },
			2,
		);
		const clients = [
			"https://bounded.example/a.json",
			"https://bounded.example/b.json",
			"https://bounded.example/c.json",
		];
		for (const clientId of clients) {
			harness.responders.set(clientId, () => noStoreMetadata(clientId));
		}

		await harness.authorize(clients[0] as string);
		await harness.authorize(clients[1] as string);
		expect((await harness.authorize(clients[2] as string)).status).toBe(429);
		expect((await harness.authorize(clients[0] as string)).status).toBe(429);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);

		now += 60_000;
		expect((await harness.authorize(clients[2] as string)).location).toContain(
			"/consent",
		);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(3);
	});

	it("does not evict a live per-origin budget at capacity", async () => {
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const harness = await createGovernorHarness(
			{
				minimumFetchInterval: 0,
				maximumFetchesPerOriginPerMinute: 1,
			},
			2,
		);
		const clients = [
			"https://origin-a.example/client.json",
			"https://origin-b.example/client.json",
			"https://origin-c.example/client.json",
		];
		for (const clientId of clients) {
			harness.responders.set(clientId, () => noStoreMetadata(clientId));
		}

		await harness.authorize(clients[0] as string);
		await harness.authorize(clients[1] as string);
		expect((await harness.authorize(clients[2] as string)).status).toBe(429);
		expect((await harness.authorize(clients[0] as string)).status).toBe(429);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);

		now += 60_000;
		expect((await harness.authorize(clients[2] as string)).location).toContain(
			"/consent",
		);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(3);
	});
});
