import type {
	OAuthAuthenticationContext,
	OAuthClient,
} from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { deriveDpopJkt } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CibaNotification, CibaOptions } from "./index";
import { CIBA_GRANT_TYPE, ciba } from "./index";

const baseURL = "http://localhost:3000";
const resource = "https://api.example.com";
const secondResource = "https://files.example.com";
// A resource whose policy does not allow `openid`.
const reportsResource = "https://reports.example.com";
const INTERVAL = 1;
const POLL = { backchannel_token_delivery_mode: "poll" };
const notificationEndpoint = "https://client.example.com/ciba";
const PING = {
	backchannel_token_delivery_mode: "ping",
	backchannel_client_notification_endpoint: notificationEndpoint,
};

const mfaAcr = "urn:example:acr:mfa";
const resolveAuthenticationContext =
	vi.fn<() => OAuthAuthenticationContext | undefined>();

let lastNotification: CibaNotification | undefined;
const sendNotification = vi.fn((notification: CibaNotification) => {
	lastNotification = notification;
});

const { auth, signInWithTestUser, signInWithUser, customFetchImpl, testUser } =
	await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [
					resource,
					secondResource,
					{ identifier: reportsResource, allowedScopes: ["profile"] },
				],
				enforcePerClientResources: false,
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				authenticationContext: {
					acrValuesSupported: ["0", mfaAcr],
					resolve: resolveAuthenticationContext,
				},
			}),
			ciba({
				resultPage: "/ciba",
				interval: INTERVAL,
				deliveryModes: ["poll", "ping"],
				allowPublicClients: true,
				sendNotification,
			}),
		],
	});

const { headers } = await signInWithTestUser();
const secondUser = {
	email: "second@example.com",
	password: "password1234",
	name: "Second User",
};

let pollClient: OAuthClient;
let otherClient: OAuthClient;
let secondUserHeaders: Headers;

function createClient(metadata?: Record<string, unknown>, extra = {}) {
	return auth.api.adminCreateOAuthClient({
		headers,
		body: {
			client_name: "Support Agent",
			grant_types: [CIBA_GRANT_TYPE],
			metadata,
			...extra,
		},
	});
}

/** HTTP Basic for a confidential client; `client_id` in the form for a public one. */
function clientAuthentication(client: OAuthClient | null): {
	headers: Record<string, string>;
	params: Record<string, string>;
} {
	if (!client) return { headers: {}, params: {} };
	return client.client_secret
		? {
				headers: {
					authorization: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`,
				},
				params: {},
			}
		: { headers: {}, params: { client_id: client.client_id } };
}

/** The provider's default token hash, used to reach rows by raw auth_req_id. */
async function hashAuthReqId(authReqId: string): Promise<string> {
	const digest = await createHash("SHA-256").digest(
		new TextEncoder().encode(authReqId),
	);
	return base64Url.encode(new Uint8Array(digest), { padding: false });
}

async function expireRequest(authReqId: string) {
	const ctx = await auth.$context;
	await ctx.adapter.update({
		model: "cibaRequest",
		where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
		update: { expiresAt: new Date(Date.now() - 1000) },
	});
}

const waitInterval = () =>
	new Promise((resolve) => setTimeout(resolve, INTERVAL * 1000 + 50));

/** CIBA §7.1: the backchannel request is form-encoded. */
async function bcAuthorize(
	params: Record<string, string | string[]>,
	client: OAuthClient | null = pollClient,
	fetchImpl = customFetchImpl,
) {
	const authentication = clientAuthentication(client);
	const body = new URLSearchParams(authentication.params);
	for (const [key, value] of Object.entries(params)) {
		for (const v of [value].flat()) body.append(key, v);
	}
	const res = await fetchImpl(`${baseURL}/api/auth/oauth2/bc-authorize`, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			...authentication.headers,
		},
		body: body.toString(),
	});
	return { status: res.status, headers: res.headers, body: await res.json() };
}

/** Starts a request and returns its auth_req_id and the link sent to the user. */
async function start(
	params: Record<string, string | string[]> = {},
	client = pollClient,
) {
	const res = await bcAuthorize(
		{ scope: "openid profile", login_hint: testUser.email, ...params },
		client,
	);
	expect(res.status).toBe(200);
	return {
		authReqId: res.body.auth_req_id as string,
		url: lastNotification!.url,
	};
}

async function poll(
	authReqId: string,
	client: OAuthClient = pollClient,
	extraHeaders: Record<string, string> = {},
	resources: string[] = [],
) {
	const authentication = clientAuthentication(client);
	const body = new URLSearchParams({
		...authentication.params,
		grant_type: CIBA_GRANT_TYPE,
		auth_req_id: authReqId,
	});
	for (const selected of resources) body.append("resource", selected);
	const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/token`, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			...authentication.headers,
			...extraHeaders,
		},
		body: body.toString(),
	});
	return { status: res.status, body: await res.json() };
}

