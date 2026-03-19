import type {
	AcceptSignatureSignOptions,
	EthHttpSigner,
	ServerConfig,
	SignerClient,
} from "@slicekit/erc8128";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@slicekit/erc8128", async () => {
	const actual =
		await vi.importActual<typeof import("@slicekit/erc8128")>(
			"@slicekit/erc8128",
		);
	return {
		...actual,
		createSignerClient: vi.fn(),
	};
});

import { createSignerClient, formatKeyId } from "@slicekit/erc8128";
import type { CachedSignature, Erc8128SignatureStore } from "./client";
import { erc8128Client } from "./client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultAddress = "0x000000000000000000000000000000000000dEaD" as const;
const defaultChainId = 1;
const defaultKeyId = formatKeyId(defaultChainId, defaultAddress);
const BASE_URL = "http://localhost:3000/api/auth";

/** Default server config that allows replayable + class-bound. */
const REPLAYABLE_CONFIG: ServerConfig = {
	max_validity_sec: 300,
	route_policies: {
		default: { replayable: true, classBoundPolicies: ["@authority"] },
	},
};

/** Server config that disables replayable globally. */
const NON_REPLAYABLE_CONFIG: ServerConfig = {
	max_validity_sec: 300,
	route_policies: {
		default: { replayable: false },
	},
};

function createMockSigner(): EthHttpSigner {
	return {
		address: defaultAddress,
		chainId: defaultChainId,
		signMessage: vi.fn(async () => "0xdeadbeef" as `0x${string}`),
	};
}

function createMockStore(): Erc8128SignatureStore & {
	_map: Map<string, CachedSignature[]>;
} {
	const map = new Map<string, CachedSignature[]>();
	return {
		get: vi.fn((keyId: string) => map.get(keyId) ?? null),
		set: vi.fn((keyId: string, entries: CachedSignature[]) => {
			map.set(keyId, entries);
		}),
		delete: vi.fn((keyId: string) => {
			map.delete(keyId);
		}),
		_map: map,
	};
}

const DEFAULT_COMPONENTS = ["@method", "@target-uri", "@authority"];

function mockSignRequestFn(opts?: {
	expires?: number;
	created?: number;
	components?: string[];
}) {
	const created = opts?.created ?? Math.floor(Date.now() / 1000);
	const expires = opts?.expires ?? created + 300;

	return vi.fn(
		async (req: Request, signOptions?: AcceptSignatureSignOptions) => {
			const headers = new Headers(req.headers);
			const components = signOptions?.components?.length
				? signOptions.components
				: (opts?.components ?? DEFAULT_COMPONENTS);
			const componentStr = components.map((c) => `"${c}"`).join(" ");
			headers.set("signature", "sig1=:bW9jaw==:");
			headers.set(
				"signature-input",
				`sig1=(${componentStr});created=${created};expires=${expires};keyid="${defaultKeyId}"${signOptions?.replay === "non-replayable" ? ';nonce=\"nonce-1\"' : ""}`,
			);
			return new Request(req.url, { method: req.method, headers });
		},
	);
}

function mockRequestBoundSignRequestFn(opts?: {
	expires?: number;
	created?: number;
}) {
	const created = opts?.created ?? Math.floor(Date.now() / 1000);
	const expires = opts?.expires ?? created + 300;

	return vi.fn(
		async (req: Request, signOptions?: AcceptSignatureSignOptions) => {
			const headers = new Headers(req.headers);
			headers.set("signature", "sig1=:cmVxdWVzdA==:");
			headers.set(
				"signature-input",
				`sig1=("@method" "@target-uri" "@authority");created=${created};expires=${expires};keyid="${defaultKeyId}"${signOptions?.replay === "non-replayable" ? ';nonce=\"nonce-1\"' : ""}`,
			);
			return new Request(req.url, { method: req.method, headers });
		},
	);
}

/** The mock `setServerConfig` from the last `setupMockSignerClient` call. */
let mockSetServerConfig: ReturnType<typeof vi.fn>;

function setupMockSignerClient(signFn?: ReturnType<typeof mockSignRequestFn>) {
	const fn = signFn ?? mockSignRequestFn();
	mockSetServerConfig = vi.fn();
	vi.mocked(createSignerClient).mockReturnValue({
		signRequest: fn,
		signedFetch: vi.fn(),
		fetch: vi.fn(),
		setServerConfig: mockSetServerConfig,
	} as unknown as SignerClient);
	return fn;
}

