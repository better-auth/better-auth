import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cimd } from "./index";

const BASE_URL = "http://localhost:3188";
const REDIRECT_URI = "http://127.0.0.1:5188/callback";
const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

type MetadataResponder = (
	request: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

const responders = new Map<string, MetadataResponder>();

const metadataFetch = vi.fn(
	async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input.url;
		const responder = responders.get(url);
		if (!responder) throw new Error(`No metadata responder for ${url}`);
		return responder(input, init);
	},
);

const instance = await getTestInstance({
	baseURL: BASE_URL,
	plugins: [
		jwt(),
		oauthProvider({
			loginPage: "/login",
			consentPage: "/consent",
			allowDynamicClientRegistration: false,
			allowUnauthenticatedClientRegistration: false,
			scopes: ["openid"],
			silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
		}),
		cimd({
			refreshRate: 10,
			maxCacheEntries: 2,
			fetchMetadataDocument: metadataFetch,
		}),
	],
});

function metadata(clientId: string, clientName = "Cached Client") {
	return {
		client_id: clientId,
		client_name: clientName,
		redirect_uris: [REDIRECT_URI],
		application_type: "native",
		token_endpoint_auth_method: "none",
		grant_types: ["authorization_code"],
		response_types: ["code"],
	};
}

function jsonMetadataResponse(
	clientId: string,
	headers: Record<string, string>,
	clientName?: string,
) {
	return new Response(JSON.stringify(metadata(clientId, clientName)), {
		status: 200,
		headers: { "content-type": "application/json", ...headers },
	});
}

