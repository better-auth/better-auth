import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { cimd } from "./index";

const mocks = vi.hoisted(() => ({
	lookup: vi.fn(),
	request: vi.fn(),
}));

vi.mock(import("node:dns/promises"), () => ({ lookup: mocks.lookup }));
vi.mock(import("node:https"), () => ({ request: mocks.request }));

import { fetchClientMetadataResource } from "./node";

interface MockLookupAddress {
	address: string;
	family: number;
}

interface MockResponseOptions {
	body?: string;
	headers?: Record<string, string>;
	lookupOptions?: { all?: boolean };
	onLookup?: (result: string | MockLookupAddress[], family?: number) => void;
	status?: number;
	statusMessage?: string;
}

function mockHttpsResponse(options: MockResponseOptions = {}) {
	mocks.request.mockImplementation(
		(
			_url: URL,
			requestOptions: {
				lookup: (
					hostname: string,
					lookupOptions: { all?: boolean },
					callback: (
						error: Error | null,
						result: string | MockLookupAddress[],
						family?: number,
					) => void,
				) => void;
			},
			onResponse: (response: Readable) => void,
		) => {
			const request = new EventEmitter() as EventEmitter & {
				end: () => void;
				destroy: (error?: Error) => void;
			};
			request.end = () => {
				requestOptions.lookup(
					"client.example.com",
					options.lookupOptions ?? {},
					(error, result, family) => {
						if (error) {
							request.emit("error", error);
							return;
						}
						options.onLookup?.(result, family);

						if (options.lookupOptions?.all && !Array.isArray(result)) {
							request.emit("error", new TypeError("Invalid IP address"));
							return;
						}

						const response = Readable.from([
							Buffer.from(options.body ?? "metadata"),
						]) as Readable & {
							headers: Record<string, string>;
							statusCode: number;
							statusMessage: string;
						};
						response.headers = options.headers ?? {
							"content-type": "application/json",
						};
						response.statusCode = options.status ?? 200;
						response.statusMessage = options.statusMessage ?? "OK";
						// Node emits the response event after the request executor returns.
						setImmediate(() => onResponse(response));
					},
				);
			};
			request.destroy = (error) => {
				if (error) request.emit("error", error);
			};
			return request;
		},
	);
}

