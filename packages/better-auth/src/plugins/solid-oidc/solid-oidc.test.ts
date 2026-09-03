import { deriveDpopJkt, verifyDpopProof } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { decodeProtectedHeader } from "jose";
import type {
	MutableResponse,
	MutableToken,
	TokenRequestIncomingMessage,
} from "oauth2-mock-server";
import { OAuth2Server } from "oauth2-mock-server";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { solidOidc } from ".";
import { CLIENT_ID_DOCUMENT_CONTENT_TYPE } from "./client-id-document";
import type { SolidOidcProfile } from "./types";

const server = new OAuth2Server();
await server.start();
await server.issuer.keys.generate("RS256");

const ISSUER = server.issuer.url!;
const discovery = await betterFetch<{
	token_endpoint: string;
	end_session_endpoint: string;
}>(`${ISSUER}/.well-known/openid-configuration`);
const TOKEN_ENDPOINT = discovery.data!.token_endpoint;

/** A WebID the mock provider hosts itself, so no document lookup is needed. */
const HOSTED_WEBID = `${ISSUER}/alice/profile/card#me`;
/** A WebID hosted elsewhere, which must be confirmed against its document. */
const FOREIGN_WEBID = "https://alice.example/profile/card#me";

interface CapturedTokenRequest {
	grantType: string | undefined;
	dpop: string | undefined;
	clientId: unknown;
}

/** Per-test control over what the mock provider asserts and returns. */
const mock = {
	webid: HOSTED_WEBID as string | undefined,
	azp: undefined as string | undefined,
	nonce: undefined as string | undefined,
	tokenType: "DPoP" as string,
	requests: [] as CapturedTokenRequest[],
};

server.service.on("beforeTokenSigning", (token: MutableToken) => {
	if (mock.webid !== undefined) token.payload.webid = mock.webid;
	if (mock.azp !== undefined) token.payload.azp = mock.azp;
	if (mock.nonce !== undefined) token.payload.nonce = mock.nonce;
});

server.service.on(
	"beforeResponse",
	(response: MutableResponse, req: TokenRequestIncomingMessage) => {
		mock.requests.push({
			grantType: req.body?.grant_type,
			dpop: req.headers.dpop as string | undefined,
			clientId: req.body?.client_id,
		});
		if (response.body && typeof response.body === "object") {
			response.body.token_type = mock.tokenType;
		}
	},
);

/**
 * Better Auth log records, captured instead of printed.
 *
 * Test instances log at `debug` by default, and many of the cases below drive a
 * deliberate rejection, so a passing run would otherwise bury its own result
 * under a wall of expected warnings and errors. Capturing turns that output
 * into an assertion target: a rejection has to explain itself to whoever is
 * debugging it, and a successful sign-in has to log no errors at all.
 */
const logs: { level: string; message: string }[] = [];

const captureLog = (level: string, message: string) => {
	logs.push({ level, message });
};

const testInstanceOptions = {
	// The tests assert on `account.issuer`, so the identity strategy they rely
	// on is pinned rather than inherited from compatibility-mode defaults.
	account: { identityStrategy: "issuer" },
	logger: { level: "error", log: captureLog },
} as const;

function loggedErrors() {
	return logs
		.filter((entry) => entry.level === "error")
		.map((entry) => entry.message);
}

/** Asserts an operator-facing error naming the actual cause was logged. */
function expectLoggedError(pattern: RegExp) {
	const errors = loggedErrors();
	expect(
		errors.some((message) => pattern.test(message)),
		`no logged error matched ${pattern}. Logged errors: ${JSON.stringify(errors, null, 2)}`,
	).toBe(true);
}

beforeEach(() => {
	mock.webid = HOSTED_WEBID;
	mock.azp = undefined;
	mock.nonce = undefined;
	mock.tokenType = "DPoP";
	mock.requests = [];
	logs.length = 0;
});

afterEach(() => {
	vi.useRealTimers();
});

afterAll(async () => {
	await server.stop();
});