async function authorize(clientId: string) {
	const { headers } = await instance.signInWithTestUser();
	const client = createAuthClient({
		baseURL: BASE_URL,
		plugins: [oauthProviderClient()],
		fetchOptions: { customFetchImpl: instance.customFetchImpl, headers },
	});
	let status = 200;
	let location = "";
	await client.$fetch(
		`${BASE_URL}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(clientId)}` +
			"&response_type=code" +
			`&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
			"&scope=openid" +
			`&code_challenge=${PKCE_CHALLENGE}` +
			"&code_challenge_method=S256",
		{
			method: "GET",
			onError(context) {
				status = context.response.status;
				location = context.response.headers.get("location") ?? "";
			},
		},
	);
	return { status, location };
}

afterEach(() => {
	responders.clear();
	metadataFetch.mockClear();
	vi.restoreAllMocks();
});

describe("CIMD HTTP metadata cache", () => {
	it.each([
		{
			name: "wrong content type",
			clientId: "https://wrong-content-type.example/client.json",
			response: () =>
				new Response("not metadata", {
					status: 200,
					headers: { "content-type": "text/plain" },
				}),
		},
		{
			name: "oversized document",
			clientId: "https://oversized-document.example/client.json",
			response: () =>
				new Response("x".repeat(5 * 1024 + 1), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		},
		{
			name: "invalid JSON",
			clientId: "https://invalid-json.example/client.json",
			response: () =>
				new Response("{", {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		},
		{
			name: "redirect response",
			clientId: "https://redirect-response.example/client.json",
			response: () =>
				new Response(null, {
					status: 302,
					headers: { location: "https://other.example/client.json" },
				}),
		},
	])("rejects a $name before persistence", async ({ clientId, response }) => {
		responders.set(clientId, async () => response());
		expect((await authorize(clientId)).status).toBeGreaterThanOrEqual(400);
		const context = await instance.auth.$context;
		expect(
			await context.adapter.findOne({
				model: "oauthClient",
				where: [{ field: "clientId", value: clientId }],
			}),
		).toBeNull();
	});

	it("reuses a fresh response and caps max-age by refreshRate", async () => {
		const clientId = "https://fresh-cache.example/client.json";
		let now = 1_800_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		responders.set(clientId, async () =>
			jsonMetadataResponse(clientId, { "cache-control": "max-age=3600" }),
		);

		expect((await authorize(clientId)).location).toContain("/consent");
		now += 9_000;
		await authorize(clientId);
		expect(metadataFetch).toHaveBeenCalledTimes(1);

		now += 2_000;
		await authorize(clientId);
		expect(metadataFetch).toHaveBeenCalledTimes(2);
	});

	it("honors Expires freshness", async () => {
		const clientId = "https://expires-cache.example/client.json";
		const now = Date.now();
		responders.set(clientId, async () =>
			jsonMetadataResponse(clientId, {
				date: new Date(now).toUTCString(),
				expires: new Date(now + 5_000).toUTCString(),
			}),
		);

		await authorize(clientId);
		await authorize(clientId);
		expect(metadataFetch).toHaveBeenCalledTimes(1);
	});

	it("conditionally revalidates no-cache entries with ETag and accepts 304", async () => {
		const clientId = "https://etag-cache.example/client.json";
		let requestCount = 0;
		responders.set(clientId, async (_input, init) => {
			requestCount += 1;
			if (requestCount === 1) {
				return jsonMetadataResponse(clientId, {
					"cache-control": "no-cache",
					etag: '"metadata-v1"',
				});
			}
			expect(new Headers(init?.headers).get("if-none-match")).toBe(
				'"metadata-v1"',
			);
			return new Response(null, {
				status: 304,
				headers: { "cache-control": "max-age=60" },
			});
		});

		await authorize(clientId);
		expect((await authorize(clientId)).status).toBeLessThan(400);
		expect(metadataFetch).toHaveBeenCalledTimes(2);
		await authorize(clientId);
		expect(metadataFetch).toHaveBeenCalledTimes(2);
	});

	it("conditionally revalidates with Last-Modified", async () => {
		const clientId = "https://last-modified.example/client.json";
		const lastModified = "Wed, 29 Jul 2026 14:00:00 GMT";
		let requestCount = 0;
		responders.set(clientId, async (_input, init) => {
			requestCount += 1;
			if (requestCount === 1) {
				return jsonMetadataResponse(clientId, {
					"cache-control": "no-cache",
					"last-modified": lastModified,
				});
			}
			expect(new Headers(init?.headers).get("if-modified-since")).toBe(
				lastModified,
			);
			return new Response(null, { status: 304 });
		});

		await authorize(clientId);
		await authorize(clientId);
		expect(metadataFetch).toHaveBeenCalledTimes(2);
	});

	it("does not cache a no-store response", async () => {
		const clientId = "https://no-store.example/client.json";
		responders.set(clientId, async (_input, init) => {
			expect(new Headers(init?.headers).has("if-none-match")).toBe(false);
			return jsonMetadataResponse(clientId, {
				"cache-control": "no-store",
				etag: '"must-not-be-stored"',
			});
		});

		await authorize(clientId);
		await authorize(clientId);
		expect(metadataFetch).toHaveBeenCalledTimes(2);
	});

	it("evicts the least-recently-used entry at the configured bound", async () => {
		const clientIds = [
			"https://bounded-cache-a.example/client.json",
			"https://bounded-cache-b.example/client.json",
			"https://bounded-cache-c.example/client.json",
		];
		for (const clientId of clientIds) {
			responders.set(clientId, async () =>
				jsonMetadataResponse(clientId, { "cache-control": "max-age=60" }),
			);
		}

		for (const clientId of clientIds) await authorize(clientId);
		await authorize(clientIds[0] as string);
		expect(metadataFetch).toHaveBeenCalledTimes(4);
	});

	it("rejects a 304 without a validated cache entry", async () => {
		const clientId = "https://orphan-304.example/client.json";
		responders.set(clientId, async () => new Response(null, { status: 304 }));

		expect((await authorize(clientId)).status).toBeGreaterThanOrEqual(400);
		const context = await instance.auth.$context;
		expect(
			await context.adapter.findOne({
				model: "oauthClient",
				where: [{ field: "clientId", value: clientId }],
			}),
		).toBeNull();
	});

	it("fails closed on an invalid refresh while preserving DB and cache state", async () => {
		const clientId = "https://invalid-refresh.example/client.json";
		let requestCount = 0;
		responders.set(clientId, async () => {
			requestCount += 1;
			if (requestCount === 1) {
				return jsonMetadataResponse(
					clientId,
					{ "cache-control": "no-cache", etag: '"v1"' },
					"Original Client",
				);
			}
			if (requestCount === 2) {
				return new Response(
					JSON.stringify({
						...metadata(clientId, "Invalid Client"),
						application_type: "desktop",
					}),
					{
						status: 200,
						headers: {
							"content-type": "application/json",
							"cache-control": "max-age=60",
						},
					},
				);
			}
			return new Response(null, {
				status: 304,
				headers: { "cache-control": "max-age=60" },
			});
		});

		await authorize(clientId);
		expect((await authorize(clientId)).status).toBeGreaterThanOrEqual(400);
		const context = await instance.auth.$context;
		const storedAfterFailure = await context.adapter.findOne<{
			name: string;
		}>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
		expect(storedAfterFailure?.name).toBe("Original Client");

		expect((await authorize(clientId)).status).toBeLessThan(400);
		expect(metadataFetch).toHaveBeenCalledTimes(3);
	});

	it("fails closed on a network refresh and retries later", async () => {
		const clientId = "https://failed-refresh.example/client.json";
		let requestCount = 0;
		responders.set(clientId, async () => {
			requestCount += 1;
			if (requestCount === 1) {
				return jsonMetadataResponse(clientId, {
					"cache-control": "no-cache",
					etag: '"v1"',
				});
			}
			if (requestCount === 2) throw new TypeError("network unavailable");
			return new Response(null, {
				status: 304,
				headers: { "cache-control": "max-age=60" },
			});
		});

		await authorize(clientId);
		expect((await authorize(clientId)).status).toBeGreaterThanOrEqual(400);
		expect((await authorize(clientId)).status).toBeLessThan(400);
		expect(metadataFetch).toHaveBeenCalledTimes(3);
	});

	it("does not cache metadata when canonical persistence fails", async () => {
		const clientId = "https://persistence-failure.example/client.json";
		responders.set(clientId, async () =>
			jsonMetadataResponse(clientId, { "cache-control": "max-age=60" }),
		);
		const context = await instance.auth.$context;
		const originalTransaction = context.adapter.transaction.bind(
			context.adapter,
		);
		let rejectedClientWrite = false;
		vi.spyOn(context.adapter, "transaction").mockImplementation(
			async (callback) =>
				originalTransaction(async (transactionAdapter) => {
					const originalCreate =
						transactionAdapter.create.bind(transactionAdapter);
					const createSpy = vi
						.spyOn(transactionAdapter, "create")
						.mockImplementation(async (input) => {
							if (!rejectedClientWrite && input.model === "oauthClient") {
								rejectedClientWrite = true;
								throw new Error("forced client persistence failure");
							}
							return originalCreate(input);
						});
					try {
						return await callback(transactionAdapter);
					} finally {
						createSpy.mockRestore();
					}
				}),
		);

		expect((await authorize(clientId)).status).toBeGreaterThanOrEqual(400);
		expect((await authorize(clientId)).status).toBeLessThan(400);
		expect(metadataFetch).toHaveBeenCalledTimes(2);
	});
});
