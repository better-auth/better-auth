import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cimd } from "./index";
import { IN_FLIGHT_RESOLUTION_MAX_AGE_MS } from "./resolver";
import type { CimdMetadataFetchPolicy, CimdOptions } from "./types";

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
	extraCimdOptions?: Partial<CimdOptions>,
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
				...extraCimdOptions,
			}),
		],
	});
	const { headers } = await instance.signInWithTestUser();
	const client = createAuthClient({
		baseURL,
		plugins: [oauthProviderClient()],
		fetchOptions: { customFetchImpl: instance.customFetchImpl, headers },
	});
	const authorize = async (clientId: string, redirectUri = REDIRECT_URI) => {
		let status = 200;
		let location = "";
		await client.$fetch(
			baseURL +
				"/api/auth/oauth2/authorize" +
				"?client_id=" +
				encodeURIComponent(clientId) +
				"&response_type=code" +
				"&redirect_uri=" +
				encodeURIComponent(redirectUri) +
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
		//
		// Fake timers are installed *before* the first request so that the
		// originator's fetch and wait bounds are created on the mocked clock
		// too: the final timer-count assertion can then prove that no bound
		// leaks, rather than being unable to see pre-installation timers.
		vi.useFakeTimers();
		const wedgedStartMs = Date.now();
		vi.setSystemTime(wedgedStartMs);

		const firstAuthorize = harness.authorize(clientId);
		void firstAuthorize.catch(() => {});
		await vi.waitFor(() =>
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1),
		);

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

		// Let the wedged resolution settle late: the sweep superseded it, so
		// its stale document must not overwrite the replacement's work, its
		// cleanup must be a no-op (the entry is gone and its permit was
		// already reclaimed), and no timer may be left behind.
		wedged.resolve(
			Response.json(metadata(clientId), {
				headers: { "cache-control": "no-store" },
			}),
		);
		await vi.advanceTimersByTimeAsync(1);
		expect(vi.getTimerCount()).toBe(0);
		// Superseded attempt published nothing: the third request's fetch is
		// still the last one, and a fourth request re-serves from the cache
		// the replacement built (no fresh fetch, no revalidation error).
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);
	});

	it("does not publish a superseded resolution over its replacement", async () => {
		const allowFirstGate = { ...deferred<boolean>(), resolved: false };
		const harness = await createInFlightHarness(
			{
				minimumFetchInterval: 0,
				maximumFetchesPerMinute: 1_000,
				maximumFetchesPerOriginPerMinute: 1_000,
			},
			{
				// Park the *first* resolution before its transport fetch, at
				// an await point that exists on pristine main too. Once the
				// originator's wait bound has fired and a replacement has
				// published, releasing this gate lets the stale attempt
				// continue into persist + cache publication.
				isMetadataDocumentUrlAllowed: (clientIdUrl) => {
					if (clientIdUrl === "https://superseded.example/client.json") {
						if (!allowFirstGate.resolved) {
							allowFirstGate.resolved = true;
							return allowFirstGate.promise;
						}
					}
					return true;
				},
			},
		);
		const clientId = "https://superseded.example/client.json";
		const STALE_REDIRECT_URI = "http://127.0.0.1:5207/stale-callback";
		const FRESH_REDIRECT_URI = "http://127.0.0.1:5207/fresh-callback";
		let fetchCount = 0;
		harness.responders.set(clientId, () => {
			fetchCount += 1;
			// The stale attempt's own fetch must return the *old*
			// document, otherwise a stale publish would be invisible
			// to the final redirect-URI assertions: the first fetch
			// (the replacement attempt) serves the fresh document,
			// the second (the superseded attempt) serves the stale
			// one with the pre-rotation redirect URI.
			const redirectUris =
				fetchCount === 1 ? [FRESH_REDIRECT_URI] : [STALE_REDIRECT_URI];
			return Response.json(
				{
					...metadata(clientId),
					redirect_uris: redirectUris,
				},
				{ headers: { "cache-control": "max-age=60" } },
			);
		});

		vi.useFakeTimers();
		const wedgedStartMs = Date.now();
		vi.setSystemTime(wedgedStartMs);

		// The first request parks in the URL allowlist gate, before any
		// fetch: its resolution stays pending well past the wait bound.
		const firstAuthorize = harness.authorize(clientId);
		void firstAuthorize.catch(() => {});
		await vi.advanceTimersByTimeAsync(1);

		// The originator's own wait bound fires: authorize settles with
		// the library's temporarily_unavailable error (429) rather than
		// hanging, and the still-pending attempt is superseded.
		await vi.advanceTimersByTimeAsync(IN_FLIGHT_RESOLUTION_MAX_AGE_MS);
		const first = await firstAuthorize;
		expect(first.status).toBe(429);

		// A replacement attempt runs and publishes the fresh document,
		// whose redirect_uris the old attempt never saw. The fresh fetch
		// and its persist work need real ticks under fake timers.
		const replacementRequest = harness.authorize(clientId, FRESH_REDIRECT_URI);
		await vi.advanceTimersByTimeAsync(1);
		const replacement = await replacementRequest;
		expect(replacement.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1);
		expect(fetchCount).toBe(1);

		// Release the stale attempt's gate: it proceeds to its own fetch
		// and returns the *old* document (with the stale redirect URI).
		allowFirstGate.resolve(true);
		await vi.advanceTimersByTimeAsync(1);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);

		// The superseded attempt must publish nothing: the client row must
		// keep the replacement's redirect_uris, so a request with the
		// stale redirect URI is refused (redirect to the server error
		// page with invalid_redirect) and one with the fresh URI is
		// served from the cache without a third fetch.
		const staleAttemptRequest = harness.authorize(clientId, STALE_REDIRECT_URI);
		await vi.advanceTimersByTimeAsync(1);
		const staleAttempt = await staleAttemptRequest;
		expect(staleAttempt.location).toContain("invalid_redirect");
		const freshAfterRequest = harness.authorize(clientId, FRESH_REDIRECT_URI);
		await vi.advanceTimersByTimeAsync(1);
		const freshAfter = await freshAfterRequest;
		expect(freshAfter.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);
	});

	it("recovers when the originator's own bound fires on a pending resolution", async () => {
		const harness = await createInFlightHarness({
			minimumFetchInterval: 0,
			maximumFetchesPerMinute: 1_000,
			maximumFetchesPerOriginPerMinute: 1_000,
		});
		const clientId = "https://originator-bound.example/client.json";
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

		// Fake timers first, so the originator's wait bound is created on
		// the mocked clock and the final timer count is meaningful.
		vi.useFakeTimers();
		const wedgedStartMs = Date.now();
		vi.setSystemTime(wedgedStartMs);

		const firstAuthorize = harness.authorize(clientId);
		void firstAuthorize.catch(() => {});
		await vi.waitFor(() =>
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1),
		);

		// The originator's own wait bound fires while the shared work is
		// still pending: unlike the joining-request path, this exercises
		// the originator's finally cleanup before the resolution settles,
		// which deregisters (and supersedes) the still-pending attempt.
		await vi.advanceTimersByTimeAsync(IN_FLIGHT_RESOLUTION_MAX_AGE_MS);
		const first = await firstAuthorize;
		expect(first.status).toBe(429);
		expect(vi.getTimerCount()).toBe(0);

		// A request arriving after the bound does not join the superseded
		// attempt: the entry is gone, so it starts a fresh resolution that
		// succeeds once the transport is healthy. The fresh fetch needs a
		// real tick to run under fake timers, so step the clock while it
		// settles.
		const afterRequest = harness.authorize(clientId);
		await vi.advanceTimersByTimeAsync(1);
		const after = await afterRequest;
		expect(after.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);

		// The superseded attempt settles late; it must publish nothing and
		// leave no timer behind.
		wedged.resolve(
			Response.json(metadata(clientId), {
				headers: { "cache-control": "no-store" },
			}),
		);
		await vi.advanceTimersByTimeAsync(1);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
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

		// Let the wedged request finish: the entry was swept out from
		// under it, so its attempt is superseded and its late settlement
		// must publish nothing. Only the mocked clock moved in this test
		// (no fake timers), so the originator's own wait bound is a real
		// timer that has not fired; it is still parked on the shared
		// resolution. The invariant under test is the permit: no fourth
		// fetch happens, and the superseded settlement is a no-op.
		wedged.resolve(
			Response.json(metadata(wedgedClientId), {
				headers: { "cache-control": "no-store" },
			}),
		);
		const wedgedResult = await wedgedRequest;
		// The wedged attempt was deregistered by the sweep, so it is
		// superseded: it settles with the superseded error rather than
		// publishing its document over whatever the client's next
		// resolution publishes.
		expect(wedgedResult.status).toBe(429);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);
	});

	it("does not re-arm failed-fetch backoff when a superseded attempt settles late", async () => {
		const harness = await createInFlightHarness({
			minimumFetchInterval: 60,
			maximumFetchesPerMinute: 1_000,
			maximumFetchesPerOriginPerMinute: 1_000,
		});
		const clientId = "https://backoff.example/client.json";
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

		// Attempt A starts and parks inside its transport fetch, holding the
		// failed-fetch marker armed at its fetch start. Freeze the clock at
		// the wedge point: its originator's wait bound is still pending, so
		// the attempt is live from its caller's point of view.
		let now = Date.now();
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const wedgedRequest = harness.authorize(clientId);
		void wedgedRequest.catch(() => {});
		await vi.waitFor(() =>
			expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(1),
		);

		// Jump the clock past both the in-flight sweep age and the per-client
		// minimum interval (60s). The next request sweeps the wedged attempt
		// and runs a replacement, which fetches a no-store document
		// successfully: the client recovers and the replacement clears the
		// failed-fetch marker on its way out.
		now += IN_FLIGHT_RESOLUTION_MAX_AGE_MS + 60_000;
		const replacement = await harness.authorize(clientId);
		expect(replacement.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(2);

		// The wedged attempt settles late: the sweep superseded it, so its
		// resolution rejects and its still-parked originator fails. That
		// late failure must not re-arm the per-client interval the
		// replacement cleared when it recovered the client.
		wedged.resolve(
			Response.json(metadata(clientId), {
				headers: { "cache-control": "no-store" },
			}),
		);
		const wedgedResult = await wedgedRequest;
		expect(wedgedResult.status).toBe(429);

		// The client recovered, so the next request must be allowed a fresh
		// fetch instead of 429ing on a backoff the dead attempt re-armed.
		const recovered = await harness.authorize(clientId);
		expect(recovered.status).toBeLessThan(400);
		expect(harness.fetchClientMetadataResource).toHaveBeenCalledTimes(3);
	});
});