async function setupPluginWithConfig(opts: {
	signer?: EthHttpSigner;
	storage?: Erc8128SignatureStore | false;
	config?: ServerConfig;
	signFn?: ReturnType<typeof mockSignRequestFn>;
	expiryMarginSec?: number;
	preferReplayable?: boolean;
	binding?: "request-bound" | "class-bound";
	components?: string[];
	ttlSeconds?: number;
	label?: string;
	contentDigest?: "auto" | "recompute" | "require" | "off";
}) {
	const signFn = setupMockSignerClient(opts.signFn);
	const plugin = erc8128Client({
		signer: opts.signer ?? createMockSigner(),
		storage: opts.storage === undefined ? false : opts.storage,
		expiryMarginSec: opts.expiryMarginSec,
		preferReplayable: opts.preferReplayable,
		binding: opts.binding,
		components: opts.components,
		ttlSeconds: opts.ttlSeconds,
		label: opts.label,
		contentDigest: opts.contentDigest,
	});

	if (opts.config && plugin.getActions) {
		const mockFetch = vi.fn().mockResolvedValue({ data: opts.config });
		plugin.getActions(mockFetch as never, {} as never, undefined);
		await vi.waitFor(() => {
			if (!mockFetch.mock.results[0]?.value) throw new Error("pending");
		});
		// flush microtask to let the .then() in getActions run
		await new Promise((r) => setTimeout(r, 0));
	}

	return { plugin, signFn };
}

function getInitHook(plugin: ReturnType<typeof erc8128Client>) {
	return plugin.fetchPlugins![0]!.init! as (
		url: string,
		fetchOptions?: Record<string, unknown>,
	) => Promise<{ url: string; options?: Record<string, unknown> }>;
}