function solidTestInstance(
	config: Parameters<typeof solidOidc>[0]["config"][number],
) {
	return getTestInstance({
		...testInstanceOptions,
		plugins: [solidOidc({ config: [config] })],
	});
}

const baseConfig = {
	providerId: "pod",
	issuer: ISSUER,
} as const;

/**
 * Drives the provider's authorization redirect and the resulting Better Auth
 * callback, mirroring what a browser does between `signIn.social` and the
 * session cookie landing.
 */
async function completeAuthorization({
	authUrl,
	headers,
	customFetchImpl,
	cookieSetter,
}: {
	authUrl: string;
	headers: Headers;
	customFetchImpl: (...args: any) => any;
	cookieSetter: (headers: Headers) => (context: any) => void;
}) {
	let location: string | null = null;
	await betterFetch(authUrl, {
		method: "GET",
		redirect: "manual",
		onError(context) {
			location = context.response.headers.get("location");
		},
	});
	if (!location) throw new Error("provider did not redirect to the callback");

	let callbackURL = "";
	const sessionHeaders = new Headers();
	await betterFetch(location, {
		method: "GET",
		customFetchImpl,
		headers,
		onError(context) {
			callbackURL = context.response.headers.get("location") || "";
			cookieSetter(sessionHeaders)(context);
		},
	});
	return { callbackURL, headers: sessionHeaders };
}

/**
 * The test instance type is parameterized by the plugin options under test, so
 * the shared helper asks only for the members it uses.
 */
type SignInHarness = Pick<
	Awaited<ReturnType<typeof getTestInstance>>,
	"client" | "customFetchImpl" | "cookieSetter"
>;

async function signIn(instance: SignInHarness, providerId = "pod") {
	const { client, customFetchImpl, cookieSetter } = instance;
	const stateHeaders = new Headers();
	const signInRes = await client.signIn.social({
		provider: providerId as "google",
		callbackURL: "http://localhost:3000/dashboard",
		fetchOptions: { onSuccess: cookieSetter(stateHeaders) },
	});
	return completeAuthorization({
		authUrl: signInRes.data?.url || "",
		headers: stateHeaders,
		customFetchImpl,
		cookieSetter,
	});
}

describe("solidOidc configuration", () => {
	it("requires at least one provider", () => {
		expect(() => solidOidc({ config: [] })).toThrow(
			/at least one provider config/,
		);
	});

	it("requires an absolute http(s) issuer", () => {
		expect(() => solidOidc({ config: [{ issuer: "op.example" }] })).toThrow(
			/issuer must be an absolute http\(s\) URL/,
		);
	});

	it("rejects duplicate provider IDs", () => {
		expect(() =>
			solidOidc({
				config: [
					{ providerId: "pod", issuer: "https://a.example" },
					{ providerId: "pod", issuer: "https://b.example" },
				],
			}),
		).toThrow(/configured more than once/);
	});

	/**
	 * A client identified by a public Client Identifier Document has no secret
	 * to authenticate with, so accepting both would leave it ambiguous which
	 * identity the provider is being asked to trust.
	 */
	it("rejects a client secret alongside a Client Identifier Document", () => {
		expect(() =>
			solidOidc({
				config: [{ issuer: "https://op.example", clientSecret: "shh" }],
			}),
		).toThrow(/has no clientSecret/);
	});

	it("rejects a secret-based auth method with no secret", () => {
		expect(() =>
			solidOidc({
				config: [
					{
						issuer: "https://op.example",
						clientIdDocument: false,
						clientId: "static-client",
						tokenEndpointAuthMethod: "client_secret_basic",
					},
				],
			}),
		).toThrow(/requires clientSecret/);
	});

	it('rejects a secret combined with the "none" auth method', () => {
		expect(() =>
			solidOidc({
				config: [
					{
						issuer: "https://op.example",
						clientIdDocument: false,
						clientId: "static-client",
						clientSecret: "shh",
						tokenEndpointAuthMethod: "none",
					},
				],
			}),
		).toThrow(/cannot be combined with clientSecret/);
	});

	it("requires a clientId when no Client Identifier Document is served", () => {
		expect(() =>
			solidOidc({
				config: [{ issuer: "https://op.example", clientIdDocument: false }],
			}),
		).toThrow(/clientId is required/);
	});
});

