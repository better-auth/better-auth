import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cimd } from "./index";
import type { CimdMetadataFetchPolicy } from "./types";

const REDIRECT_URI = "http://127.0.0.1:5207/callback";
const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
let instanceSequence = 0;

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function metadata(clientId: string) {
	return {
		client_id: clientId,
		client_name: "In-flight Client",
		redirect_uris: [REDIRECT_URI],
		application_type: "native",
		token_endpoint_auth_method: "none",
		grant_types: ["authorization_code"],
		response_types: ["code"],
	};
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

async function createInFlightHarness(
	metadataFetchPolicy?: CimdMetadataFetchPolicy,
) {
	instanceSequence += 1;
	const baseURL = "http://localhost:" + String(3400 + instanceSequence);
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
			if (!responder) throw new Error("No responder for " + clientId);
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
				maxCacheEntries: 8,
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
			baseURL +
				"/api/auth/oauth2/authorize" +
				"?client_id=" +
				encodeURIComponent(clientId) +
				"&response_type=code" +
				"&redirect_uri=" +
				encodeURIComponent(REDIRECT_URI) +
				"&scope=openid" +
				"&code_challenge=" +
				PKCE_CHALLENGE +
				"&code_challenge_method=S256",
			{
				method: "GET",
				onError(context) {
					status = context.response.status;
					location = context.response.headers.get("location") ?? "";
				},
			},
		);
		return { location, status };
	};

	return { authorize, fetchClientMetadataResource, responders };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11675
 *
 * On runtimes that tie timers and I/O to the incoming request (e.g.
 * Cloudflare Workers), cancelling the request that started a resolution can
 * leave the underlying fetch promise forever unsettled while the in-flight
 * map still holds it. Every later request for the same client_id joined that
 * dead promise and hung until the isolate was recycled. The resolver must
 * bound the shared promise itself and stop joining entries that outlived the
 * bound.
 */
describe("CIMD in-flight resolution liveness", () => {
	it("does not hang a later request when a resolution never settles", async () => {
		const harness = await createInFlightHarness({
			minimumFetchInterval: 0,
			maximumFetchesPerMinute: 1_000,
			maximumFetchesPerOriginPerMinute: 1_000,
		});
		const clientId = "https://in-flight.example/client.json";
		const wedged = deferred<Response>();
		let wedgedOnce = false;
		harness.responders.set(clientId, () => {
			if (!wedgedOnce) {
				wedgedOnce = true;
				return wedged.promise;
			}
			return Response.json(metadata(clientId), {
				headers: { "cache-control": "no-store" },
			});
		});

		// The first request starts a resolution whose fetch never settles,
		// exactly the state a cancelled Workers request leaves behind. Its
		// bound runs on the request's own clock; keep the parked promise from
		// turning into an unhandled rejection once the test returns.
		const firstAuthorize = harness.authorize(clientId);
		void firstAuthorize.catch(() => {});
		await vi.waitFor(() =>
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1),
		);
		const wedgedStartMs = Date.now();

		// Pin the mocked clock to the wall-clock time the resolver stamped
		// the in-flight entry with, so the expiry arithmetic is deterministic.
		vi.useFakeTimers();
		vi.setSystemTime(wedgedStartMs);

		// The second request joins the in-flight resolution while it is
		// within the fetch bound, carrying its own bound in its request
		// context (the originator's may already be dead on Workers)...
		const secondRequest = harness.authorize(clientId);
		await vi.advanceTimersByTimeAsync(5_999);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);

		// ...and once the bound lapses the joining request settles with the
		// library's own temporarily_unavailable error instead of hanging
		// until the isolate is recycled.
		await vi.advanceTimersByTimeAsync(1);
		const second = await secondRequest;
		expect(second.status).toBe(429);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);

		// Eviction happens once the entry has *outlived* the bound, so move
		// the clock strictly past it before the next request.
		await vi.advanceTimersByTimeAsync(1);

		// A request arriving after the bound sweeps the wedged entry out:
		// its fetch permit is reclaimed and a fresh resolution starts, which
		// succeeds now that the transport is healthy again. The sweep evicts
		// entries that outlived the bound, so step past it by one tick first.
		await vi.advanceTimersByTimeAsync(1);
		const third = await harness.authorize(clientId);
		expect(third.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);

		// Let the wedged resolution settle late: cleanup must be a no-op
		// (the entry is gone and its permit was already reclaimed), and no
		// timer may be left behind.
		wedged.resolve(
			Response.json(metadata(clientId), {
				headers: { "cache-control": "no-store" },
			}),
		);
		await vi.advanceTimersByTimeAsync(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("deduplicates concurrent requests for one client within the bound", async () => {
		const harness = await createInFlightHarness({
			minimumFetchInterval: 0,
			maximumFetchesPerMinute: 1_000,
			maximumFetchesPerOriginPerMinute: 1_000,
		});
		const clientId = "https://dedup.example/client.json";
		const gate = deferred<void>();
		harness.responders.set(clientId, async () => {
			await gate.promise;
			return Response.json(metadata(clientId), {
				headers: { "cache-control": "no-store" },
			});
		});

		const first = harness.authorize(clientId);
		await vi.waitFor(() =>
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1),
		);
		const second = harness.authorize(clientId);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);

		gate.resolve();
		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(firstResult.status).toBeLessThan(400);
		expect(secondResult.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);
	});
	it("reclaims the fetch permit of a wedged resolution", async () => {
		const harness = await createInFlightHarness({
			minimumFetchInterval: 0,
			maximumConcurrentFetches: 1,
			maximumFetchesPerMinute: 1_000,
			maximumFetchesPerOriginPerMinute: 1_000,
		});
		const wedgedClientId = "https://permit-wedge.example/client.json";
		const wedged = deferred<Response>();
		let wedgedOnce = false;
		harness.responders.set(wedgedClientId, () => {
			if (!wedgedOnce) {
				wedgedOnce = true;
				return wedged.promise;
			}
			return Response.json(metadata(wedgedClientId), {
				headers: { "cache-control": "no-store" },
			});
		});
		const healthyClientId = "https://permit-healthy.example/client.json";
		harness.responders.set(healthyClientId, () =>
			Response.json(metadata(healthyClientId), {
				headers: { "cache-control": "no-store" },
			}),
		);

		const wedgedRequest = harness.authorize(wedgedClientId);
		await vi.waitFor(() =>
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1),
		);

		// The concurrency budget is 1 and the wedged resolution holds its
		// permit, so a different client is refused while it is in flight.
		const during = await harness.authorize(healthyClientId);
		expect(during.status).toBe(429);

		// Once the wedged entry has outlived the fetch bound it is evicted on
		// the next request, and its permit must be reclaimed rather than
		// leaking for the lifetime of the isolate.
		let now = Date.now();
		vi.spyOn(Date, "now").mockImplementation(() => now);
		now += 7_000;
		const after = await harness.authorize(healthyClientId);
		expect(after.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);

		// Let the wedged request finish cleanly so no work outlives the test.
		wedged.resolve(
			Response.json(metadata(wedgedClientId), {
				headers: { "cache-control": "no-store" },
			}),
		);
		const wedgedResult = await wedgedRequest;
		expect(wedgedResult.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);
	});
});
