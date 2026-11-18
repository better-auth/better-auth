import type { GenericEndpointContext } from "@better-auth/core";
import {
	CLIENT_ASSERTION_TYPE,
	signPrivateKeyJwtClientAssertion,
} from "@better-auth/core/oauth2";
import type {
	ClientMetadataResourceFetch,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cimd, createCimdClientDiscovery } from "./index";
import type { CimdOptions } from "./types";

const PKCE_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT_ID = "https://stale-client.example.com/client-metadata.json";
const JWKS_URI = "https://stale-client.example.com/jwks.json";
const REDIRECT_URI = "http://localhost:5390/callback";
const START_MS = Math.ceil(Date.now() / 1_000) * 1_000;

let instanceSequence = 0;

type Answer = (url: string, init?: RequestInit) => Response | Promise<Response>;

function clientDocument(overrides: Record<string, unknown> = {}) {
	return {
		client_id: CLIENT_ID,
		client_name: "Stale Client",
		redirect_uris: [REDIRECT_URI],
		token_endpoint_auth_method: "none",
		application_type: "native",
		grant_types: ["authorization_code"],
		response_types: ["code"],
		...overrides,
	};
}

/** Rejects with the abort reason once the plugin's fetch timeout fires. */
function untilAborted(init?: RequestInit): Promise<Response> {
	return new Promise((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
			once: true,
		});
	});
}

function withCode(message: string, code: string): Error {
	return Object.assign(new Error(message), { code });
}

async function createAuthorizationServer(options: Partial<CimdOptions> = {}) {
	instanceSequence += 1;
	const baseURL = `http://localhost:${3700 + instanceSequence}`;
	const transport = {
		answer: ((_url: string) => Response.json(clientDocument())) as Answer,
	};
	const fetchClientMetadataResource = vi.fn<ClientMetadataResourceFetch>(
		async (input, init) => {
			transportCallsInFlight += 1;
			try {
				return await transport.answer(String(input), init);
			} finally {
				transportCallsInFlight -= 1;
			}
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
				metadataRevalidationInterval: 0,
				metadataFetchPolicy: { minimumFetchInterval: 0 },
				fetchClientMetadataResource,
				...options,
			}),
		],
	});
	const { headers } = await instance.signInWithTestUser();
	const context = await instance.auth.$context;
	const authorize = async () => {
		const response = await instance.auth.handler(
			new Request(
				`${baseURL}/api/auth/oauth2/authorize?${new URLSearchParams({
					client_id: CLIENT_ID,
					response_type: "code",
					redirect_uri: REDIRECT_URI,
					scope: "openid",
					code_challenge: PKCE_CHALLENGE,
					code_challenge_method: "S256",
				})}`,
				{ headers },
			),
		);
		const location = response.headers.get("location");
		if (location) {
			const url = new URL(location, baseURL);
			return {
				pathname: url.pathname,
				search: url.search,
				error: url.searchParams.get("error"),
				errorDescription: url.searchParams.get("error_description"),
			};
		}
		const body = (await response.json()) as Record<string, string>;
		return {
			pathname: null,
			search: "",
			error: body.error,
			errorDescription: body.error_description,
		};
	};
	const findClient = () =>
		context.adapter.findOne<SchemaClient<Scope[]>>({
			model: "oauthClient",
			where: [{ field: "clientId", value: CLIENT_ID }],
		});
	return {
		...instance,
		baseURL,
		headers,
		context,
		transport,
		fetchClientMetadataResource,
		authorize,
		findClient,
		metadataFetchCount: () =>
			fetchClientMetadataResource.mock.calls.filter(
				([input]) => String(input) === CLIENT_ID,
			).length,
	};
}

let transportCallsInFlight = 0;

/**
 * Finishes a request that waits on fetch timeouts. Fake time moves only while
 * a transport call is pending, so the request's own async work runs in real
 * time without moving the clock.
 */