/** Follows a browser request and returns the URL the provider sends it to. */
async function redirectOf(
	url: string,
	sessionHeaders: Headers,
	body?: Record<string, unknown>,
) {
	const requestHeaders = new Headers(sessionHeaders);
	requestHeaders.set("accept", "application/json");
	if (body) requestHeaders.set("content-type", "application/json");
	const res = await customFetchImpl(url, {
		method: body ? "POST" : "GET",
		headers: requestHeaders,
		body: body ? JSON.stringify(body) : undefined,
	});
	const json = (await res.json()) as { url?: string };
	if (!json.url) throw new Error(`No redirect from ${url}: ${res.status}`);
	return new URL(json.url, baseURL);
}

/** Opens the link from the notification, as the user's browser does. */
function openLink(url: string, sessionHeaders = headers) {
	return redirectOf(url, sessionHeaders);
}

/** Answers the consent page the link led to. */
function answerConsent(
	consent: URL,
	accept: boolean,
	sessionHeaders = headers,
	scope?: string,
) {
	return redirectOf(`${baseURL}/api/auth/oauth2/consent`, sessionHeaders, {
		accept,
		...(scope ? { scope } : {}),
		oauth_query: consent.search.slice(1),
	});
}

async function approve(url: string) {
	const consent = await openLink(url);
	const result = await answerConsent(consent, true);
	expect(result.toString()).toBe(`${baseURL}/ciba?status=approved`);
}

beforeAll(async () => {
	pollClient = await createClient(POLL);
	otherClient = await createClient(POLL);
	await auth.api.signUpEmail({ body: secondUser });
	secondUserHeaders = (
		await signInWithUser(secondUser.email, secondUser.password)
	).headers;
});