describe("solidOidc client identifier document", () => {
	it("serves a dereferenceable document at the client_id URL", async () => {
		const { customFetchImpl } = await solidTestInstance({
			...baseConfig,
			clientIdDocument: {
				clientName: "My App",
				clientURI: "http://localhost:3000",
			},
		});

		let contentType: string | null = null;
		const response = await betterFetch<Record<string, unknown>>(
			"http://localhost:3000/api/auth/solid/client-id/pod",
			{
				method: "GET",
				customFetchImpl,
				onSuccess(context) {
					contentType = context.response.headers.get("content-type");
				},
			},
		);

		expect(response.data?.client_id).toBe(
			"http://localhost:3000/api/auth/solid/client-id/pod",
		);
		expect(response.data?.redirect_uris).toEqual([
			"http://localhost:3000/api/auth/callback/pod",
		]);
		expect(response.data?.client_name).toBe("My App");
		expect(response.data?.token_endpoint_auth_method).toBe("none");
		expect(response.data?.scope).toContain("webid");
		expect(contentType).toContain(CLIENT_ID_DOCUMENT_CONTENT_TYPE);
	});

	it("returns 404 for a provider that is not configured", async () => {
		const { customFetchImpl } = await solidTestInstance(baseConfig);
		const response = await betterFetch(
			"http://localhost:3000/api/auth/solid/client-id/unknown",
			{ method: "GET", customFetchImpl },
		);
		expect(response.error?.status).toBe(404);
	});

	it("returns 404 for a statically registered client", async () => {
		const { customFetchImpl } = await solidTestInstance({
			...baseConfig,
			clientIdDocument: false,
			clientId: "static-client",
		});
		const response = await betterFetch(
			"http://localhost:3000/api/auth/solid/client-id/pod",
			{ method: "GET", customFetchImpl },
		);
		expect(response.error?.status).toBe(404);
	});

	it("can be mounted on a custom path", async () => {
		const { customFetchImpl } = await getTestInstance({
			...testInstanceOptions,
			plugins: [
				solidOidc({
					config: [baseConfig],
					clientIdDocumentPath: "/pods/client",
				}),
			],
		});
		const response = await betterFetch<Record<string, unknown>>(
			"http://localhost:3000/api/auth/pods/client/pod",
			{ method: "GET", customFetchImpl },
		);
		expect(response.data?.client_id).toBe(
			"http://localhost:3000/api/auth/pods/client/pod",
		);
	});
});

