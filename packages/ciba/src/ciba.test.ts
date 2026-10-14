import type { OAuthClient } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { deriveDpopJkt } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SendNotificationData } from "./index";
import { CIBA_GRANT_TYPE, ciba } from "./index";

const baseURL = "http://localhost:3000";
const resource = "https://api.example.com";
const secondResource = "https://files.example.com";
const notificationEndpoint = "https://client.example.com/ciba";
const INTERVAL = 2;

let lastNotification: SendNotificationData | undefined;

const { auth, signInWithTestUser, signInWithUser, customFetchImpl, testUser } =
	await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resource, secondResource],
				enforcePerClientResources: false,
			}),
			ciba({
				approvalPage: "/approve",
				deliveryModes: ["poll", "ping"],
				interval: INTERVAL,
				sendNotification: (data) => {
					lastNotification = data;
				},
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
let pingClient: OAuthClient;
let secondUserHeaders: Headers;

function createClient(metadata?: Record<string, unknown>, extra = {}) {
	return auth.api.adminCreateOAuthClient({
		headers,
		body: { grant_types: [CIBA_GRANT_TYPE], metadata, ...extra },
	});
}

function basicAuth(client: OAuthClient): string {
	return `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`;
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

/** CIBA §7.1: the backchannel request is form-encoded. */
async function bcAuthorize(
	params: Record<string, string | string[]>,
	client: OAuthClient | null = pollClient,
) {
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		for (const v of [value].flat()) body.append(key, v);
	}
	const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/bc-authorize`, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			...(client ? { authorization: basicAuth(client) } : {}),
		},
		body: body.toString(),
	});
	return { status: res.status, headers: res.headers, body: await res.json() };
}

async function start(params: Record<string, string> = {}, client = pollClient) {
	const res = await bcAuthorize(
		{ scope: "openid profile", login_hint: testUser.email, ...params },
		client,
	);
	expect(res.status).toBe(200);
	return res.body.auth_req_id as string;
}

async function poll(
	authReqId: string,
	client: OAuthClient = pollClient,
	extraHeaders: Record<string, string> = {},
) {
	const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/token`, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			authorization: basicAuth(client),
			...extraHeaders,
		},
		body: new URLSearchParams({
			grant_type: CIBA_GRANT_TYPE,
			auth_req_id: authReqId,
		}).toString(),
	});
	return { status: res.status, body: await res.json() };
}

function approve(authReqId: string, sessionHeaders = headers) {
	return auth.api.cibaApprove({
		headers: sessionHeaders,
		body: { auth_req_id: authReqId },
	});
}