/**
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
describe("ciba poll mode", () => {
	it("issues tokens once after the hinted user approves on the consent page", async () => {
		const res = await bcAuthorize({
			scope: "openid profile",
			login_hint: testUser.email,
			binding_message: "Code 4821",
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(res.body).toMatchObject({ expires_in: 300, interval: INTERVAL });
		const authReqId = res.body.auth_req_id as string;
		expect((await poll(authReqId)).body.error).toBe("authorization_pending");

		const consent = await openLink(lastNotification!.url);
		expect(consent.pathname).toBe("/consent");
		expect(consent.searchParams.get("client_id")).toBe(pollClient.client_id);
		expect(consent.searchParams.get("scope")).toBe("openid profile");
		expect(consent.searchParams.get("binding_message")).toBe("Code 4821");
		const result = await answerConsent(consent, true);
		expect(result.toString()).toBe(`${baseURL}/ciba?status=approved`);

		await waitInterval();
		const issued = await poll(authReqId);
		expect(issued.status).toBe(200);
		expect(issued.body.token_type).toBe("Bearer");
		expect(decodeJwt(issued.body.id_token as string).sub).toBe(
			lastNotification!.user.id,
		);

		await waitInterval();
		expect((await poll(authReqId)).body.error).toBe("invalid_grant");
	});

	it("sends the user a link to the provider with the request details", async () => {
		const { url } = await start({ binding_message: "Code 77" });
		expect(lastNotification).toMatchObject({
			user: { email: testUser.email },
			clientId: pollClient.client_id,
			clientName: "Support Agent",
			scopes: ["openid", "profile"],
			bindingMessage: "Code 77",
			expiresAt: expect.any(Date),
		});
		expect(url).toMatch(
			new RegExp(`^${baseURL}/api/auth/oauth2/authorize\\?ciba_request_id=`),
		);
	});

	it("still answers the client when the notification fails", async () => {
		sendNotification.mockImplementationOnce(() => {
			throw new Error("push service down");
		});
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		expect(res.status).toBe(200);
		expect(res.body.auth_req_id).toEqual(expect.any(String));
	});

	it("shows consent every time, even for a client that skips consent", async () => {
		const trusted = await createClient(POLL, { skip_consent: true });
		const first = await start({}, trusted);
		await approve(first.url);
		const second = await start({}, trusted);
		expect((await openLink(second.url)).pathname).toBe("/consent");
	});

	it("sends a signed-out user to sign in before showing anything", async () => {
		const { url } = await start({ binding_message: "Code 9" });
		const login = await openLink(url, new Headers());
		expect(login.pathname).toBe("/login");
		expect(login.searchParams.get("binding_message")).toBeNull();
		expect(login.searchParams.get("scope")).toBeNull();
	});

	it("lets only the hinted user open, approve, or deny the request", async () => {
		const { authReqId, url } = await start();
		const refused = await openLink(url, secondUserHeaders);
		expect(refused.pathname).toBe("/ciba");
		expect(refused.searchParams.get("error")).toBe("invalid_request");

		// Another user replays the owner's consent page.
		const consent = await openLink(url);
		for (const accept of [true, false]) {
			const replay = await answerConsent(consent, accept, secondUserHeaders);
			expect(replay.searchParams.get("error")).toBe("invalid_request");
		}
		expect((await poll(authReqId)).body.error).toBe("authorization_pending");

		await answerConsent(consent, true);
		await waitInterval();
		expect((await poll(authReqId)).status).toBe(200);
	});

	it("ends the request when the user denies it", async () => {
		const { authReqId, url } = await start();
		expect((await poll(authReqId)).body.error).toBe("authorization_pending");
		const consent = await openLink(url);
		const result = await answerConsent(consent, false);
		expect(result.toString()).toBe(`${baseURL}/ciba?status=denied`);
		// The decision is final: the link no longer opens the request.
		expect((await openLink(url)).searchParams.get("error")).toBe(
			"invalid_request",
		);

		expect((await poll(authReqId)).body.error).toBe("access_denied");
		await waitInterval();
		expect((await poll(authReqId)).body.error).toBe("invalid_grant");
	});

	it("narrows the token to the scopes the user approved", async () => {
		const { authReqId, url } = await start();
		const consent = await openLink(url);
		await answerConsent(consent, true, headers, "openid");
		const issued = await poll(authReqId);
		expect(issued.body.scope).toBe("openid");
	});

	it("keeps the request pending when the user removes openid on consent", async () => {
		const { authReqId, url } = await start();
		const consent = await openLink(url);
		const refused = await answerConsent(consent, true, headers, "profile");
		expect(refused.searchParams.get("error")).toBe("invalid_scope");
		expect((await poll(authReqId)).body.error).toBe("authorization_pending");
	});

	it("returns slow_down at a fixed interval", async () => {
		const { authReqId } = await start();
		expect((await poll(authReqId)).body.error).toBe("authorization_pending");
		expect((await poll(authReqId)).body.error).toBe("slow_down");
		// The interval does not grow after slow_down.
		await waitInterval();
		expect((await poll(authReqId)).body.error).toBe("authorization_pending");
	});

	it("issues to only one of two concurrent polls", async () => {
		const { authReqId, url } = await start();
		await approve(url);
		const results = await Promise.all([poll(authReqId), poll(authReqId)]);
		expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
	});

	it("expires the request for both the client and the link", async () => {
		const { authReqId, url } = await start();
		await expireRequest(authReqId);
		expect((await openLink(url)).searchParams.get("error")).toBe(
			"invalid_request",
		);
		expect((await poll(authReqId)).body.error).toBe("expired_token");
	});

	it("deletes expired requests that were never polled again", async () => {
		const abandoned = await start();
		await expireRequest(abandoned.authReqId);
		await start();
		const ctx = await auth.$context;
		expect(
			await ctx.adapter.findOne({
				model: "cibaRequest",
				where: [
					{
						field: "authReqId",
						value: await hashAuthReqId(abandoned.authReqId),
					},
				],
			}),
		).toBeNull();
	});

	it("refuses another client's auth_req_id without consuming it", async () => {
		const { authReqId, url } = await start();
		await approve(url);
		expect((await poll(authReqId, otherClient)).body.error).toBe(
			"invalid_grant",
		);
		expect((await poll(authReqId)).status).toBe(200);
	});

	it("rejects an unknown auth_req_id", async () => {
		expect((await poll("unknown")).body.error).toBe("invalid_grant");
	});

	it("issues auth_time from the approving session", async () => {
		const { authReqId, url } = await start();
		await approve(url);
		const issued = await poll(authReqId);
		const session = await auth.api.getSession({ headers });
		expect(decodeJwt(issued.body.id_token as string).auth_time).toBe(
			Math.floor(new Date(session!.session.createdAt).getTime() / 1000),
		);
	});

	it("carries the approving session's acr and amr into the ID token", async () => {
		resolveAuthenticationContext.mockReturnValueOnce({
			acr: mfaAcr,
			amr: ["pwd", "otp"],
		});
		const { authReqId, url } = await start();
		await approve(url);
		const issued = await poll(authReqId);
		const idToken = decodeJwt(issued.body.id_token as string);
		expect(idToken.acr).toBe(mfaAcr);
		expect(idToken.amr).toEqual(["pwd", "otp"]);
	});

	it("binds the token to the DPoP key presented on the poll", async () => {
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const publicJwk: JWK = await exportJWK(publicKey);
		const { authReqId, url } = await start();
		await approve(url);
		const proof = await new SignJWT({
			jti: crypto.randomUUID(),
			htm: "POST",
			htu: `${baseURL}/api/auth/oauth2/token`,
			iat: Math.floor(Date.now() / 1000),
		})
			.setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: publicJwk })
			.sign(privateKey);
		const issued = await poll(authReqId, pollClient, { dpop: proof });
		expect(issued.body.token_type).toBe("DPoP");
		const introspection = await customFetchImpl(
			`${baseURL}/api/auth/oauth2/introspect`,
			{
				method: "POST",
				headers: {
					...clientAuthentication(pollClient).headers,
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ token: issued.body.access_token }),
			},
		).then((r) => r.json());
		expect(introspection.cnf).toEqual({ jkt: await deriveDpopJkt(publicJwk) });
	});

	it("binds the token to every repeated resource (RFC 8707)", async () => {
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			resource: [resource, secondResource],
		});
		await approve(lastNotification!.url);
		const issued = await poll(res.body.auth_req_id as string);
		expect(decodeJwt(issued.body.access_token as string).aud).toEqual(
			expect.arrayContaining([resource, secondResource]),
		);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc8707#section-2.2
	 */
	it("narrows the token to the resources the poll selects", async () => {
		const { authReqId, url } = await start({
			resource: [resource, secondResource],
		});
		await approve(url);
		const unapproved = await poll(authReqId, pollClient, {}, [reportsResource]);
		expect(unapproved.body.error).toBe("invalid_target");

		const issued = await poll(authReqId, pollClient, {}, [secondResource]);
		expect(issued.status).toBe(200);
		const { aud } = decodeJwt(issued.body.access_token as string);
		expect([aud].flat()).toContain(secondResource);
		expect([aud].flat()).not.toContain(resource);
	});

	it("lets a refresh token reach every approved resource after a narrowed poll", async () => {
		const client = await createClient(POLL, {
			grant_types: [CIBA_GRANT_TYPE, "refresh_token"],
		});
		const { authReqId, url } = await start(
			{ scope: "openid offline_access", resource: [resource, secondResource] },
			client,
		);
		await approve(url);
		const issued = await poll(authReqId, client, {}, [resource]);
		expect(issued.body.refresh_token).toEqual(expect.any(String));

		const refreshed = await customFetchImpl(
			`${baseURL}/api/auth/oauth2/token`,
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					...clientAuthentication(client).headers,
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: issued.body.refresh_token,
					resource: secondResource,
				}).toString(),
			},
		).then((r) => r.json());
		expect(refreshed.error).toBeUndefined();
		expect([decodeJwt(refreshed.access_token).aud].flat()).toContain(
			secondResource,
		);
	});

	it("refuses a resource whose policy drops openid", async () => {
		const res = await bcAuthorize({
			scope: "openid profile",
			login_hint: testUser.email,
			resource: reportsResource,
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_scope");
	});

	it("keeps the approval when the resource policy no longer allows openid", async () => {
		const { authReqId, url } = await start({ resource });
		await approve(url);
		const ctx = await auth.$context;
		const where = [{ field: "identifier", value: resource }];
		await ctx.adapter.update({
			model: "oauthResource",
			where,
			update: { allowedScopes: ["profile"] },
		});
		try {
			expect((await poll(authReqId)).body.error).toBe("invalid_scope");
		} finally {
			await ctx.adapter.update({
				model: "oauthResource",
				where,
				update: { allowedScopes: null },
			});
		}
		expect((await poll(authReqId)).status).toBe(200);
	});
});