describe("solidOidc sign in", () => {
	it("creates a session and keys the account by WebID", async () => {
		const instance = await solidTestInstance(baseConfig);
		const { callbackURL, headers } = await signIn(instance);

		expect(callbackURL).toBe("http://localhost:3000/dashboard");

		const session = await instance.client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data?.user.id).toBeDefined();

		const accounts = await instance.db.findMany<{
			providerId: string;
			accountId: string;
			issuer: string;
			refreshToken: string | null;
		}>({ model: "account" });
		const account = accounts.find((entry) => entry.providerId === "pod");
		expect(account?.accountId).toBe(HOSTED_WEBID);
		expect(account?.issuer).toBe(ISSUER);
		expect(account?.refreshToken).toBeTruthy();
		expect(loggedErrors()).toEqual([]);
	});

	/**
	 * Solid-OIDC identities carry no e-mail claim, so the user gets a stable
	 * non-routable placeholder that stays unverified.
	 *
	 * @see https://solidproject.org/TR/oidc#tokens-id
	 */
	it("synthesizes a stable unverified placeholder e-mail", async () => {
		const instance = await solidTestInstance(baseConfig);
		const { headers } = await signIn(instance);

		const session = await instance.client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data?.user.email).toMatch(
			/^[0-9a-f]{32}@solid\.placeholder\.invalid$/,
		);
		expect(session.data?.user.emailVerified).toBe(false);
	});

	it("lets mapProfileToUser supply real user attributes", async () => {
		const seen: SolidOidcProfile[] = [];
		const instance = await solidTestInstance({
			...baseConfig,
			mapProfileToUser: (profile) => {
				seen.push(profile);
				return { name: "Alice Example", email: "alice@example.com" };
			},
		});
		const { headers } = await signIn(instance);

		const session = await instance.client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data?.user.email).toBe("alice@example.com");
		expect(session.data?.user.name).toBe("Alice Example");
		expect(seen[0]?.webid).toBe(HOSTED_WEBID);
		expect(seen[0]?.iss).toBe(ISSUER);
		expect(seen[0]?.webIdIssuerConfirmation).toBe("issuer-hosted");
	});

	it("requests the openid and webid scopes", async () => {
		const instance = await solidTestInstance(baseConfig);
		const signInRes = await instance.client.signIn.social({
			provider: "pod" as "google",
			callbackURL: "http://localhost:3000/dashboard",
		});
		const scope = new URL(signInRes.data?.url || "").searchParams.get("scope");
		expect(scope?.split(" ")).toEqual(
			expect.arrayContaining(["openid", "webid", "offline_access"]),
		);
	});

	it("keeps the required scopes when custom scopes are configured", async () => {
		const instance = await solidTestInstance({
			...baseConfig,
			scopes: ["offline_access"],
		});
		const signInRes = await instance.client.signIn.social({
			provider: "pod" as "google",
			callbackURL: "http://localhost:3000/dashboard",
		});
		const scope = new URL(signInRes.data?.url || "").searchParams.get("scope");
		expect(scope?.split(" ")).toEqual(
			expect.arrayContaining(["openid", "webid", "offline_access"]),
		);
	});

	it("uses PKCE on the authorization request", async () => {
		const instance = await solidTestInstance(baseConfig);
		const signInRes = await instance.client.signIn.social({
			provider: "pod" as "google",
			callbackURL: "http://localhost:3000/dashboard",
		});
		const params = new URL(signInRes.data?.url || "").searchParams;
		expect(params.get("code_challenge_method")).toBe("S256");
		expect(params.get("code_challenge")).toBeTruthy();
		expect(params.get("nonce")).toBeTruthy();
		expect(params.get("client_id")).toBe(
			"http://localhost:3000/api/auth/solid/client-id/pod",
		);
	});
});

