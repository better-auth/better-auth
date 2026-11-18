import type { GenericEndpointContext } from "@better-auth/core";
import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import type {
	ClientDiscovery,
	ClientMetadataResourceFetch,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "./types";
import { verifyClientAssertion } from "./utils/client-assertion";

const START_MS = Math.ceil(Date.now() / 1_000) * 1_000;
const MINUTE_MS = 60_000;

let sequence = 0;

type KeyAnswer = (init?: RequestInit) => Response | Promise<Response>;

function withCode(message: string, code: string): Error {
	return Object.assign(new Error(message), { code });
}

async function createVerifier(
	discovery: Pick<ClientDiscovery, "jwksStaleIfError"> = {},
) {
	sequence += 1;
	const name = `stale-keys-${sequence}`;
	const clientId = `https://${name}.example.com/client.json`;
	const jwksUri = `https://${name}.example.com/jwks.json`;
	const audience = `https://${name}-provider.example.com/oauth2/token`;
	const clientDiscoveryId = `${name}-discovery`;
	const { privateKey, publicKey } = await generateKeyPair("RS256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	const keys = {
		answer: (() =>
			Response.json({
				keys: [{ ...publicJwk, kid: "stale-key", alg: "RS256" }],
			})) as KeyAnswer,
	};
	const transport = vi.fn<ClientMetadataResourceFetch>(async (_input, init) =>
		keys.answer(init),
	);
	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		extensions: [
			{
				clientDiscovery: {
					id: clientDiscoveryId,
					matches: (candidateClientId: string) =>
						candidateClientId === clientId,
					resolve: (
						_ctx: GenericEndpointContext,
						_clientId: string,
						existingClient: SchemaClient<Scope[]> | null,
					) => existingClient,
					fetchClientMetadataResource: transport,
					...discovery,
				},
			},
		],
	} satisfies OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		baseURL: new URL(audience).origin,
		plugins: [jwt(), oauthProvider(opts)],
	});
	const context = await instance.auth.$context;
	await context.adapter.create<SchemaClient<Scope[]>>({
		model: "oauthClient",
		data: {
			clientId,
			clientDiscoveryId,
			name: "Discovered private_key_jwt client",
			redirectUris: ["https://client.example.com/callback"],
			tokenEndpointAuthMethod: "private_key_jwt",
			applicationType: "web",
			grantTypes: ["authorization_code"],
			responseTypes: ["code"],
			jwksUri,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	const verify = async () =>
		verifyClientAssertion(
			{ context } as unknown as GenericEndpointContext,
			opts,
			await new SignJWT({})
				.setProtectedHeader({ alg: "RS256", kid: "stale-key" })
				.setIssuer(clientId)
				.setSubject(clientId)
				.setAudience(audience)
				.setIssuedAt()
				.setExpirationTime("2m")
				.setJti(crypto.randomUUID())
				.sign(privateKey),
			CLIENT_ASSERTION_TYPE,
			clientId,
			audience,
		);
	return { clientId, jwksUri, context, keys, transport, verify };
}

/** Rejects with the abort reason once the key fetch timeout fires. */
function untilAborted(init?: RequestInit): Promise<Response> {
	return new Promise((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
			once: true,
		});
	});
}

const transientFailures: { failure: string; answer: KeyAnswer }[] = [
	{ failure: "the fetch timeout", answer: untilAborted },
	{
		failure: "HTTP 503",
		answer: () => new Response(null, { status: 503 }),
	},
	{
		failure: "a reset connection",
		answer: () => {
			throw new TypeError("fetch failed", {
				cause: withCode("socket hang up", "ECONNRESET"),
			});
		},
	},
];