beforeAll(async () => {
	pollClient = await createClient({ backchannel_token_delivery_mode: "poll" });
	otherClient = await createClient({ backchannel_token_delivery_mode: "poll" });
	pingClient = await createClient({
		backchannel_token_delivery_mode: "ping",
		backchannel_client_notification_endpoint: notificationEndpoint,
	});
	await auth.api.signUpEmail({ body: secondUser });
	secondUserHeaders = (
		await signInWithUser(secondUser.email, secondUser.password)
	).headers;
});

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
describe("ciba poll mode", () => {
	it("issues tokens once after approval", async () => {
		const res = await bcAuthorize({
			scope: "openid profile",
			login_hint: testUser.email,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(res.body.expires_in).toBe(300);
		expect(res.body.interval).toBe(INTERVAL);
		const authReqId = res.body.auth_req_id as string;
		expect(lastNotification?.approvalUrl).toBe(
			`${baseURL}/approve?auth_req_id=${authReqId}`,
		);

		await approve(authReqId);
		const issued = await poll(authReqId);
		expect(issued.status).toBe(200);
		expect(issued.body.token_type).toBe("Bearer");
		expect(issued.body.id_token).toBeDefined();

		const replay = await poll(authReqId);
		expect(replay.body.error).toBe("invalid_grant");
	});

	it("authenticates a client_secret_post client from the form body", async () => {
		const client = await createClient(
			{ backchannel_token_delivery_mode: "poll" },
			{ token_endpoint_auth_method: "client_secret_post" },
		);
		const res = await bcAuthorize(
			{
				client_id: client.client_id,
				client_secret: client.client_secret as string,
				scope: "openid",
				login_hint: testUser.email,
			},
			null,
		);
		expect(res.status).toBe(200);
	});

	it("returns authorization_pending, then slow_down on a fast poll", async () => {
		const authReqId = await start();
		expect((await poll(authReqId)).body.error).toBe("authorization_pending");
		expect((await poll(authReqId)).body.error).toBe("slow_down");
	});

	it("issues to only one of two concurrent polls", async () => {
		const authReqId = await start();
		await approve(authReqId);
		const results = await Promise.all([poll(authReqId), poll(authReqId)]);
		expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
	});

	it("returns access_denied once after the user denies", async () => {
		const authReqId = await start();
		await auth.api.cibaDeny({ headers, body: { auth_req_id: authReqId } });
		expect((await poll(authReqId)).body.error).toBe("access_denied");
		expect((await poll(authReqId)).body.error).toBe("invalid_grant");
	});

	it("returns expired_token for an expired request", async () => {
		const authReqId = await start();
		await expireRequest(authReqId);
		expect((await poll(authReqId)).body.error).toBe("expired_token");
	});

	it("refuses another client's auth_req_id without consuming it", async () => {
		const authReqId = await start();
		await approve(authReqId);
		const stolen = await poll(authReqId, otherClient);
		expect(stolen.body.error).toBe("invalid_grant");
		expect((await poll(authReqId)).status).toBe(200);
	});

	it("rejects an unknown auth_req_id", async () => {
		expect((await poll("unknown")).body.error).toBe("invalid_grant");
	});

	it("issues auth_time from the approving session", async () => {
		const authReqId = await start();
		await approve(authReqId);
		const issued = await poll(authReqId);
		const session = await auth.api.getSession({ headers });
		const idToken = decodeJwt(issued.body.id_token as string);
		expect(idToken.auth_time).toBe(
			Math.floor(new Date(session!.session.createdAt).getTime() / 1000),
		);
	});

	it("binds the token to the DPoP key presented on the poll", async () => {
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const publicJwk: JWK = await exportJWK(publicKey);
		const authReqId = await start();
		await approve(authReqId);
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
					authorization: basicAuth(pollClient),
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
		const authReqId = res.body.auth_req_id as string;
		await approve(authReqId);
		const issued = await poll(authReqId);
		expect(decodeJwt(issued.body.access_token as string).aud).toEqual(
			expect.arrayContaining([resource, secondResource]),
		);
	});

	it("binds the token to a requested resource", async () => {
		const authReqId = await start({ resource });
		await approve(authReqId);
		const issued = await poll(authReqId);
		expect(decodeJwt(issued.body.access_token as string).aud).toContain(
			resource,
		);
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
			"an unknown user",
			{ login_hint: "nobody@example.com" },
			"unknown_user_id",
		],
		["two hints", { id_token_hint: "token" }, "invalid_request"],
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

	it.each([
		["a missing scope", { login_hint: "ada@example.com" }, "invalid_request"],
		[
			"a binding_message over 256 characters",
			{ scope: "openid", binding_message: "x".repeat(257) },
			"invalid_binding_message",
		],
	])("returns the CIBA error envelope for %s", async (_, params, error) => {
		const res = await bcAuthorize(params);
		expect(res.status).toBe(400);
		expect(res.body.error).toBe(error);
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
					authorization: basicAuth(pollClient),
				},
				body: JSON.stringify({ scope: "openid", login_hint: testUser.email }),
			},
		);
		expect(res.status).toBe(415);
	});

	it("rejects an unsupported hint type", async () => {
		const res = await bcAuthorize({ scope: "openid", id_token_hint: "token" });
		expect(res.body.error).toBe("invalid_request");
	});

	it("rejects a public client by default", async () => {
		const client = await createClient(
			{ backchannel_token_delivery_mode: "poll" },
			{ token_endpoint_auth_method: "none" },
		);
		const res = await bcAuthorize(
			{
				client_id: client.client_id,
				scope: "openid",
				login_hint: testUser.email,
			},
			null,
		);
		expect(res.body.error).toBe("invalid_client");
	});

	it("rejects authorization_details when no types are configured", async () => {
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			authorization_details: JSON.stringify([{ type: "payment_initiation" }]),
		});
		expect(res.body.error).toBe("invalid_authorization_details");
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
	])("rejects a client registered with %s", async (_, metadata) => {
		const client = await createClient(metadata);
		const res = await bcAuthorize(
			{ scope: "openid", login_hint: testUser.email },
			client,
		);
		expect(res.body.error).toBe("invalid_request");
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

	it("passes the binding_message to the notification", async () => {
		await start({ binding_message: "Code 4821" });
		expect(lastNotification?.bindingMessage).toBe("Code 4821");
	});
});