describe("ciba backchannel request validation", () => {
	it.each([
		["a scope without openid", { scope: "profile" }, "invalid_scope"],
		[
			"a binding_message with control characters",
			{ binding_message: "line\nbreak" },
			"invalid_binding_message",
		],
		[
			"a binding_message with a bidirectional override",
			{ binding_message: "Code ‮1234" },
			"invalid_binding_message",
		],
		[
			"a binding_message over 64 characters",
			{ binding_message: "x".repeat(65) },
			"invalid_binding_message",
		],
		[
			"an unknown user",
			{ login_hint: "nobody@example.com" },
			"unknown_user_id",
		],
		["two hints", { id_token_hint: "token" }, "invalid_request"],
		[
			"a non-positive requested_expiry",
			{ requested_expiry: "0" },
			"invalid_request",
		],
		["a malformed resource", { resource: "not a uri" }, "invalid_target"],
		[
			"an unknown resource",
			{ resource: "https://other.example" },
			"invalid_target",
		],
	])("rejects %s", async (_, params, error) => {
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			...params,
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe(error);
	});

	it("accepts a binding_message in any script", async () => {
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			binding_message: "コード 4821",
		});
		expect(res.status).toBe(200);
	});

	it("rejects an unsupported hint type", async () => {
		const res = await bcAuthorize({ scope: "openid", id_token_hint: "token" });
		expect(res.body.error).toBe("invalid_request");
	});

	it("rejects a repeated parameter other than resource", async () => {
		const res = await bcAuthorize({
			scope: ["openid", "openid profile"],
			login_hint: testUser.email,
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});

	it("rejects a JSON body (CIBA §7.1)", async () => {
		const res = await customFetchImpl(
			`${baseURL}/api/auth/oauth2/bc-authorize`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					...clientAuthentication(pollClient).headers,
				},
				body: JSON.stringify({ scope: "openid", login_hint: testUser.email }),
			},
		);
		expect(res.status).toBe(415);
	});

	it("rejects an unauthenticated client", async () => {
		const res = await bcAuthorize(
			{
				client_id: pollClient.client_id,
				scope: "openid",
				login_hint: testUser.email,
			},
			null,
		);
		expect(res.body.error).toBe("invalid_client");
	});

	it.each([
		["no delivery mode", undefined],
		["push delivery", { backchannel_token_delivery_mode: "push" }],
		["ping without an endpoint", { backchannel_token_delivery_mode: "ping" }],
		[
			"ping to a non-https endpoint",
			{
				...PING,
				backchannel_client_notification_endpoint:
					"http://client.example.com/ciba",
			},
		],
		[
			"ping to a private host",
			{
				...PING,
				backchannel_client_notification_endpoint: "https://127.0.0.1/ciba",
			},
		],
	])("refuses to register a CIBA client with %s", async (_, metadata) => {
		await expect(createClient(metadata)).rejects.toMatchObject({
			body: { error: "invalid_client_metadata" },
		});
	});

	it("rejects a client whose stored delivery mode is no longer valid", async () => {
		const client = await createClient(POLL);
		const ctx = await auth.$context;
		await ctx.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: client.client_id }],
			update: { metadata: JSON.stringify({}) },
		});
		const res = await bcAuthorize(
			{ scope: "openid", login_hint: testUser.email },
			client,
		);
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("unauthorized_client");
	});

	/**
	 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html#registration
	 */
	it("registers a CIBA client through open registration (CIBA §4)", async () => {
		const body = {
			client_name: "Registered Agent",
			grant_types: [CIBA_GRANT_TYPE],
			token_endpoint_auth_method: "client_secret_basic",
		};
		const unsupported = { ...body, backchannel_token_delivery_mode: "push" };
		await expect(
			auth.api.registerOAuthClient({ body: unsupported }),
		).rejects.toMatchObject({ body: { error: "invalid_client_metadata" } });

		const poll = { ...body, ...POLL };
		const registered = await auth.api.registerOAuthClient({ body: poll });
		const res = await bcAuthorize(
			{ scope: "openid", login_hint: testUser.email },
			registered,
		);
		expect(res.status).toBe(200);
	});

	it("lets a public client complete the flow with allowPublicClients", async () => {
		const publicClient = await createClient(POLL, {
			token_endpoint_auth_method: "none",
		});
		const { authReqId, url } = await start({}, publicClient);
		await approve(url);
		expect((await poll(authReqId, publicClient)).status).toBe(200);
	});

	it("caps requested_expiry at the configured lifetime", async () => {
		const short = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			requested_expiry: "60",
		});
		expect(short.body.expires_in).toBe(60);
		const long = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			requested_expiry: "9999",
		});
		expect(long.body.expires_in).toBe(300);
	});
});