async function settle<T>(pending: Promise<T>): Promise<T> {
	let settled = false;
	void pending.then(
		() => {
			settled = true;
		},
		() => {
			settled = true;
		},
	);
	while (!settled) {
		if (transportCallsInFlight > 0) {
			await vi.advanceTimersByTimeAsync(1_000);
		} else {
			await new Promise((resolve) => setImmediate(resolve));
		}
	}
	return pending;
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11875
 */
describe("CIMD metadataStaleIfError", () => {
	it.each([
		{
			failure: "the fetch timeout",
			answer: (_url: string, init?: RequestInit) => untilAborted(init),
			reason: "Metadata document fetch timed out after 5000ms",
		},
		{
			failure: "HTTP 503",
			answer: () => new Response("unavailable", { status: 503 }),
			reason: "Metadata document fetch returned HTTP 503",
		},
		{
			failure: "a reset connection",
			answer: () => {
				throw new TypeError("fetch failed", {
					cause: withCode("socket hang up", "ECONNRESET"),
				});
			},
			reason:
				"Failed to fetch metadata document (network error or redirect blocked)",
		},
		{
			failure: "the runtime fetch's connect timeout",
			answer: () => {
				throw new TypeError("fetch failed", {
					cause: withCode("Connect Timeout Error", "UND_ERR_CONNECT_TIMEOUT"),
				});
			},
			reason:
				"Failed to fetch metadata document (network error or redirect blocked)",
		},
	])(
		"serves the stored client when a refresh fails with $failure",
		async ({ answer, reason }) => {
			const server = await createAuthorizationServer({
				metadataStaleIfError: "1h",
			});
			expect((await server.authorize()).pathname).toBe("/consent");
			const stored = await server.findClient();
			const warn = vi.spyOn(server.context.logger, "warn");
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			server.transport.answer = answer;

			const location = await settle(server.authorize());

			expect(location.pathname).toBe("/consent");
			expect(warn).toHaveBeenCalledWith(expect.stringContaining(CLIENT_ID));
			expect(warn).toHaveBeenCalledWith(expect.stringContaining(reason));
			expect(await server.findClient()).toEqual(stored);
		},
	);

	it("keeps today's error for a transient failure when the option is unset", async () => {
		const server = await createAuthorizationServer();
		await server.authorize();
		server.transport.answer = () => new Response(null, { status: 503 });

		const location = await server.authorize();

		expect(location.error).toBe("invalid_client");
		expect(location.errorDescription).toBe(
			"Metadata document fetch returned HTTP 503",
		);
	});

	it("serves the stored client from a new discovery with an empty cache", async () => {
		const request = await getTestInstance({
			baseURL: `http://localhost:${3700 + ++instanceSequence}`,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid"],
				}),
			],
		});
		const ctx = {
			context: await request.auth.$context,
		} as unknown as GenericEndpointContext;
		const created = await createCimdClientDiscovery({
			fetchClientMetadataResource: async () => Response.json(clientDocument()),
		}).resolve(ctx, CLIENT_ID, null);
		const failing = async () => new Response(null, { status: 502 });

		await expect(
			createCimdClientDiscovery({
				fetchClientMetadataResource: failing,
				metadataStaleIfError: 3_600,
			}).resolve(ctx, CLIENT_ID, created),
		).resolves.toBe(created);
		await expect(
			createCimdClientDiscovery({
				fetchClientMetadataResource: failing,
			}).resolve(ctx, CLIENT_ID, created),
		).rejects.toMatchObject({
			body: { error_description: "Metadata document fetch returned HTTP 502" },
		});
	});

	it("keeps today's error once the stored client is older than the bound", async () => {
		const server = await createAuthorizationServer({
			metadataStaleIfError: 60,
		});
		vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
		await server.authorize();
		server.transport.answer = () => new Response(null, { status: 503 });

		vi.setSystemTime(START_MS + 60_000);
		expect((await server.authorize()).pathname).toBe("/consent");

		vi.setSystemTime(START_MS + 61_000);
		const location = await server.authorize();
		expect(location.errorDescription).toBe(
			"Metadata document fetch returned HTTP 503",
		);
	});

	it.each([
		{
			failure: "HTTP 404",
			answer: () => new Response(null, { status: 404 }),
			description: "Metadata document fetch returned HTTP 404",
		},
		{
			failure: "HTTP 429",
			answer: () => new Response(null, { status: 429 }),
			description: "Metadata document fetch returned HTTP 429",
		},
		{
			failure: "a redirect",
			answer: () =>
				new Response(null, {
					status: 302,
					headers: { location: "https://elsewhere.example.com/" },
				}),
			description: "Metadata document fetch returned HTTP 302",
		},
		{
			failure: "invalid JSON",
			answer: () =>
				new Response("{", {
					headers: { "content-type": "application/json" },
				}),
			description: "Metadata document is not valid JSON",
		},
		{
			failure: "an unresolvable host",
			answer: () => {
				throw withCode("getaddrinfo ENOTFOUND", "ENOTFOUND");
			},
			description:
				"Failed to fetch metadata document (network error or redirect blocked)",
		},
		{
			failure: "a private-address refusal",
			answer: () => {
				throw new TypeError(
					"metadata hostname must resolve only to public-routable addresses",
				);
			},
			description:
				"Failed to fetch metadata document (network error or redirect blocked)",
		},
		{
			failure: "a private-address refusal that arrives after the timeout",
			answer: () =>
				new Promise<Response>((_resolve, reject) => {
					setTimeout(
						() =>
							reject(
								new TypeError(
									"metadata hostname must resolve only to public-routable addresses",
								),
							),
						5_100,
					);
				}),
			description: "Metadata document fetch timed out after 5000ms",
		},
		{
			failure: "an error a custom transport did not mark",
			answer: () => {
				throw new Error("custom transport failure");
			},
			description:
				"Failed to fetch metadata document (network error or redirect blocked)",
		},
	])("keeps today's error for $failure", async ({ answer, description }) => {
		for (const options of [{}, { metadataStaleIfError: "1h" }]) {
			const server = await createAuthorizationServer(options);
			await server.authorize();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			server.transport.answer = answer;

			const location = await settle(server.authorize());
			vi.useRealTimers();

			expect(location.error).toBe("invalid_client");
			expect(location.errorDescription).toBe(description);
		}
	});

	it("keeps today's error when the fetch policy refuses the URL", async () => {
		let allowed = true;
		for (const options of [{}, { metadataStaleIfError: "1h" }]) {
			allowed = true;
			const server = await createAuthorizationServer({
				...options,
				isMetadataDocumentUrlAllowed: () => allowed,
			});
			await server.authorize();
			allowed = false;

			const location = await server.authorize();

			expect(location.errorDescription).toBe(
				"client_id URL is not permitted by the server's fetch policy",
			);
		}
	});

	it("fetches the document of a client served this way at most once a minute", async () => {
		const server = await createAuthorizationServer({
			metadataStaleIfError: "1h",
		});
		vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
		await server.authorize();
		server.transport.answer = () => new Response(null, { status: 503 });

		expect((await server.authorize()).pathname).toBe("/consent");
		expect(server.metadataFetchCount()).toBe(2);
		for (const elapsedMs of [1_000, 30_000, 59_999]) {
			vi.setSystemTime(START_MS + elapsedMs);
			expect((await server.authorize()).pathname).toBe("/consent");
		}
		expect(server.metadataFetchCount()).toBe(2);

		vi.setSystemTime(START_MS + 60_000);
		expect((await server.authorize()).pathname).toBe("/consent");
		expect(server.metadataFetchCount()).toBe(3);
	});

	it("serves the stored client when the fetch limits refuse a client whose last fetch failed transiently", async () => {
		const server = await createAuthorizationServer({
			metadataStaleIfError: "1h",
			metadataFetchPolicy: { minimumFetchInterval: 120 },
		});
		vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
		await server.authorize();
		expect(server.metadataFetchCount()).toBe(1);
		server.transport.answer = () => new Response(null, { status: 503 });

		expect((await server.authorize()).pathname).toBe("/consent");
		expect(server.metadataFetchCount()).toBe(2);

		vi.setSystemTime(START_MS + 59_000);
		expect((await server.authorize()).pathname).toBe("/consent");
		expect(server.metadataFetchCount()).toBe(2);

		// The minimum interval refuses this attempt; without a stale client the
		// request would fail with temporarily_unavailable.
		vi.setSystemTime(START_MS + 60_000);
		expect((await server.authorize()).pathname).toBe("/consent");
		expect(server.metadataFetchCount()).toBe(2);

		vi.setSystemTime(START_MS + 120_000);
		expect((await server.authorize()).pathname).toBe("/consent");
		expect(server.metadataFetchCount()).toBe(3);

		// A successful fetch ends stale serving, so the next failure fetches.
		vi.setSystemTime(START_MS + 240_000);
		server.transport.answer = () => Response.json(clientDocument());
		expect((await server.authorize()).pathname).toBe("/consent");
		expect(server.metadataFetchCount()).toBe(4);
		server.transport.answer = () => new Response(null, { status: 503 });
		expect((await server.authorize()).pathname).toBe("/consent");
		expect(server.metadataFetchCount()).toBe(5);
	});

	it("keeps temporarily_unavailable for a fetch limit refusal when no transient failure preceded it", async () => {
		const server = await createAuthorizationServer({
			metadataStaleIfError: "1h",
			metadataFetchPolicy: {
				minimumFetchInterval: 120,
				maximumFetchesPerOriginPerMinute: 1,
			},
		});
		vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
		await server.authorize();

		const location = await server.authorize();

		expect(location.error).toBe("temporarily_unavailable");
		expect(location.errorDescription).toBe(
			"metadata fetch rate limit exceeded for client origin",
		);
	});

	/**
	 * The bound counts from `updatedAt`, so a successful revalidation must
	 * rewrite the row even when the document did not change.
	 */
	it("advances updatedAt on every successful revalidation, including HTTP 304", async () => {
		const server = await createAuthorizationServer({
			metadataStaleIfError: "1h",
		});
		vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
		server.transport.answer = (_url, init) =>
			new Headers(init?.headers).has("if-none-match")
				? new Response(null, { status: 304, headers: { etag: '"v1"' } })
				: Response.json(clientDocument(), {
						headers: { etag: '"v1"', "cache-control": "no-cache" },
					});
		await server.authorize();
		expect((await server.findClient())?.updatedAt?.getTime()).toBe(START_MS);

		vi.setSystemTime(START_MS + 10_000);
		await server.authorize();
		const revalidation = server.fetchClientMetadataResource.mock.calls.at(-1);
		expect(new Headers(revalidation?.[1]?.headers).get("if-none-match")).toBe(
			'"v1"',
		);
		expect((await server.findClient())?.updatedAt?.getTime()).toBe(
			START_MS + 10_000,
		);
	});

	it.each([
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		86_401,
		"25h",
		"-1s",
		"soon",
	])("rejects metadataStaleIfError %s when the plugin is created", (value) => {
		expect(() =>
			cimd({
				fetchClientMetadataResource: async () => Response.json({}),
				metadataStaleIfError: value,
			}),
		).toThrow(
			"cimd metadataStaleIfError must be a non-negative number of seconds or duration string of at most 24 hours",
		);
	});

	it.each([0, 86_400, "24h", "30m"])(
		"accepts metadataStaleIfError %s",
		(value) => {
			expect(() =>
				cimd({
					fetchClientMetadataResource: async () => Response.json({}),
					metadataStaleIfError: value,
				}),
			).not.toThrow();
		},
	);
});