async function runCustomFetch(
	result: { url: string; options?: Record<string, unknown> },
	url = `${BASE_URL}/session`,
) {
	const customFetchImpl = result.options?.customFetchImpl as
		| ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)
		| undefined;
	if (!customFetchImpl) {
		throw new Error("customFetchImpl missing");
	}
	return customFetchImpl(
		new Request(url, {
			method: (result.options?.method as string) || "GET",
			headers: result.options?.headers as HeadersInit,
			body: result.options?.body as BodyInit | undefined,
		}),
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("erc8128Client", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns type-only plugin when no signer is provided", () => {
		const plugin = erc8128Client();
		expect(plugin.id).toBe("erc8128");
		expect(plugin.fetchPlugins).toBeUndefined();
		expect(plugin.getActions).toBeUndefined();
	});

	it("returns plugin with fetchPlugins when signer is provided", () => {
		setupMockSignerClient();
		const plugin = erc8128Client({ signer: createMockSigner() });
		expect(plugin.id).toBe("erc8128");
		expect(plugin.fetchPlugins).toHaveLength(1);
		expect(plugin.getActions).toBeDefined();
	});

	describe("init hook — signing", () => {
		it("skips signing for /.well-known/erc8128", async () => {
			const { plugin, signFn } = await setupPluginWithConfig({});
			const init = getInitHook(plugin);

			await init("/.well-known/erc8128", {
				baseURL: BASE_URL,
				method: "GET",
			});

			expect(signFn).not.toHaveBeenCalled();
		});

		it("signs requests and injects Signature + Signature-Input", async () => {
			const { plugin, signFn } = await setupPluginWithConfig({});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
			});

			expect(signFn).toHaveBeenCalledOnce();
			const headers = result.options?.headers as Headers;
			expect(headers.get("signature")).toBeTruthy();
			expect(headers.get("signature-input")).toContain("expires=");
		});

		it("preserves original headers when adding signature", async () => {
			const { plugin } = await setupPluginWithConfig({});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
				headers: { "x-custom": "value" },
			});

			const headers = result.options?.headers as Headers;
			expect(headers.get("x-custom")).toBe("value");
			expect(headers.get("signature")).toBeTruthy();
		});

		it("passes the original request body to signRequest", async () => {
			let seenBody = "";
			const signFn = vi.fn(async (req: Request) => {
				seenBody = await req.clone().text();
				return new Request(req.url, {
					method: req.method,
					headers: req.headers,
				});
			});
			const { plugin } = await setupPluginWithConfig({ signFn });
			const init = getInitHook(plugin);

			await init("/session", {
				baseURL: BASE_URL,
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ hello: "world" }),
				duplex: "half",
			});

			expect(signFn).toHaveBeenCalledOnce();
			expect(seenBody).toBe('{"hello":"world"}');
		});

		it("skips signing when signer function returns null", async () => {
			const signFn = setupMockSignerClient();
			const plugin = erc8128Client({
				signer: () => null,
				storage: false,
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
			});

			expect(signFn).not.toHaveBeenCalled();
			expect(result.url).toBe("/session");
		});

		it("gracefully handles not parsable URL", async () => {
			const { plugin, signFn } = await setupPluginWithConfig({});
			const init = getInitHook(plugin);

			// No baseURL and relative path → invalid URL
			const result = await init("/session", {});

			expect(signFn).not.toHaveBeenCalled();
			expect(result.url).toBe("/session");
		});

		it("retries once on 401 with Accept-Signature", async () => {
			const signFn = mockSignRequestFn();
			const fetchImpl = vi
				.fn<
					(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
				>()
				.mockResolvedValueOnce(
					new Response(null, {
						status: 401,
						headers: {
							"accept-signature":
								'sig1=("@authority" "@method" "@path");keyid;created;expires;nonce',
						},
					}),
				)
				.mockResolvedValueOnce(new Response(null, { status: 200 }));
			const { plugin } = await setupPluginWithConfig({
				signFn,
				config: REPLAYABLE_CONFIG,
				preferReplayable: true,
				binding: "class-bound",
				components: ["@method"],
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
				customFetchImpl: fetchImpl,
			});
			const response = await runCustomFetch(result);

			expect(response.status).toBe(200);
			expect(fetchImpl).toHaveBeenCalledTimes(2);
			expect(signFn).toHaveBeenCalledTimes(2);
			expect(signFn.mock.calls[1]?.[1]).toMatchObject({
				binding: "request-bound",
				replay: "non-replayable",
			});
		});

		it("does not retry on 401 without Accept-Signature", async () => {
			const signFn = mockSignRequestFn();
			const fetchImpl = vi
				.fn<
					(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
				>()
				.mockResolvedValueOnce(new Response(null, { status: 401 }));
			const { plugin } = await setupPluginWithConfig({
				signFn,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
				customFetchImpl: fetchImpl,
			});
			const response = await runCustomFetch(result);

			expect(response.status).toBe(401);
			expect(fetchImpl).toHaveBeenCalledTimes(1);
			expect(signFn).toHaveBeenCalledTimes(1);
		});

		it("does not retry on non-401 responses even with Accept-Signature", async () => {
			const signFn = mockSignRequestFn();
			const fetchImpl = vi
				.fn<
					(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
				>()
				.mockResolvedValueOnce(
					new Response(null, {
						status: 403,
						headers: {
							"accept-signature":
								'sig1=("@authority" "@method" "@path");keyid;created;expires;nonce',
						},
					}),
				);
			const { plugin } = await setupPluginWithConfig({
				signFn,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
				customFetchImpl: fetchImpl,
			});
			const response = await runCustomFetch(result);

			expect(response.status).toBe(403);
			expect(fetchImpl).toHaveBeenCalledTimes(1);
			expect(signFn).toHaveBeenCalledTimes(1);
		});

		it("does not retry more than once", async () => {
			const signFn = mockSignRequestFn();
			const fetchImpl = vi
				.fn<
					(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
				>()
				.mockResolvedValueOnce(
					new Response(null, {
						status: 401,
						headers: {
							"accept-signature":
								'sig1=("@authority" "@method" "@path");keyid;created;expires;nonce',
						},
					}),
				)
				.mockResolvedValueOnce(
					new Response(null, {
						status: 401,
						headers: {
							"accept-signature":
								'sig1=("@authority" "@method" "@path");keyid;created;expires;nonce',
						},
					}),
				);
			const { plugin } = await setupPluginWithConfig({
				signFn,
				config: REPLAYABLE_CONFIG,
				preferReplayable: true,
				binding: "class-bound",
				components: ["@method"],
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
				customFetchImpl: fetchImpl,
			});
			const response = await runCustomFetch(result);

			expect(response.status).toBe(401);
			expect(fetchImpl).toHaveBeenCalledTimes(2);
			expect(signFn).toHaveBeenCalledTimes(2);
		});

		it("skips retry when Accept-Signature resolves to the attempted posture", async () => {
			const signFn = mockSignRequestFn();
			const fetchImpl = vi
				.fn<
					(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
				>()
				.mockResolvedValueOnce(
					new Response(null, {
						status: 401,
						headers: {
							"accept-signature":
								'sig1=("@authority" "@method" "@path");keyid;created;expires;nonce',
						},
					}),
				);
			const { plugin } = await setupPluginWithConfig({
				signFn,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
				customFetchImpl: fetchImpl,
			});
			const response = await runCustomFetch(result);

			expect(response.status).toBe(401);
			expect(fetchImpl).toHaveBeenCalledTimes(1);
			expect(signFn).toHaveBeenCalledTimes(1);
		});

		it("returns the original response when Accept-Signature is malformed", async () => {
			const signFn = mockSignRequestFn();
			const fetchImpl = vi
				.fn<
					(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
				>()
				.mockResolvedValueOnce(
					new Response(null, {
						status: 401,
						headers: { "accept-signature": "not-valid" },
					}),
				);
			const { plugin } = await setupPluginWithConfig({
				signFn,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
				customFetchImpl: fetchImpl,
			});
			const response = await runCustomFetch(result);

			expect(response.status).toBe(401);
			expect(fetchImpl).toHaveBeenCalledTimes(1);
			expect(signFn).toHaveBeenCalledTimes(1);
		});

		it("retry re-signs from the original request body and headers", async () => {
			const seenBodies: string[] = [];
			const signFn = vi.fn(
				async (req: Request, signOptions?: AcceptSignatureSignOptions) => {
					seenBodies.push(await req.clone().text());
					const headers = new Headers(req.headers);
					headers.set("signature", "sig1=:bW9jaw==:");
					headers.set(
						"signature-input",
						`sig1=("@authority" "@method" "@path" "content-digest");created=1;expires=301;keyid="${defaultKeyId}"${signOptions?.replay === "non-replayable" ? ';nonce=\"nonce-1\"' : ""}`,
					);
					return new Request(req.url, { method: req.method, headers });
				},
			);
			const fetchImpl = vi
				.fn<
					(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
				>()
				.mockResolvedValueOnce(
					new Response(null, {
						status: 401,
						headers: {
							"accept-signature":
								'sig1=("@authority" "@method" "@path" "content-digest");keyid;created;expires;nonce',
						},
					}),
				)
				.mockResolvedValueOnce(new Response(null, { status: 200 }));
			const { plugin } = await setupPluginWithConfig({
				signFn: signFn as ReturnType<typeof mockSignRequestFn>,
				config: REPLAYABLE_CONFIG,
				preferReplayable: true,
				binding: "class-bound",
				components: ["@method"],
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "POST",
				headers: { "content-type": "application/json", "x-custom": "yes" },
				body: JSON.stringify({ hello: "world" }),
				customFetchImpl: fetchImpl,
				duplex: "half",
			});
			await runCustomFetch(result, `${BASE_URL}/session`);

			expect(signFn).toHaveBeenCalledTimes(2);
			expect(seenBodies).toEqual(['{"hello":"world"}', '{"hello":"world"}']);
		});
	});

	describe("client configuration", () => {
		it("passes user options to createSignerClient", async () => {
			const { plugin } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: ["@method"],
				ttlSeconds: 120,
				label: "my-label",
				contentDigest: "auto",
			});
			const init = getInitHook(plugin);

			// Trigger client creation
			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(createSignerClient).toHaveBeenCalledWith(
				expect.objectContaining({
					address: defaultAddress,
					chainId: defaultChainId,
				}),
				expect.objectContaining({
					preferReplayable: true,
					binding: "class-bound",
					components: ["@method"],
					ttlSeconds: 120,
					label: "my-label",
					contentDigest: "auto",
				}),
			);
		});

		it("applies server config via setServerConfig", async () => {
			const { plugin } = await setupPluginWithConfig({
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(mockSetServerConfig).toHaveBeenCalledWith(
				"http://localhost:3000",
				REPLAYABLE_CONFIG,
			);
		});

		it("does not call setServerConfig when config has not loaded", async () => {
			const signFn = setupMockSignerClient();
			const plugin = erc8128Client({
				signer: createMockSigner(),
				storage: false,
			});
			// Do NOT call getActions → serverConfig stays null
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(signFn).toHaveBeenCalledOnce();
			expect(mockSetServerConfig).not.toHaveBeenCalled();
		});

		it("recreates signer client when address changes", async () => {
			let currentSigner = createMockSigner();
			setupMockSignerClient();
			const dynamicPlugin = erc8128Client({
				signer: () => currentSigner,
				storage: false,
			});
			const init = getInitHook(dynamicPlugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });
			expect(createSignerClient).toHaveBeenCalledTimes(1);

			// Change signer identity
			currentSigner = {
				...currentSigner,
				address: "0x0000000000000000000000000000000000001234",
			};

			await init("/session", { baseURL: BASE_URL, method: "GET" });
			expect(createSignerClient).toHaveBeenCalledTimes(2);
		});
	});

	describe("signature caching", () => {
		it("caches replayable signature as array in store", async () => {
			const store = createMockStore();
			const { plugin } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(store.set).toHaveBeenCalledOnce();
			const [key, entries] = (store.set as ReturnType<typeof vi.fn>).mock
				.calls[0]!;
			expect(key).toBe(defaultKeyId);
			expect(entries).toHaveLength(1);
			expect(entries[0].signature).toBeTruthy();
			expect(entries[0].signatureInput).toBeTruthy();
			expect(entries[0].expires).toBeTypeOf("number");
			expect(entries[0].components).toEqual(DEFAULT_COMPONENTS);
		});

		it("does not cache when server disables replayable", async () => {
			const store = createMockStore();
			const { plugin } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: NON_REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(store.set).not.toHaveBeenCalled();
		});

		it("does not cache when preferReplayable is false", async () => {
			const store = createMockStore();
			const { plugin } = await setupPluginWithConfig({
				// preferReplayable defaults to false
				binding: "class-bound",
				components: [],
				storage: store,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(store.set).not.toHaveBeenCalled();
		});

		it("caches replayable signatures even when request-bound", async () => {
			const store = createMockStore();
			const { plugin } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "request-bound",
				storage: store,
				config: REPLAYABLE_CONFIG,
				signFn: mockRequestBoundSignRequestFn(),
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(store.set).toHaveBeenCalled();
		});

		it("does not cache per-route replayable: false override", async () => {
			const store = createMockStore();
			const { plugin } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: {
					max_validity_sec: 300,
					route_policies: {
						default: {
							replayable: true,
							classBoundPolicies: ["@authority"],
						},
						"/erc8128/invalidate": {
							methods: ["POST"],
							replayable: false,
						},
					},
				},
			});
			const init = getInitHook(plugin);

			await init("/erc8128/invalidate", {
				baseURL: BASE_URL,
				method: "POST",
			});

			expect(store.set).not.toHaveBeenCalled();
		});

		it("does not cache wildcard route override", async () => {
			const store = createMockStore();
			const { plugin } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: {
					max_validity_sec: 300,
					route_policies: {
						default: {
							replayable: true,
							classBoundPolicies: ["@authority"],
						},
						"/admin/*": {
							methods: ["GET"],
							replayable: false,
						},
					},
				},
			});
			const init = getInitHook(plugin);

			await init("/admin/users", { baseURL: BASE_URL, method: "GET" });

			expect(store.set).not.toHaveBeenCalled();
		});

		it("resolves route policy against the auth-relative path for custom basePath deployments", async () => {
			const store = createMockStore();
			const { plugin } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: {
					max_validity_sec: 300,
					route_policies: {
						"/session": {
							methods: ["GET"],
							replayable: true,
							classBoundPolicies: ["@authority"],
						},
					},
				},
			});
			const init = getInitHook(plugin);

			await init("/session", {
				baseURL: "http://localhost:3000/custom-auth",
				method: "GET",
			});

			expect(store.set).toHaveBeenCalledOnce();
		});

		it("uses cached signature on second request (skips signRequest)", async () => {
			const store = createMockStore();
			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			// First request — signs and caches
			await init("/session", { baseURL: BASE_URL, method: "GET" });
			expect(signFn).toHaveBeenCalledOnce();

			// Second request — uses cache
			signFn.mockClear();
			const result = await init("/other", {
				baseURL: BASE_URL,
				method: "GET",
			});

			expect(signFn).not.toHaveBeenCalled();
			const headers = result.options?.headers as Headers;
			expect(headers.get("signature")).toBe("sig1=:bW9jaw==:");
		});

		it("reuses cached request-bound signatures only for the same request", async () => {
			const store = createMockStore();
			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "request-bound",
				storage: store,
				config: REPLAYABLE_CONFIG,
				signFn: mockRequestBoundSignRequestFn(),
			});
			const init = getInitHook(plugin);

			await init("/session?tab=profile", {
				baseURL: BASE_URL,
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ hello: "world" }),
			});
			expect(signFn).toHaveBeenCalledOnce();

			signFn.mockClear();
			const result = await init("/session?tab=profile", {
				baseURL: BASE_URL,
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ hello: "world" }),
			});

			expect(signFn).not.toHaveBeenCalled();
			const headers = result.options?.headers as Headers;
			expect(headers.get("signature")).toBe("sig1=:cmVxdWVzdA==:");
		});

		it("does not reuse cached request-bound signatures for a different request body", async () => {
			const store = createMockStore();
			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "request-bound",
				storage: store,
				config: REPLAYABLE_CONFIG,
				signFn: mockRequestBoundSignRequestFn(),
			});
			const init = getInitHook(plugin);

			await init("/session", {
				baseURL: BASE_URL,
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ hello: "world" }),
			});
			expect(signFn).toHaveBeenCalledOnce();

			signFn.mockClear();
			await init("/session", {
				baseURL: BASE_URL,
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ hello: "mars" }),
			});

			expect(signFn).toHaveBeenCalledOnce();
		});

		it("prunes expired entries and signs fresh", async () => {
			const store = createMockStore();
			const expiredCreated = Math.floor(Date.now() / 1000) - 600;
			const expiredExpires = expiredCreated + 300; // expired 300s ago

			// Pre-populate cache with expired signature
			store._map.set(defaultKeyId, [
				{
					signature: "old-sig",
					signatureInput: "old-input",
					expires: expiredExpires,
					components: DEFAULT_COMPONENTS,
				},
			]);

			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			// All entries expired → delete then sign fresh and save new array
			expect(store.delete).toHaveBeenCalledWith(defaultKeyId);
			expect(signFn).toHaveBeenCalledOnce();
			// New entry was cached
			const saved = store._map.get(defaultKeyId);
			expect(saved).toHaveLength(1);
			expect(saved![0]!.signature).toBe("sig1=:bW9jaw==:");
		});

		it("considers expiryMarginSec when checking cache", async () => {
			const store = createMockStore();
			const now = Math.floor(Date.now() / 1000);

			// Signature expires in 5 seconds — within a 10s margin
			store._map.set(defaultKeyId, [
				{
					signature: "almost-expired-sig",
					signatureInput: "almost-expired-input",
					expires: now + 5,
					components: DEFAULT_COMPONENTS,
				},
			]);

			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: REPLAYABLE_CONFIG,
				expiryMarginSec: 10,
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			// Within margin — should sign fresh
			expect(signFn).toHaveBeenCalledOnce();
		});
	});

	describe("class-bound component filtering", () => {
		it("uses cached signature when components satisfy route policy", async () => {
			const store = createMockStore();
			const now = Math.floor(Date.now() / 1000);

			store._map.set(defaultKeyId, [
				{
					signature: "cached-sig",
					signatureInput: `sig1=("@method" "@authority");created=${now};expires=${now + 300}`,
					expires: now + 300,
					components: ["@method", "@authority"],
				},
			]);

			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: {
					max_validity_sec: 300,
					route_policies: {
						"/session": {
							methods: ["GET"],
							replayable: true,
							classBoundPolicies: ["@method", "@authority"],
						},
					},
				},
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
			});

			// Cache hit — no fresh sign
			expect(signFn).not.toHaveBeenCalled();
			const headers = result.options?.headers as Headers;
			expect(headers.get("signature")).toBe("cached-sig");
		});

		it("appends fresh sig when no cached entry matches route components", async () => {
			const store = createMockStore();
			const now = Math.floor(Date.now() / 1000);

			// Cached signature covers @method + @authority only
			store._map.set(defaultKeyId, [
				{
					signature: "cached-sig",
					signatureInput: `sig1=("@method" "@authority");created=${now};expires=${now + 300}`,
					expires: now + 300,
					components: ["@method", "@authority"],
				},
			]);

			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: {
					max_validity_sec: 300,
					route_policies: {
						// Route requires @method + @authority + @target-uri
						"/session": {
							methods: ["GET"],
							replayable: true,
							classBoundPolicies: ["@method", "@authority", "@target-uri"],
						},
					},
				},
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			// Signs fresh and appends to the existing entries
			expect(signFn).toHaveBeenCalledOnce();
			expect(store.delete).not.toHaveBeenCalled();
			const saved = store._map.get(defaultKeyId)!;
			expect(saved).toHaveLength(2);
			expect(saved[0]!.signature).toBe("cached-sig"); // original preserved
			expect(saved[1]!.signature).toBe("sig1=:bW9jaw==:"); // fresh appended
		});

		it("treats semantically equivalent class-bound entries as interchangeable", async () => {
			const store = createMockStore();
			const now = Math.floor(Date.now() / 1000);

			store._map.set(defaultKeyId, [
				{
					signature: "sig-method-only",
					signatureInput: `sig1=("@method");created=${now};expires=${now + 300}`,
					expires: now + 300,
					components: ["@method"],
				},
				{
					signature: "sig-method-authority",
					signatureInput: `sig1=("@method" "@authority");created=${now};expires=${now + 300}`,
					expires: now + 300,
					components: ["@method", "@authority"],
				},
			]);

			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: {
					max_validity_sec: 300,
					route_policies: {
						"/session": {
							methods: ["GET"],
							replayable: true,
							classBoundPolicies: ["@method", "@authority"],
						},
					},
				},
			});
			const init = getInitHook(plugin);

			const result = await init("/session", {
				baseURL: BASE_URL,
				method: "GET",
			});

			expect(signFn).not.toHaveBeenCalled();
			const headers = result.options?.headers as Headers;
			expect(headers.get("signature")).toBe("sig-method-only");
		});

		it("accepts cached sig when it satisfies default classBoundPolicies", async () => {
			const store = createMockStore();
			const now = Math.floor(Date.now() / 1000);

			// Cached sig covers @authority — matches REPLAYABLE_CONFIG default
			store._map.set(defaultKeyId, [
				{
					signature: "cached-sig",
					signatureInput: `sig1=("@authority");created=${now};expires=${now + 300}`,
					expires: now + 300,
					components: ["@authority"],
				},
			]);

			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: REPLAYABLE_CONFIG,
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(signFn).not.toHaveBeenCalled();
		});

		it("signs fresh when resolvePosture selects a different class-bound policy", async () => {
			const store = createMockStore();
			const now = Math.floor(Date.now() / 1000);

			// Cached covers @method + @authority
			store._map.set(defaultKeyId, [
				{
					signature: "cached-sig",
					signatureInput: `sig1=("@method" "@authority");created=${now};expires=${now + 300}`,
					expires: now + 300,
					components: ["@method", "@authority"],
				},
			]);

			const { plugin, signFn } = await setupPluginWithConfig({
				preferReplayable: true,
				binding: "class-bound",
				components: [],
				storage: store,
				config: {
					max_validity_sec: 300,
					route_policies: {
						"/session": {
							methods: ["GET"],
							replayable: true,
							// list-of-lists: first requires @method+@target-uri,
							// second requires @method+@authority — cached satisfies second
							classBoundPolicies: [
								["@method", "@target-uri"],
								["@method", "@authority"],
							] as string[] | string[][],
						},
					},
				},
			});
			const init = getInitHook(plugin);

			await init("/session", { baseURL: BASE_URL, method: "GET" });

			expect(signFn).toHaveBeenCalledOnce();
		});
	});

	describe("getActions", () => {
		it("fetches server config from /.well-known/erc8128", async () => {
			setupMockSignerClient();
			const plugin = erc8128Client({ signer: createMockSigner() });

			const mockFetch = vi.fn().mockResolvedValue({
				data: {
					max_validity_sec: 300,
				},
			});

			plugin.getActions!(mockFetch as never, {} as never, undefined);
			await new Promise((r) => setTimeout(r, 0));

			expect(mockFetch).toHaveBeenCalledWith("/.well-known/erc8128", {
				method: "GET",
			});
		});

		it("clearSignatureCache removes all cached signatures", async () => {
			const store = createMockStore();
			store._map.set(defaultKeyId, [
				{
					signature: "cached",
					signatureInput: "input",
					expires: 0,
					components: [],
				},
			]);

			setupMockSignerClient();
			const plugin = erc8128Client({
				signer: createMockSigner(),
				storage: store,
			});

			const actions = plugin.getActions!(
				vi.fn().mockResolvedValue({}) as never,
				{} as never,
				undefined,
			);

			await actions.clearSignatureCache();

			expect(store.delete).toHaveBeenCalledWith(defaultKeyId);
		});
	});
});