describe("ciba discovery metadata", () => {
	it("advertises the backchannel endpoint and configured delivery modes", async () => {
		const metadata = (await auth.api.getOpenIdConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata).toMatchObject({
			backchannel_authentication_endpoint: `${baseURL}/api/auth/oauth2/bc-authorize`,
			backchannel_token_delivery_modes_supported: ["poll", "ping"],
			backchannel_user_code_parameter_supported: false,
		});
		expect(metadata.grant_types_supported).toContain(CIBA_GRANT_TYPE);
	});
});

/**
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html#rfc.section.10.2
 */
describe("ciba ping mode", () => {
	let pingClient: OAuthClient;
	const token = "client-token.123";

	beforeAll(async () => {
		pingClient = await createClient(PING);
	});

	function mockPing(
		response = async () => new Response(null, { status: 204 }),
	) {
		return vi.spyOn(globalThis, "fetch").mockImplementation(response);
	}

	const startPing = () =>
		start({ client_notification_token: token }, pingClient);

	it("pings the client's endpoint when the user approves", async () => {
		const ping = mockPing();
		const { authReqId, url } = await startPing();
		expect(ping).not.toHaveBeenCalled();
		await approve(url);

		expect(ping).toHaveBeenCalledOnce();
		const [endpoint, init] = ping.mock.calls[0]!;
		expect(endpoint).toBe(notificationEndpoint);
		expect(init).toMatchObject({ method: "POST", redirect: "error" });
		expect(new Headers(init?.headers).get("authorization")).toBe(
			`Bearer ${token}`,
		);
		expect(JSON.parse(init?.body as string)).toEqual({
			auth_req_id: authReqId,
		});
		expect((await poll(authReqId, pingClient)).status).toBe(200);
	});

	it("stores the client_notification_token encrypted", async () => {
		const { authReqId } = await startPing();
		const ctx = await auth.$context;
		const row = await ctx.adapter.findOne<Record<string, unknown>>({
			model: "cibaRequest",
			where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
		});
		expect(row?.encryptedClientNotificationToken).toEqual(expect.any(String));
		expect(row?.encryptedClientNotificationToken).not.toContain(token);
	});

	it("pings the client when the user denies", async () => {
		const ping = mockPing();
		const { authReqId, url } = await startPing();
		await answerConsent(await openLink(url), false);
		expect(ping).toHaveBeenCalledOnce();
		expect((await poll(authReqId, pingClient)).body.error).toBe(
			"access_denied",
		);
	});

	it("keeps the decision when the ping fails", async () => {
		mockPing(async () => {
			throw new TypeError("fetch failed");
		});
		const { authReqId, url } = await startPing();
		await approve(url);
		expect((await poll(authReqId, pingClient)).status).toBe(200);
	});

	it.each([
		["a missing client_notification_token", {}],
		[
			"a client_notification_token that is not a bearer token",
			{ client_notification_token: "has spaces" },
		],
		[
			"a client_notification_token over 1024 characters",
			{ client_notification_token: "x".repeat(1025) },
		],
	])("rejects %s", async (_, params) => {
		const res = await bcAuthorize(
			{ scope: "openid", login_hint: testUser.email, ...params },
			pingClient,
		);
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});

	it("does not ping a poll client", async () => {
		const ping = mockPing();
		const { url } = await start({ client_notification_token: token });
		await approve(url);
		expect(ping).not.toHaveBeenCalled();
	});
});

