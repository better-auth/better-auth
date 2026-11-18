import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { GenericEndpointContext } from "@better-auth/core";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCimdClientDiscovery } from "./index";

const mocks = vi.hoisted(() => ({
	lookup: vi.fn(),
	request: vi.fn(),
}));

vi.mock(import("node:dns/promises"), () => ({ lookup: mocks.lookup }));
vi.mock(import("node:https"), () => ({ request: mocks.request }));

import { fetchClientMetadataResource } from "./node";

const PUBLIC_ADDRESSES = [{ address: "93.184.216.34", family: 4 }];
const FETCH_FAILURE_DESCRIPTION =
	"Failed to fetch metadata document (network error or redirect blocked)";

type MockRequest = EventEmitter & { end: () => void; destroy: () => void };
type Respond = (
	request: MockRequest,
	onResponse: (response: Readable) => void,
) => void;

function answerRequests(respond: Respond) {
	mocks.request.mockImplementation(
		(
			_url: URL,
			_options: unknown,
			onResponse: (response: Readable) => void,
		) => {
			const request = new EventEmitter() as MockRequest;
			request.end = () => {
				setImmediate(() => respond(request, onResponse));
			};
			request.destroy = () => {};
			return request;
		},
	);
}

function respondWith(status: number, body = ""): Respond {
	return (_request, onResponse) => {
		onResponse(
			Object.assign(Readable.from([Buffer.from(body)]), {
				headers: { "content-type": "application/json" },
				statusCode: status,
				statusMessage: "",
			}),
		);
	};
}

const stalledLookups: Array<(addresses: typeof PUBLIC_ADDRESSES) => void> = [];

function stalledLookup() {
	return new Promise((resolve) => {
		stalledLookups.push(resolve);
	});
}

afterEach(async () => {
	for (const resolve of stalledLookups.splice(0)) resolve(PUBLIC_ADDRESSES);
	await new Promise((resolve) => setImmediate(resolve));
	vi.useRealTimers();
	mocks.lookup.mockReset();
	mocks.request.mockReset();
});

async function createRegistrar() {
	const instance = await getTestInstance({
		baseURL: "http://localhost:3791",
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
		context: await instance.auth.$context,
	} as unknown as GenericEndpointContext;
	return async (name: string) => {
		const clientId = `https://${name}.example.com/client.json`;
		const discovery = createCimdClientDiscovery({
			fetchClientMetadataResource,
			metadataRevalidationInterval: 0,
			metadataFetchPolicy: { minimumFetchInterval: 0 },
			metadataStaleIfError: "1h",
		});
		mocks.lookup.mockResolvedValue(PUBLIC_ADDRESSES);
		answerRequests(
			respondWith(
				200,
				JSON.stringify({
					client_id: clientId,
					client_name: name,
					redirect_uris: ["http://127.0.0.1:5199/callback"],
					application_type: "native",
					token_endpoint_auth_method: "none",
				}),
			),
		);
		const stored = (await discovery.resolve(
			ctx,
			clientId,
			null,
		)) as SchemaClient<Scope[]>;
		return {
			stored,
			resolve: () => discovery.resolve(ctx, clientId, stored),
		};
	};
}

/** Leaves 16 abandoned lookups outstanding, the Node transport's limit. */
async function fillDnsLookupLimit() {
	mocks.lookup.mockImplementation(stalledLookup);
	for (let attempt = 0; attempt < 16; attempt += 1) {
		const controller = new AbortController();
		const filler = Promise.resolve(
			fetchClientMetadataResource("https://filler.example.com/client.json", {
				signal: controller.signal,
			}),
		);
		controller.abort(new Error("filler aborted"));
		await filler.catch(() => {});
	}
	await expect(
		fetchClientMetadataResource("https://filler.example.com/client.json"),
	).rejects.toMatchObject({ code: "ERR_CIMD_DNS_LOOKUP_LIMIT" });
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11875
 */
describe("CIMD metadataStaleIfError with the Node transport", () => {
	it("serves the stored client when the fetch timeout aborts a stalled DNS lookup", async () => {
		const register = await createRegistrar();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const client = await register("aborted-lookup");
		mocks.lookup.mockImplementation(stalledLookup);

		const pending = client.resolve();
		await vi.advanceTimersByTimeAsync(5_000);

		await expect(pending).resolves.toBe(client.stored);
	});

	it("keeps today's error for a protocol upgrade response", async () => {
		const client = await (await createRegistrar())("upgrade");
		answerRequests((request) => {
			request.emit("upgrade", { destroy() {} }, { destroy() {} });
		});

		await expect(client.resolve()).rejects.toMatchObject({
			body: { error_description: FETCH_FAILURE_DESCRIPTION },
		});
	});

	it("keeps today's error for a connection that closes before a response", async () => {
		const client = await (await createRegistrar())("closed");
		answerRequests((request) => {
			request.emit("close");
		});

		await expect(client.resolve()).rejects.toMatchObject({
			body: { error_description: FETCH_FAILURE_DESCRIPTION },
		});
	});

	it("answers temporarily_unavailable at the DNS lookup limit when no transient failure preceded it", async () => {
		const client = await (await createRegistrar())("capped");
		await fillDnsLookupLimit();

		await expect(client.resolve()).rejects.toMatchObject({
			status: "TOO_MANY_REQUESTS",
			body: {
				error: "temporarily_unavailable",
				error_description: "metadata DNS lookup capacity exceeded",
			},
		});
	});

	it("serves the stored client at the DNS lookup limit within 5 minutes of a transient failure", async () => {
		const register = await createRegistrar();
		vi.useFakeTimers({ toFake: ["Date"] });
		const client = await register("capped-after-outage");
		answerRequests(respondWith(503));
		await expect(client.resolve()).resolves.toBe(client.stored);
		await fillDnsLookupLimit();

		// A minute on, the stored client is no longer served without a fetch,
		// so this resolution reaches the transport's limit.
		const lookups = mocks.lookup.mock.calls.length;
		vi.setSystemTime(Date.now() + 60_000);
		await expect(client.resolve()).resolves.toBe(client.stored);
		expect(mocks.lookup).toHaveBeenCalledTimes(lookups);
	});
});