describe("solidOidc dpop", () => {
	it("sends a verifiable DPoP proof on the token request", async () => {
		const instance = await solidTestInstance(baseConfig);
		await signIn(instance);

		const exchange = mock.requests.find(
			(request) => request.grantType === "authorization_code",
		);
		expect(exchange?.dpop).toBeTypeOf("string");

		const verified = await verifyDpopProof({
			proofJwt: exchange!.dpop!,
			method: "POST",
			url: TOKEN_ENDPOINT,
		});
		expect(verified.htm).toBe("POST");
		expect(verified.htu).toBe(TOKEN_ENDPOINT);
		// No access token exists yet at the token endpoint, so there is nothing
		// for `ath` to bind to.
		expect(verified.ath).toBeUndefined();
	});

	it("authenticates as a public client with the document client_id", async () => {
		const instance = await solidTestInstance(baseConfig);
		await signIn(instance);

		const exchange = mock.requests.find(
			(request) => request.grantType === "authorization_code",
		);
		expect(exchange?.clientId).toBe(
			"http://localhost:3000/api/auth/solid/client-id/pod",
		);
	});

	/**
	 * RFC 9449 §5: a DPoP-bound token response says so in `token_type`. A
	 * provider that answers `Bearer` has not applied the sender constraint, and
	 * accepting it would silently downgrade every later pod request.
	 */
	it("refuses a token response that is not DPoP-bound", async () => {
		mock.tokenType = "Bearer";
		const instance = await solidTestInstance(baseConfig);
		const { callbackURL, headers } = await signIn(instance);

		expect(callbackURL).toContain("error");
		expectLoggedError(/token_type is "Bearer", expected "DPoP"/);
		const session = await instance.client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data).toBeNull();
	});

	it("can be configured to accept a bearer token response", async () => {
		mock.tokenType = "Bearer";
		const instance = await solidTestInstance({
			...baseConfig,
			dpop: { requireDpopBoundTokens: false },
		});
		const { callbackURL } = await signIn(instance);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("signs proofs with the configured algorithm", async () => {
		const instance = await solidTestInstance({
			...baseConfig,
			dpop: { algorithm: "RS256" },
		});
		await signIn(instance);

		const exchange = mock.requests.find(
			(request) => request.grantType === "authorization_code",
		);
		expect(decodeProtectedHeader(exchange!.dpop!).alg).toBe("RS256");
	});

	it("hands the token-exchange key to onTokenExchange", async () => {
		const observed: string[] = [];
		const instance = await solidTestInstance({
			...baseConfig,
			onTokenExchange: ({ keyPair }) => {
				observed.push(keyPair.jkt);
			},
		});
		await signIn(instance);

		const exchange = mock.requests.find(
			(request) => request.grantType === "authorization_code",
		);
		const proofJwk = decodeProtectedHeader(exchange!.dpop!).jwk!;
		expect(observed).toEqual([await deriveDpopJkt(proofJwk)]);
	});

	/**
	 * RFC 9449 §5 binds a refresh token issued to a public client to the key
	 * that proved possession at the token endpoint, so the refresh has to replay
	 * the same key rather than mint a fresh one.
	 */
	it("replays the same DPoP key when refreshing", async () => {
		const instance = await solidTestInstance(baseConfig);
		const { headers } = await signIn(instance);

		const accounts = await instance.client.listAccounts({
			fetchOptions: { headers },
		});
		const accountId = accounts.data?.find(
			(account) => account.providerId === "pod",
		)?.id;
		expect(accountId).toBeDefined();

		const exchangeProof = mock.requests.find(
			(request) => request.grantType === "authorization_code",
		)!.dpop!;

		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
		const refreshed = await instance.client.getAccessToken(
			{ accountId: accountId! },
			{ headers },
		);
		vi.useRealTimers();

		expect(refreshed.data?.accessToken).toBeTruthy();
		const refreshRequest = mock.requests.find(
			(request) => request.grantType === "refresh_token",
		);
		expect(refreshRequest?.dpop).toBeTypeOf("string");

		const exchangeJkt = await deriveDpopJkt(
			decodeProtectedHeader(exchangeProof).jwk!,
		);
		const refreshJkt = await deriveDpopJkt(
			decodeProtectedHeader(refreshRequest!.dpop!).jwk!,
		);
		expect(refreshJkt).toBe(exchangeJkt);
	});

	it("rebinds the stored key when the provider rotates the refresh token", async () => {
		const instance = await solidTestInstance(baseConfig);
		const { headers } = await signIn(instance);

		const accounts = await instance.client.listAccounts({
			fetchOptions: { headers },
		});
		const accountId = accounts.data?.find(
			(account) => account.providerId === "pod",
		)?.id;

		const keysBefore = await instance.db.findMany<{ tokenHash: string }>({
			model: "solidDpopKey",
		});
		expect(keysBefore).toHaveLength(1);

		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
		await instance.client.getAccessToken(
			{ accountId: accountId! },
			{ headers },
		);
		vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
		// A second refresh only succeeds if the first one moved the stored key
		// onto the rotated refresh token.
		const second = await instance.client.getAccessToken(
			{ accountId: accountId! },
			{ headers },
		);
		vi.useRealTimers();

		expect(second.data?.accessToken).toBeTruthy();
		const keysAfter = await instance.db.findMany<{ tokenHash: string }>({
			model: "solidDpopKey",
		});
		expect(keysAfter).toHaveLength(1);
		expect(keysAfter[0]?.tokenHash).not.toBe(keysBefore[0]?.tokenHash);
	});

	it("stores the private key encrypted rather than as a plain JWK", async () => {
		const instance = await solidTestInstance(baseConfig);
		await signIn(instance);

		const [record] = await instance.db.findMany<{
			privateKey: string;
			jkt: string;
			providerId: string;
		}>({ model: "solidDpopKey" });
		expect(record?.providerId).toBe("pod");
		expect(record?.jkt).toBeTruthy();
		expect(() => JSON.parse(record!.privateKey)).toThrow();
		expect(record?.privateKey).not.toContain('"d"');
	});
});

describe("solidOidc webid confirmation", () => {
	/**
	 * A provider that serves the WebID document already controls its contents,
	 * so reading the document back adds nothing.
	 */
	it("skips the document lookup for a WebID the issuer hosts", async () => {
		const getWebIdIssuers = vi.fn(async () => [ISSUER]);
		const instance = await solidTestInstance({
			...baseConfig,
			getWebIdIssuers,
		});
		const { callbackURL } = await signIn(instance);

		expect(callbackURL).toBe("http://localhost:3000/dashboard");
		expect(getWebIdIssuers).not.toHaveBeenCalled();
	});

	it("accepts a foreign WebID whose document names the issuer", async () => {
		mock.webid = FOREIGN_WEBID;
		const getWebIdIssuers = vi.fn(async () => [
			"https://other-op.example",
			ISSUER,
		]);
		const instance = await solidTestInstance({
			...baseConfig,
			getWebIdIssuers,
		});
		const { callbackURL, headers } = await signIn(instance);

		expect(getWebIdIssuers).toHaveBeenCalledWith({
			webId: FOREIGN_WEBID,
			issuer: ISSUER,
		});
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
		const session = await instance.client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data?.user.id).toBeDefined();
	});

	/**
	 * Without this check any configured provider could assert any WebID,
	 * including one belonging to a user of a different pod, and Better Auth
	 * would hand over that user's account.
	 */
	it("rejects a foreign WebID whose document does not name the issuer", async () => {
		mock.webid = FOREIGN_WEBID;
		const instance = await solidTestInstance({
			...baseConfig,
			getWebIdIssuers: async () => ["https://other-op.example"],
		});
		const { callbackURL, headers } = await signIn(instance);

		expect(callbackURL).toContain("error");
		expectLoggedError(
			/does not list .* as a trusted OpenID Provider \(found: https:\/\/other-op\.example\)/,
		);
		const session = await instance.client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data).toBeNull();
	});

	it("rejects a foreign WebID whose document cannot be read", async () => {
		mock.webid = FOREIGN_WEBID;
		const instance = await solidTestInstance({
			...baseConfig,
			getWebIdIssuers: async () => {
				throw new Error("profile document unavailable");
			},
		});
		const { callbackURL } = await signIn(instance);
		expect(callbackURL).toContain("error");
		expectLoggedError(
			/WebID issuer confirmation failed\. .*profile document unavailable/,
		);
	});

	it("treats a trailing slash on the declared issuer as the same issuer", async () => {
		mock.webid = FOREIGN_WEBID;
		const instance = await solidTestInstance({
			...baseConfig,
			getWebIdIssuers: async () => [`${ISSUER}/`],
		});
		const { callbackURL } = await signIn(instance);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("can require the document even for a WebID the issuer hosts", async () => {
		const getWebIdIssuers = vi.fn(async () => [ISSUER]);
		const instance = await solidTestInstance({
			...baseConfig,
			trustIssuerHostedWebId: false,
			getWebIdIssuers,
		});
		const { callbackURL } = await signIn(instance);

		expect(getWebIdIssuers).toHaveBeenCalledWith({
			webId: HOSTED_WEBID,
			issuer: ISSUER,
		});
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("can skip confirmation entirely", async () => {
		mock.webid = FOREIGN_WEBID;
		const getWebIdIssuers = vi.fn(async () => []);
		const instance = await solidTestInstance({
			...baseConfig,
			requireWebIdIssuerConfirmation: false,
			getWebIdIssuers,
		});
		const { callbackURL } = await signIn(instance);

		expect(callbackURL).toBe("http://localhost:3000/dashboard");
		expect(getWebIdIssuers).not.toHaveBeenCalled();
	});
});

describe("solidOidc identity claims", () => {
	it("rejects an ID token with no WebID", async () => {
		mock.webid = "";
		const instance = await solidTestInstance(baseConfig);
		const { callbackURL, headers } = await signIn(instance);

		expect(callbackURL).toContain("error");
		expectLoggedError(/has no "webid" claim/);
		const session = await instance.client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data).toBeNull();
	});

	it("rejects a WebID that is not an absolute http(s) URI", async () => {
		mock.webid = "did:example:alice";
		const instance = await solidTestInstance(baseConfig);
		const { callbackURL } = await signIn(instance);
		expect(callbackURL).toContain("error");
		expectLoggedError(/is not an absolute http\(s\) URI/);
	});

	/**
	 * OpenID Connect Core 1.0 §3.1.3.7: when `azp` is present it names the party
	 * the token was issued to, which must be this client.
	 */
	it("rejects an ID token issued to a different party", async () => {
		mock.azp = "https://attacker.example/client-id";
		const instance = await solidTestInstance(baseConfig);
		const { callbackURL } = await signIn(instance);
		expect(callbackURL).toContain("error");
		expectLoggedError(/azp .* does not match this client/);
	});

	it("accepts an ID token whose azp is this client", async () => {
		mock.azp = "http://localhost:3000/api/auth/solid/client-id/pod";
		const instance = await solidTestInstance(baseConfig);
		const { callbackURL } = await signIn(instance);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("rejects an ID token whose nonce does not match the authorization request", async () => {
		mock.nonce = "attacker-chosen-nonce";
		const instance = await solidTestInstance(baseConfig);
		const { callbackURL } = await signIn(instance);
		expect(callbackURL).toContain("error");
		expectLoggedError(/nonce does not match the authorization request/);
	});
});

describe("solidOidc discovery", () => {
	/**
	 * OpenID Connect Discovery requires the document's `issuer` to equal the
	 * issuer it was retrieved for. The configured value defines the account
	 * namespace, so a mismatch must fail rather than re-point the provider at a
	 * different authority.
	 */
	it("rejects a discovery document whose issuer does not match", async () => {
		const instance = await solidTestInstance({
			...baseConfig,
			issuer: "https://impostor.example",
			discoveryUrl: `${ISSUER}/.well-known/openid-configuration`,
		});
		const signInRes = await instance.client.signIn.social({
			provider: "pod" as "google",
			callbackURL: "http://localhost:3000/dashboard",
		});
		expect(signInRes.data?.url).toBeFalsy();
		expect(signInRes.error?.status).toBe(502);
		expectLoggedError(
			/discovery document issuer .* does not match the configured issuer/,
		);
	});

	it("builds an end-session URL from the discovered endpoint", async () => {
		const instance = await solidTestInstance(baseConfig);
		const context = await instance.auth.$context;
		const provider = context.socialProviders.find(
			(candidate) => candidate.id === "pod",
		);
		const endSessionURL = await provider?.createEndSessionURL?.({
			idToken: "id-token",
		});
		expect(endSessionURL?.toString()).toBe(
			`${discovery.data!.end_session_endpoint}?id_token_hint=id-token`,
		);
	});

	it("returns no end-session URL when provider logout is disabled", async () => {
		const instance = await solidTestInstance({
			...baseConfig,
			disableProviderLogout: true,
		});
		const context = await instance.auth.$context;
		const provider = context.socialProviders.find(
			(candidate) => candidate.id === "pod",
		);
		expect(
			await provider?.createEndSessionURL?.({ idToken: "id-token" }),
		).toBeNull();
	});
});