describe("ciba approval endpoints", () => {
	it("lists pending requests and approves one by request_id", async () => {
		const authReqId = await start({ binding_message: "Code 12" });
		const pending = await auth.api.cibaRequests({ headers });
		const listed = pending.find((r) => r.binding_message === "Code 12");
		expect(listed?.request_id).toBeDefined();
		expect(JSON.stringify(pending)).not.toContain(authReqId);
		const requestId = listed?.request_id as string;
		expect(
			await auth.api.cibaRequest({ headers, query: { request_id: requestId } }),
		).toMatchObject({ request_id: requestId, status: "pending" });
		await auth.api.cibaApprove({ headers, body: { request_id: requestId } });
		expect((await poll(authReqId)).status).toBe(200);
	});

	it("requires exactly one of auth_req_id or request_id", async () => {
		await expect(
			auth.api.cibaApprove({ headers, body: {} }),
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it("shows the request to its owner only", async () => {
		const authReqId = await start({ binding_message: "Code 77", resource });
		const details = await auth.api.cibaRequest({
			headers,
			query: { auth_req_id: authReqId },
		});
		expect(details).toMatchObject({
			client_id: pollClient.client_id,
			scope: "openid profile",
			binding_message: "Code 77",
			resources: [resource],
			status: "pending",
		});
		await expect(
			auth.api.cibaRequest({
				headers: secondUserHeaders,
				query: { auth_req_id: authReqId },
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		await expect(
			auth.api.cibaRequest({ query: { auth_req_id: authReqId } }),
		).rejects.toMatchObject({ statusCode: 401 });
	});

	it("does not let another user approve", async () => {
		const authReqId = await start();
		await expect(approve(authReqId, secondUserHeaders)).rejects.toMatchObject({
			statusCode: 400,
		});
		expect((await poll(authReqId)).body.error).toBe("authorization_pending");
	});

	it("applies only the first decision", async () => {
		const authReqId = await start();
		await approve(authReqId);
		await expect(
			auth.api.cibaDeny({ headers, body: { auth_req_id: authReqId } }),
		).rejects.toMatchObject({ statusCode: 400 });
		expect((await poll(authReqId)).status).toBe(200);
	});

	it("refuses to approve an expired request", async () => {
		const authReqId = await start();
		await expireRequest(authReqId);
		await expect(approve(authReqId)).rejects.toMatchObject({ statusCode: 400 });
	});
});

describe("ciba ping mode", () => {
	function mockNotificationEndpoint() {
		const realFetch = globalThis.fetch;
		return vi
			.spyOn(globalThis, "fetch")
			.mockImplementation((input, init) =>
				String(input) === notificationEndpoint
					? Promise.resolve(new Response(null, { status: 204 }))
					: realFetch(input, init),
			);
	}

	it.each([
		"approve",
		"deny",
	] as const)("pings the registered endpoint after the user decides (%s)", async (decision) => {
		const fetchSpy = mockNotificationEndpoint();
		const authReqId = await start(
			{ client_notification_token: "client-token" },
			pingClient,
		);
		const body = { auth_req_id: authReqId };
		if (decision === "approve") {
			await auth.api.cibaApprove({ headers, body });
		} else {
			await auth.api.cibaDeny({ headers, body });
		}

		const call = fetchSpy.mock.calls.find(
			([input]) => String(input) === notificationEndpoint,
		);
		expect(call?.[1]).toMatchObject({
			method: "POST",
			redirect: "error",
			headers: { authorization: "Bearer client-token" },
			body: JSON.stringify({ auth_req_id: authReqId }),
		});
		const result = await poll(authReqId, pingClient);
		if (decision === "approve") {
			expect(result.status).toBe(200);
		} else {
			expect(result.body.error).toBe("access_denied");
		}
	});

	it("requires a client_notification_token", async () => {
		const res = await bcAuthorize(
			{ scope: "openid", login_hint: testUser.email },
			pingClient,
		);
		expect(res.body.error).toBe("invalid_request");
	});

	it.each([
		["a non-https endpoint", "http://client.example.com/ciba"],
		["a private host", "https://127.0.0.1/ciba"],
		["no endpoint", undefined],
	])("rejects a ping client registered with %s", async (_, endpoint) => {
		const client = await createClient({
			backchannel_token_delivery_mode: "ping",
			backchannel_client_notification_endpoint: endpoint,
		});
		const res = await bcAuthorize(
			{
				scope: "openid",
				login_hint: testUser.email,
				client_notification_token: "client-token",
			},
			client,
		);
		expect(res.body.error).toBe("invalid_request");
	});
});

describe("ciba discovery metadata", () => {
	it("advertises the backchannel endpoint and configured modes", async () => {
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