/**
 * A client that authenticates with `private_key_jwt` also needs its
 * same-origin key set, which is often down whenever its metadata is.
 *
 * @see https://github.com/better-auth/better-auth/issues/11875
 */
describe("CIMD metadataStaleIfError for jwks_uri keys", () => {
	async function createKeyClientServer(options: Partial<CimdOptions>) {
		const { privateKey, publicKey } = (await crypto.subtle.generateKey(
			{
				name: "RSASSA-PKCS1-v1_5",
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: "SHA-256",
			},
			true,
			["sign", "verify"],
		)) as CryptoKeyPair;
		const privateKeyJwk = await crypto.subtle.exportKey("jwk", privateKey);
		const publicKeyJwk = await crypto.subtle.exportKey("jwk", publicKey);
		const server = await createAuthorizationServer({
			metadataRevalidationInterval: "1h",
			...options,
		});
		const keys = {
			answer: (() =>
				Response.json({
					keys: [{ ...publicKeyJwk, kid: "stale-key", alg: "RS256" }],
				})) as Answer,
		};
		server.transport.answer = (url, init) =>
			url === JWKS_URI
				? keys.answer(url, init)
				: Response.json(
						clientDocument({
							token_endpoint_auth_method: "private_key_jwt",
							jwks_uri: JWKS_URI,
						}),
					);
		const tokenEndpoint = `${server.baseURL}/api/auth/oauth2/token`;
		const exchangeCode = async () => {
			const authorization = await server.authorize();
			let callbackQuery = authorization.search;
			// Consent is asked only once; later requests redirect with a code.
			if (authorization.pathname === "/consent") {
				const consent = await server.auth.api.oauth2Consent({
					headers: server.headers,
					body: { accept: true, oauth_query: authorization.search.slice(1) },
				});
				callbackQuery = new URL(consent.url).search;
			}
			const code = new URLSearchParams(callbackQuery).get("code") ?? "";
			const assertion = await signPrivateKeyJwtClientAssertion({
				clientId: CLIENT_ID,
				tokenEndpoint,
				privateKeyJwk,
				kid: "stale-key",
				algorithm: "RS256",
			});
			return server.auth.handler(
				new Request(tokenEndpoint, {
					method: "POST",
					headers: { "content-type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({
						grant_type: "authorization_code",
						code,
						redirect_uri: REDIRECT_URI,
						client_id: CLIENT_ID,
						client_assertion_type: CLIENT_ASSERTION_TYPE,
						client_assertion: assertion,
						code_verifier: PKCE_VERIFIER,
					}),
				}),
			);
		};
		return { ...server, keys, exchangeCode };
	}

	it("exchanges a code after twice the key cache lifetime when the jwks_uri times out within the bound", async () => {
		const server = await createKeyClientServer({ metadataStaleIfError: "1h" });
		vi.useFakeTimers({
			toFake: ["setTimeout", "clearTimeout", "Date"],
			now: START_MS,
		});
		expect((await settle(server.exchangeCode())).status).toBe(200);

		vi.setSystemTime(START_MS + 11 * 60_000);
		server.keys.answer = (_url, init) => untilAborted(init);
		const response = await settle(server.exchangeCode());

		expect(response.status).toBe(200);
	});

	it.each([
		{
			case: "a terminal key fetch failure",
			options: { metadataStaleIfError: "1h" },
			answer: () => new Response(null, { status: 404 }),
		},
		{
			case: "a key fetch timeout when the option is unset",
			options: {},
			answer: (_url: string, init?: RequestInit) => untilAborted(init),
		},
	])(
		"rejects the exchange after twice the key cache lifetime on $case",
		async ({ options, answer }) => {
			const server = await createKeyClientServer(options);
			vi.useFakeTimers({
				toFake: ["setTimeout", "clearTimeout", "Date"],
				now: START_MS,
			});
			expect((await settle(server.exchangeCode())).status).toBe(200);

			vi.setSystemTime(START_MS + 11 * 60_000);
			server.keys.answer = answer;
			const response = await settle(server.exchangeCode());

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "invalid_client",
				error_description: "failed to fetch client JWKS",
			});
		},
	);
});