it("keeps one instance's schema overrides out of another", () => {
	ciba({
		resultPage: "/ciba",
		sendNotification,
		schema: { cibaRequest: { modelName: "renamedCibaRequest" } },
	});
	expect(
		ciba({ resultPage: "/ciba", sendNotification }).schema.cibaRequest,
	).not.toHaveProperty("modelName");
});

describe("ciba defaults", async () => {
	const resolveUser = vi.fn<NonNullable<CibaOptions["resolveUser"]>>(
		async () => null,
	);
	const instance = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
			ciba({ resultPage: "/ciba", resolveUser, sendNotification }),
		],
	});
	const { headers: adminHeaders } = await instance.signInWithTestUser();
	const register = (extra = {}) =>
		instance.auth.api.adminCreateOAuthClient({
			headers: adminHeaders,
			body: { grant_types: [CIBA_GRANT_TYPE], metadata: POLL, ...extra },
		});
	const request = { scope: "openid", login_hint: "ada@example.com" };

	it("rejects a public client", async () => {
		const client = await register({ token_endpoint_auth_method: "none" });
		const res = await bcAuthorize(request, client, instance.customFetchImpl);
		expect(res.body.error).toBe("invalid_client");
	});

	it("gives resolveUser the requesting client", async () => {
		const client = await register();
		const res = await bcAuthorize(request, client, instance.customFetchImpl);
		expect(res.body.error).toBe("unknown_user_id");
		expect(resolveUser).toHaveBeenCalledWith(
			{
				loginHint: "ada@example.com",
				client: expect.objectContaining({ clientId: client.client_id }),
			},
			expect.anything(),
		);
	});

	it("advertises poll delivery only", async () => {
		const metadata = (await instance.auth.api.getOpenIdConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.backchannel_token_delivery_modes_supported).toEqual([
			"poll",
		]);
	});
});