const terminalFailures: { failure: string; answer: KeyAnswer }[] = [
	{
		failure: "HTTP 404",
		answer: () => new Response(null, { status: 404 }),
	},
	{
		failure: "a redirect",
		answer: () =>
			new Response(null, {
				status: 302,
				headers: { location: "https://elsewhere.example.com/" },
			}),
	},
	{
		failure: "a private-address refusal",
		answer: () => {
			throw new TypeError(
				"metadata hostname must resolve only to public-routable addresses",
			);
		},
	},
	{
		failure: "an unresolvable host",
		answer: () => {
			throw withCode("getaddrinfo ENOTFOUND", "ENOTFOUND");
		},
	},
	{
		failure: "an error a custom transport did not mark",
		answer: () => {
			throw new Error("custom transport failure");
		},
	},
];

/** Verifies an assertion, moving fake time past the key fetch timeout. */
async function verifyAfterFetchTimeout(
	verifier: Awaited<ReturnType<typeof createVerifier>>,
) {
	const calls = verifier.transport.mock.calls.length;
	const pending = verifier.verify();
	void pending.catch(() => {});
	await vi.waitFor(() => {
		expect(verifier.transport.mock.calls.length).toBeGreaterThan(calls);
	});
	await vi.advanceTimersByTimeAsync(5_000);
	return pending;
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11875
 */
describe("jwksStaleIfError on a client discovery", () => {
	it.each(transientFailures)(
		"serves cached keys past twice the cache lifetime after $failure within the bound",
		async ({ answer }) => {
			const verifier = await createVerifier({ jwksStaleIfError: 3_600 });
			vi.useFakeTimers({
				toFake: ["setTimeout", "clearTimeout", "Date"],
				now: START_MS,
			});
			await expect(verifier.verify()).resolves.toMatchObject({
				clientId: verifier.clientId,
			});
			const warn = vi.spyOn(verifier.context.logger, "warn");

			vi.setSystemTime(START_MS + 11 * MINUTE_MS);
			verifier.keys.answer = answer;

			await expect(verifyAfterFetchTimeout(verifier)).resolves.toMatchObject({
				clientId: verifier.clientId,
			});
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining(verifier.jwksUri),
			);
		},
	);

	it.each(terminalFailures)(
		"rejects past twice the cache lifetime after $failure",
		async ({ answer }) => {
			const verifier = await createVerifier({ jwksStaleIfError: 3_600 });
			vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
			await verifier.verify();

			vi.setSystemTime(START_MS + 11 * MINUTE_MS);
			verifier.keys.answer = answer;

			await expect(verifier.verify()).rejects.toMatchObject({
				body: { error_description: "failed to fetch client JWKS" },
			});
		},
	);

	it("rejects a transient failure once the cached keys are older than the bound", async () => {
		const verifier = await createVerifier({ jwksStaleIfError: 3_600 });
		vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
		await verifier.verify();

		vi.setSystemTime(START_MS + 60 * MINUTE_MS + 1);
		verifier.keys.answer = () => new Response(null, { status: 503 });

		await expect(verifier.verify()).rejects.toMatchObject({
			body: { error_description: "failed to fetch client JWKS" },
		});
	});

	it("rejects a transient failure past twice the cache lifetime when the discovery sets no bound", async () => {
		const verifier = await createVerifier();
		vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
		await verifier.verify();

		vi.setSystemTime(START_MS + 11 * MINUTE_MS);
		verifier.keys.answer = () => new Response(null, { status: 503 });

		await expect(verifier.verify()).rejects.toMatchObject({
			body: { error_description: "failed to fetch client JWKS" },
		});
	});

	it.each([{}, { jwksStaleIfError: 3_600 }])(
		"keeps serving cached keys within twice the cache lifetime after any failed fetch (%o)",
		async (discovery) => {
			const verifier = await createVerifier(discovery);
			vi.useFakeTimers({ toFake: ["Date"], now: START_MS });
			await verifier.verify();

			vi.setSystemTime(START_MS + 6 * MINUTE_MS);
			verifier.keys.answer = () => new Response(null, { status: 404 });

			await expect(verifier.verify()).resolves.toMatchObject({
				clientId: verifier.clientId,
			});
		},
	);
});