describe("Node CIMD metadata transport", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/11423
	 */
	describe("DNS resolution and the caller's abort signal", () => {
		it("rejects immediately when the signal is already aborted", async () => {
			mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
			const controller = new AbortController();
			controller.abort(new Error("deadline exceeded"));

			await expect(
				fetchClientMetadataResource("https://client.example.com/client.json", {
					signal: controller.signal,
				}),
			).rejects.toThrow("deadline exceeded");
			expect(mocks.lookup).not.toHaveBeenCalled();
			expect(mocks.request).not.toHaveBeenCalled();
		});

		it("rejects an IP-literal host before connecting when the signal is already aborted", async () => {
			mockHttpsResponse();
			const controller = new AbortController();
			controller.abort(new Error("deadline exceeded"));

			await expect(
				fetchClientMetadataResource("https://93.184.216.34/client.json", {
					signal: controller.signal,
				}),
			).rejects.toThrow("deadline exceeded");
			expect(mocks.lookup).not.toHaveBeenCalled();
			expect(mocks.request).not.toHaveBeenCalled();
		});

		it("stops awaiting a stalled lookup when the signal aborts mid-resolution", async () => {
			let resolveLookup:
				| ((addresses: { address: string; family: number }[]) => void)
				| undefined;
			mocks.lookup.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveLookup = resolve;
					}),
			);
			const controller = new AbortController();

			const pending = fetchClientMetadataResource(
				"https://client.example.com/client.json",
				{ signal: controller.signal },
			);
			controller.abort(new Error("deadline exceeded"));

			await expect(pending).rejects.toThrow("deadline exceeded");
			expect(mocks.request).not.toHaveBeenCalled();

			// the outstanding lookup settles in the background without unhandled
			// rejection; its result is discarded
			resolveLookup?.([{ address: "93.184.216.34", family: 4 }]);
			await new Promise((resolve) => setImmediate(resolve));
			expect(mocks.request).not.toHaveBeenCalled();
		});

		it("releases the lookup slot when an abandoned lookup fails late", async () => {
			let rejectLookup: ((error: Error) => void) | undefined;
			mocks.lookup.mockImplementationOnce(
				() =>
					new Promise((_resolve, reject) => {
						rejectLookup = reject;
					}),
			);
			const controller = new AbortController();

			const pending = fetchClientMetadataResource(
				"https://client.example.com/client.json",
				{ signal: controller.signal },
			);
			controller.abort(new Error("deadline exceeded"));
			await expect(pending).rejects.toThrow("deadline exceeded");

			rejectLookup?.(
				Object.assign(new Error("timeout"), { code: "EAI_AGAIN" }),
			);
			await new Promise((resolve) => setImmediate(resolve));
			expect(mocks.request).not.toHaveBeenCalled();

			mocks.lookup.mockResolvedValueOnce([
				{ address: "93.184.216.34", family: 4 },
			]);
			mockHttpsResponse({ body: "ok" });
			const response = await fetchClientMetadataResource(
				"https://client.example.com/client.json",
			);
			expect(await response.text()).toBe("ok");
		});

		it("caps outstanding resolver work even after callers abort", async () => {
			const resolveLookups: Array<
				(addresses: { address: string; family: number }[]) => void
			> = [];
			mocks.lookup.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveLookups.push(resolve);
					}),
			);

			for (let i = 0; i < 16; i++) {
				const controller = new AbortController();
				const pending = fetchClientMetadataResource(
					"https://client.example.com/client.json",
					{ signal: controller.signal },
				);
				controller.abort(new Error("deadline exceeded"));
				await expect(pending).rejects.toThrow("deadline exceeded");
			}
			expect(mocks.lookup).toHaveBeenCalledTimes(16);
			await expect(
				fetchClientMetadataResource("https://client.example.com/client.json"),
			).rejects.toMatchObject({
				message: "metadata DNS lookup limit exceeded",
				code: "ERR_CIMD_DNS_LOOKUP_LIMIT",
			});
			expect(mocks.lookup).toHaveBeenCalledTimes(16);
			mockHttpsResponse();
			await expect(
				fetchClientMetadataResource("https://93.184.216.34/client.json"),
			).resolves.toBeInstanceOf(Response);

			for (const resolve of resolveLookups) {
				resolve([{ address: "93.184.216.34", family: 4 }]);
			}
			await new Promise((resolve) => setImmediate(resolve));
			mocks.lookup.mockResolvedValueOnce([
				{ address: "93.184.216.34", family: 4 },
			]);
			mockHttpsResponse();
			await expect(
				fetchClientMetadataResource("https://client.example.com/client.json"),
			).resolves.toBeInstanceOf(Response);
			expect(mocks.lookup).toHaveBeenCalledTimes(17);
		});

		it("cleans up the abort listener when the lookup settles first", async () => {
			mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
			mockHttpsResponse({ body: "ok" });
			const controller = new AbortController();
			const addListener = vi.spyOn(controller.signal, "addEventListener");
			const removeListener = vi.spyOn(controller.signal, "removeEventListener");

			const response = await fetchClientMetadataResource(
				"https://client.example.com/client.json",
				{ signal: controller.signal },
			);
			expect(await response.text()).toBe("ok");
			const removed = removeListener.mock.calls.find(
				([type]) => type === "abort",
			)?.[1];
			expect(removed).toBeDefined();
			expect(addListener).toHaveBeenCalledWith("abort", removed, {
				once: true,
			});
		});

		it("frees the plugin's fetch slot when its deadline aborts a stalled lookup", async () => {
			const baseURL = "http://localhost:3471";
			const { customFetchImpl, signInWithTestUser } = await getTestInstance({
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
						metadataFetchPolicy: {
							maximumConcurrentFetches: 1,
							minimumFetchInterval: 0,
						},
					}),
				],
			});
			const { headers } = await signInWithTestUser();
			const authorize = (clientId: string) =>
				customFetchImpl(
					`${baseURL}/api/auth/oauth2/authorize?${new URLSearchParams({
						client_id: clientId,
						response_type: "code",
						redirect_uri: "http://127.0.0.1:5199/callback",
						scope: "openid",
						code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
						code_challenge_method: "S256",
					})}`,
					{ headers },
				);
			let resolveStalledLookup:
				| ((addresses: { address: string; family: number }[]) => void)
				| undefined;
			mocks.lookup.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveStalledLookup = resolve;
					}),
			);
			const healthyClientId = "https://healthy.example.com/client.json";
			mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
			mockHttpsResponse({
				body: JSON.stringify({
					client_id: healthyClientId,
					client_name: "Healthy Client",
					redirect_uris: ["http://127.0.0.1:5199/callback"],
					application_type: "native",
					token_endpoint_auth_method: "none",
				}),
			});

			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				const stalled = authorize("https://stalled.example.com/client.json");
				await vi.waitFor(() => expect(mocks.lookup).toHaveBeenCalledTimes(1));
				await vi.advanceTimersByTimeAsync(5_000);
				const stalledResponse = await stalled;
				expect(stalledResponse.status).toBeGreaterThanOrEqual(400);
				expect(JSON.stringify(await stalledResponse.json())).toContain(
					"timed out",
				);
			} finally {
				vi.useRealTimers();
			}

			const healthy = await authorize(healthyClientId);
			expect(healthy.headers.get("location")).toContain("/consent");

			resolveStalledLookup?.([{ address: "93.184.216.34", family: 4 }]);
		});

		it("answers a fetch refused at the lookup limit as temporarily unavailable without pacing the client", async () => {
			const baseURL = "http://localhost:3472";
			const { customFetchImpl, signInWithTestUser } = await getTestInstance({
				baseURL,
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						scopes: ["openid"],
					}),
					cimd({ fetchClientMetadataResource }),
				],
			});
			const { headers } = await signInWithTestUser();
			const clientId = "https://healthy.example.com/client.json";
			const authorize = () =>
				customFetchImpl(
					`${baseURL}/api/auth/oauth2/authorize?${new URLSearchParams({
						client_id: clientId,
						response_type: "code",
						redirect_uri: "http://127.0.0.1:5199/callback",
						scope: "openid",
						code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
						code_challenge_method: "S256",
					})}`,
					{ headers },
				);
			const resolveLookups: Array<
				(addresses: { address: string; family: number }[]) => void
			> = [];
			mocks.lookup.mockReset();
			mocks.lookup.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveLookups.push(resolve);
					}),
			);
			for (let i = 0; i < 16; i++) {
				const controller = new AbortController();
				const pending = fetchClientMetadataResource(
					"https://stalled.example.com/client.json",
					{ signal: controller.signal },
				);
				controller.abort(new Error("deadline exceeded"));
				await expect(pending).rejects.toThrow("deadline exceeded");
			}

			const refused = await authorize();
			expect(refused.status).toBe(429);
			expect(await refused.json()).toMatchObject({
				error: "temporarily_unavailable",
				error_description: "metadata DNS lookup capacity exceeded",
			});
			expect(mocks.lookup).toHaveBeenCalledTimes(16);

			for (const resolve of resolveLookups) {
				resolve([{ address: "93.184.216.34", family: 4 }]);
			}
			await new Promise((resolve) => setImmediate(resolve));
			mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
			mockHttpsResponse({
				body: JSON.stringify({
					client_id: clientId,
					client_name: "Healthy Client",
					redirect_uris: ["http://127.0.0.1:5199/callback"],
					application_type: "native",
					token_endpoint_auth_method: "none",
				}),
			});

			const healthy = await authorize();
			expect(healthy.headers.get("location")).toContain("/consent");
			expect(mocks.lookup).toHaveBeenCalledTimes(17);
		});
	});

	it("rejects private DNS answers before opening a connection", async () => {
		mocks.lookup.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "127.0.0.1", family: 4 },
		]);

		await expect(
			fetchClientMetadataResource("https://client.example.com/client.json"),
		).rejects.toThrow("public");
		expect(mocks.request).not.toHaveBeenCalled();
	});

	it("rejects a private IPv6 literal host without a lookup", async () => {
		await expect(
			fetchClientMetadataResource("https://[fd00::1]/client.json"),
		).rejects.toThrow("public");
		expect(mocks.lookup).not.toHaveBeenCalled();
		expect(mocks.request).not.toHaveBeenCalled();
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc3986#section-3.2.2
	 * @see https://datatracker.ietf.org/doc/html/rfc6066#section-3
	 */
	it("pins a public IPv6 literal host without a lookup and sends no SNI", async () => {
		let pinned: { address: string; family?: number } | undefined;
		mockHttpsResponse({
			body: "ok",
			onLookup: (result, family) => {
				pinned = { address: result as string, family };
			},
		});

		const response = await fetchClientMetadataResource(
			"https://[2606:2800:220:1:248:1893:25c8:1946]/client.json",
		);
		expect(await response.text()).toBe("ok");
		expect(mocks.lookup).not.toHaveBeenCalled();
		expect(pinned).toEqual({
			address: "2606:2800:0220:0001:0248:1893:25c8:1946",
			family: 6,
		});
		const options = mocks.request.mock.calls[0]?.[1] as {
			headers: Record<string, string>;
			servername?: string;
		};
		expect(options.servername).toBeUndefined();
		expect(options.headers.host).toBe("[2606:2800:220:1:248:1893:25c8:1946]");
	});

	it("resolves once, pins an approved address, and preserves Host and TLS SNI", async () => {
		mocks.lookup.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
		]);
		let pinnedAddress: string | undefined;
		mockHttpsResponse({ body: "ok" });
		mocks.request.mockImplementationOnce(
			(
				url: URL,
				options: {
					agent: boolean;
					headers: Record<string, string>;
					lookup: (
						hostname: string,
						options: object,
						callback: (
							error: Error | null,
							address: string,
							family: number,
						) => void,
					) => void;
					servername: string;
				},
				onResponse: (response: Readable) => void,
			) => {
				const request = new EventEmitter() as EventEmitter & {
					end: () => void;
					destroy: (error?: Error) => void;
				};
				request.end = () => {
					options.lookup(url.hostname, {}, (_error, address) => {
						pinnedAddress = address;
						const response = Readable.from([Buffer.from("ok")]) as Readable & {
							headers: Record<string, string>;
							statusCode: number;
							statusMessage: string;
						};
						response.headers = { "content-type": "text/plain" };
						response.statusCode = 200;
						response.statusMessage = "OK";
						onResponse(response);
					});
				};
				request.destroy = () => {};
				expect(options.servername).toBe("client.example.com");
				expect(options.agent).toBe(false);
				expect(options.headers.host).toBe("client.example.com");
				return request;
			},
		);

		const response = await fetchClientMetadataResource(
			"https://client.example.com/client.json",
		);
		expect(await response.text()).toBe("ok");
		expect(mocks.lookup).toHaveBeenCalledTimes(1);
		expect(mocks.lookup).toHaveBeenCalledWith("client.example.com", {
			all: true,
			verbatim: true,
		});
		expect(pinnedAddress).toBe("93.184.216.34");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10810
	 */
	it("fetches metadata when Node requests all addresses", async () => {
		mocks.lookup.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
		]);
		mockHttpsResponse({
			body: "ok",
			lookupOptions: { all: true },
		});

		const response = await fetchClientMetadataResource(
			"https://client.example.com/client.json",
		);

		expect(await response.text()).toBe("ok");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12224
	 */
	it("hands Node every validated address when it requests all addresses", async () => {
		const addresses = [
			{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
			{ address: "93.184.216.34", family: 4 },
		];
		mocks.lookup.mockResolvedValue(addresses);
		let lookupResult: string | MockLookupAddress[] | undefined;
		mockHttpsResponse({
			body: "ok",
			lookupOptions: { all: true },
			onLookup: (result) => {
				lookupResult = result;
			},
		});

		const response = await fetchClientMetadataResource(
			"https://client.example.com/client.json",
		);

		expect(await response.text()).toBe("ok");
		expect(lookupResult).toEqual(addresses);
		expect(mocks.lookup).toHaveBeenCalledTimes(1);
	});

	it("rejects a hostname that resolves to an IPv4-translated loopback address", async () => {
		mocks.lookup.mockResolvedValue([{ address: "::ffff:0:7f00:1", family: 6 }]);

		await expect(
			fetchClientMetadataResource("https://client.example.com/client.json"),
		).rejects.toThrow("public-routable");
		expect(mocks.request).not.toHaveBeenCalled();
	});

	it("returns redirect responses without following them", async () => {
		mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
		mockHttpsResponse({
			status: 302,
			headers: { location: "https://other.example/client.json" },
		});

		const response = await fetchClientMetadataResource(
			"https://client.example.com/client.json",
		);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://other.example/client.json",
		);
		expect(mocks.request).toHaveBeenCalledTimes(1);
	});

	it("returns a 304 response without constructing a forbidden body", async () => {
		mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
		mockHttpsResponse({ status: 304, headers: { etag: '"current"' } });

		const response = await fetchClientMetadataResource(
			"https://client.example.com/client.json",
		);
		expect(response.status).toBe(304);
		expect(response.body).toBeNull();
		expect(response.headers.get("etag")).toBe('"current"');
	});

	it("preserves supplied method, headers, and abort signal", async () => {
		mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
		mockHttpsResponse();
		const controller = new AbortController();

		await fetchClientMetadataResource(
			"https://client.example.com/client.json",
			{
				method: "HEAD",
				headers: { accept: "application/oauth-client-metadata+json" },
				signal: controller.signal,
			},
		);

		const options = mocks.request.mock.calls[0]?.[1] as {
			headers: Record<string, string>;
			method: string;
			signal: AbortSignal;
		};
		expect(options.method).toBe("HEAD");
		expect(options.headers.accept).toBe(
			"application/oauth-client-metadata+json",
		);
		expect(options.signal).toBe(controller.signal);
	});

	it("rejects unsupported methods instead of dropping their request body", async () => {
		await expect(
			fetchClientMetadataResource("https://client.example.com/client.json", {
				method: "POST",
				body: "must-not-be-dropped",
			}),
		).rejects.toThrow("GET and HEAD");
		expect(mocks.lookup).not.toHaveBeenCalled();
		expect(mocks.request).not.toHaveBeenCalled();
	});

	it("does not send SNI for an IP-literal URL", async () => {
		mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
		mockHttpsResponse();

		await fetchClientMetadataResource("https://8.8.8.8/client.json");
		const options = mocks.request.mock.calls[0]?.[1] as {
			servername?: string;
		};
		expect(options.servername).toBeUndefined();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11422
	 */
	describe("status lines Response cannot represent", () => {
		it("rejects a status outside the Fetch range", async () => {
			mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
			mockHttpsResponse({ status: 700 });

			await expect(
				fetchClientMetadataResource("https://client.example.com/client.json"),
			).rejects.toThrow(RangeError);
		});

		it("rejects a reason phrase with control characters", async () => {
			mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
			mockHttpsResponse({ statusMessage: "\x7fx" });

			await expect(
				fetchClientMetadataResource("https://client.example.com/client.json"),
			).rejects.toThrow(TypeError);
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11609
	 */
	it("rejects when the request closes without a response or an error", async () => {
		mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
		mocks.request.mockImplementation(() => {
			const request = new EventEmitter() as EventEmitter & {
				end: () => void;
			};
			request.end = () => {
				setImmediate(() => request.emit("close"));
			};
			return request;
		});

		await expect(
			fetchClientMetadataResource("https://client.example.com/client.json"),
		).rejects.toThrow("closed before a response");
	}, 2_000);
});
