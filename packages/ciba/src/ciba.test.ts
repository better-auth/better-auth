import type { OAuthClient } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { deriveDpopJkt } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import type { CibaRequest, SendNotificationData } from "./index";
import { CIBA_GRANT_TYPE, ciba } from "./index";
import { hashAuthReqId } from "./utils";

const baseURL = "http://localhost:3000";
const POLL_INTERVAL = 2;

let lastNotification: SendNotificationData | undefined;

const { auth, signInWithTestUser, signInWithUser, customFetchImpl, testUser } =
	await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
			ciba({
				approvalPage: "/approve",
				pollingInterval: POLL_INTERVAL,
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

let confidentialClient: OAuthClient;
let otherClient: OAuthClient;
let noModeClient: OAuthClient;
let basicAuth: string;
let otherAuth: string;
let secondUserHeaders: Headers;

function basicAuthFor(client: OAuthClient): string {
	return `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`;
}

beforeAll(async () => {
	confidentialClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			grant_types: [CIBA_GRANT_TYPE],
			redirect_uris: [`${baseURL}/callback`],
			skip_consent: true,
			metadata: { backchannel_token_delivery_mode: "poll" },
		},
	});
	basicAuth = basicAuthFor(confidentialClient);
	// A second confidential CIBA client, used to prove one client cannot redeem
	// another's auth_req_id.
	otherClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			grant_types: [CIBA_GRANT_TYPE],
			metadata: { backchannel_token_delivery_mode: "poll" },
		},
	});
	otherAuth = basicAuthFor(otherClient);
	// Registered for the CIBA grant but with no delivery mode.
	noModeClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: { grant_types: [CIBA_GRANT_TYPE] },
	});
	// A second user, used to prove a session cannot approve another user's request.
	await auth.api.signUpEmail({ body: secondUser });
	secondUserHeaders = (
		await signInWithUser(secondUser.email, secondUser.password)
	).headers;
});

async function bcAuthorize(
	body: Record<string, string>,
	authHeader: string | null = basicAuth,
) {
	const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/bc-authorize`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(authHeader ? { authorization: authHeader } : {}),
		},
		body: JSON.stringify(body),
	});
	return { status: res.status, headers: res.headers, body: await res.json() };
}

async function poll(
	authReqId: string,
	authHeader: string | undefined = basicAuth,
) {
	const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/token`, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			...(authHeader ? { authorization: authHeader } : {}),
		},
		body: new URLSearchParams({
			grant_type: CIBA_GRANT_TYPE,
			auth_req_id: authReqId,
		}).toString(),
	});
	return { status: res.status, body: await res.json() };
}

async function createDpopProof(privateKey: CryptoKey, publicJwk: JWK) {
	return new SignJWT({
		jti: "ciba-dpop-proof",
		htm: "POST",
		htu: `${baseURL}/api/auth/oauth2/token`,
		iat: Math.floor(Date.now() / 1000),
	})
		.setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: publicJwk })
		.sign(privateKey);
}

describe("ciba poll flow", () => {
	it("runs the decoupled poll flow", async () => {
		const start = await bcAuthorize({
			scope: "openid profile",
			login_hint: testUser.email,
		});
		expect(start.status).toBe(200);
		expect(start.headers.get("Cache-Control")).toBe("no-store");
		expect(start.body.auth_req_id).toBeDefined();
		expect(start.body.expires_in).toBe(300);
		expect(start.body.interval).toBe(POLL_INTERVAL);
		expect(lastNotification?.approvalUrl).toContain(
			`auth_req_id=${start.body.auth_req_id}`,
		);

		const authReqId = start.body.auth_req_id as string;
		await auth.api.cibaAuthorize({ headers, body: { auth_req_id: authReqId } });

		const issued = await poll(authReqId);
		expect(issued.status).toBe(200);
		expect(issued.body.access_token).toBeDefined();
		expect(issued.body.token_type).toBe("Bearer");

		// Single-use: the request was consumed on issuance, so a second poll fails.
		const replay = await poll(authReqId);
		expect(replay.status).toBe(400);
		expect(replay.body.error).toBe("invalid_grant");
	});

	it("returns authorization_pending before approval", async () => {
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const pending = await poll(start.body.auth_req_id as string);
		expect(pending.status).toBe(400);
		expect(pending.body.error).toBe("authorization_pending");
	});

	it("issues to only one of two concurrent polls of an approved request", async () => {
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		await auth.api.cibaAuthorize({ headers, body: { auth_req_id: authReqId } });

		const [a, b] = await Promise.all([poll(authReqId), poll(authReqId)]);
		const statuses = [a.status, b.status].sort();
		expect(statuses).toEqual([200, 400]);
		const won = a.status === 200 ? a : b;
		const lost = a.status === 200 ? b : a;
		expect(won.body.access_token).toBeDefined();
		expect(lost.body.error).toBe("invalid_grant");
	});

	it("rejects fast polls with slow_down and ratchets the interval (CIBA §11)", async () => {
		const ctx = await auth.$context;
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;

		const first = await poll(authReqId);
		expect(first.body.error).toBe("authorization_pending");

		const tooFast = await poll(authReqId);
		expect(tooFast.status).toBe(400);
		expect(tooFast.body.error).toBe("slow_down");

		const row = await ctx.adapter.findOne<{ pollingInterval: number }>({
			model: "cibaRequest",
			where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
		});
		expect(row?.pollingInterval).toBe(POLL_INTERVAL + 5);
	});

	it("binds the polled token to the agent's DPoP key when a proof is sent", async () => {
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		const jkt = await deriveDpopJkt(publicJwk);

		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		await auth.api.cibaAuthorize({ headers, body: { auth_req_id: authReqId } });

		const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/token`, {
			method: "POST",
			headers: {
				authorization: basicAuth,
				"content-type": "application/x-www-form-urlencoded",
				dpop: await createDpopProof(privateKey, publicJwk),
			},
			body: new URLSearchParams({
				grant_type: CIBA_GRANT_TYPE,
				auth_req_id: authReqId,
			}).toString(),
		});
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.token_type).toBe("DPoP");

		const introspectRes = await customFetchImpl(
			`${baseURL}/api/auth/oauth2/introspect`,
			{
				method: "POST",
				headers: {
					authorization: basicAuth,
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					token: body.access_token,
					token_type_hint: "access_token",
				}).toString(),
			},
		);
		const introspection = await introspectRes.json();
		expect(introspection.cnf).toEqual({ jkt });
	});

	it("returns access_denied when the user rejects", async () => {
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		await auth.api.cibaReject({ headers, body: { auth_req_id: authReqId } });
		const denied = await poll(authReqId);
		expect(denied.status).toBe(400);
		expect(denied.body.error).toBe("access_denied");
	});

	it("rejects a client not registered with a poll delivery mode", async () => {
		const noModeAuth = `Basic ${btoa(`${noModeClient.client_id}:${noModeClient.client_secret}`)}`;
		const res = await bcAuthorize(
			{ scope: "openid", login_hint: testUser.email },
			noModeAuth,
		);
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});

	it("rejects a scope without openid", async () => {
		const res = await bcAuthorize({
			scope: "profile",
			login_hint: testUser.email,
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_scope");
	});

	it("rejects an unknown user hint", async () => {
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: "nobody@example.com",
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("unknown_user_id");
	});

	it("rejects a request with more than one hint", async () => {
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			id_token_hint: "some-token",
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});

	it("rejects a request with no hint", async () => {
		const res = await bcAuthorize({ scope: "openid" });
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});

	it("rejects an unsupported hint type", async () => {
		const res = await bcAuthorize({ scope: "openid", id_token_hint: "x" });
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});

	it("rejects a request from an unauthenticated client", async () => {
		const res = await bcAuthorize(
			{
				client_id: confidentialClient.client_id,
				scope: "openid",
				login_hint: testUser.email,
			},
			null,
		);
		expect(res.status).toBe(400);
	});

	it("rejects a poll from a client other than the requester", async () => {
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		await auth.api.cibaAuthorize({ headers, body: { auth_req_id: authReqId } });

		// A different (authenticated) client cannot redeem the approved request.
		const stolen = await poll(authReqId, otherAuth);
		expect(stolen.status).toBe(400);
		expect(stolen.body.error).toBe("invalid_grant");

		// The request is untouched, so the original client still succeeds.
		const issued = await poll(authReqId);
		expect(issued.status).toBe(200);
		expect(issued.body.access_token).toBeDefined();
	});

	it("rejects a poll with an unknown auth_req_id", async () => {
		const res = await poll("auth-req-id-that-was-never-issued");
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_grant");
	});

	it("returns expired_token once the request has expired", async () => {
		const ctx = await auth.$context;
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		await ctx.adapter.update({
			model: "cibaRequest",
			where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
			update: { expiresAt: new Date(Date.now() - 1000) },
		});
		const res = await poll(authReqId);
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("expired_token");
	});

	it("clamps requested_expiry to the configured maximum", async () => {
		const within = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			requested_expiry: "120",
		});
		expect(within.body.expires_in).toBe(120);

		const beyond = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			requested_expiry: "100000",
		});
		expect(beyond.body.expires_in).toBe(300);
	});

	it("rejects a binding_message containing control characters", async () => {
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			binding_message: "approve\u0001now",
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_binding_message");
	});

	it("forwards a valid binding_message to the notification", async () => {
		await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			binding_message: "Approve sign-in on Acme",
		});
		expect(lastNotification?.bindingMessage).toBe("Approve sign-in on Acme");
	});

	it("does not let another user approve the request", async () => {
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;

		await expect(
			auth.api.cibaAuthorize({
				headers: secondUserHeaders,
				body: { auth_req_id: authReqId },
			}),
		).rejects.toThrow();

		// The foreign approval was a no-op: the request is still pending.
		const pending = await poll(authReqId);
		expect(pending.body.error).toBe("authorization_pending");
	});

	it("approves by request_id for the owning session", async () => {
		const ctx = await auth.$context;
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		// A first-party UI lists the request by id and never holds the raw token
		// (only its hash is stored), so it approves by request_id instead.
		const row = await ctx.adapter.findOne<{ id: string }>({
			model: "cibaRequest",
			where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
		});
		expect(row?.id).toBeDefined();

		await auth.api.cibaAuthorize({
			headers,
			body: { request_id: row?.id as string },
		});

		const issued = await poll(authReqId);
		expect(issued.status).toBe(200);
		expect(issued.body.access_token).toBeDefined();
	});

	it("does not let another user approve by request_id", async () => {
		const ctx = await auth.$context;
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		const row = await ctx.adapter.findOne<{ id: string }>({
			model: "cibaRequest",
			where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
		});

		await expect(
			auth.api.cibaAuthorize({
				headers: secondUserHeaders,
				body: { request_id: row?.id as string },
			}),
		).rejects.toThrow();

		const pending = await poll(authReqId);
		expect(pending.body.error).toBe("authorization_pending");
	});

	it("rejects by request_id for the owning session", async () => {
		const ctx = await auth.$context;
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		const row = await ctx.adapter.findOne<{ id: string }>({
			model: "cibaRequest",
			where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
		});

		await auth.api.cibaReject({
			headers,
			body: { request_id: row?.id as string },
		});

		const denied = await poll(authReqId);
		expect(denied.status).toBe(400);
		expect(denied.body.error).toBe("access_denied");
	});

	it("requires exactly one of auth_req_id or request_id", async () => {
		await expect(
			auth.api.cibaAuthorize({ headers, body: {} }),
		).rejects.toThrow();
	});
});

describe("ciba public client", () => {
	it("lets a public client complete the flow when confidential is not required", async () => {
		const pubURL = "http://localhost:3010";
		const {
			auth: pubAuth,
			signInWithTestUser: pubSignIn,
			customFetchImpl: pubFetch,
			testUser: pubUser,
		} = await getTestInstance({
			baseURL: pubURL,
			plugins: [
				jwt({ jwt: { issuer: pubURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
				}),
				ciba({
					approvalPage: "/approve",
					pollingInterval: POLL_INTERVAL,
					requireConfidentialClient: false,
					sendNotification: () => {},
				}),
			],
		});
		const { headers: pubHeaders } = await pubSignIn();
		const publicClient = await pubAuth.api.adminCreateOAuthClient({
			headers: pubHeaders,
			body: {
				grant_types: [CIBA_GRANT_TYPE],
				token_endpoint_auth_method: "none",
				metadata: { backchannel_token_delivery_mode: "poll" },
			},
		});

		const start = await pubFetch(`${pubURL}/api/auth/oauth2/bc-authorize`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_id: publicClient.client_id,
				scope: "openid",
				login_hint: pubUser.email,
			}),
		});
		expect(start.status).toBe(200);
		const { auth_req_id } = (await start.json()) as { auth_req_id: string };

		await pubAuth.api.cibaAuthorize({
			headers: pubHeaders,
			body: { auth_req_id },
		});

		const tokenRes = await pubFetch(`${pubURL}/api/auth/oauth2/token`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: CIBA_GRANT_TYPE,
				auth_req_id,
				client_id: publicClient.client_id,
			}).toString(),
		});
		const body = (await tokenRes.json()) as { access_token?: string };
		expect(tokenRes.status).toBe(200);
		expect(body.access_token).toBeDefined();
	});
});

describe("ciba request details", () => {
	async function getRequest(authReqId: string) {
		const res = await customFetchImpl(
			`${baseURL}/api/auth/ciba/request?auth_req_id=${encodeURIComponent(authReqId)}`,
			{ method: "GET" },
		);
		return { status: res.status, headers: res.headers, body: await res.json() };
	}

	it("returns the details an approval page renders", async () => {
		const start = await bcAuthorize({
			scope: "openid profile",
			login_hint: testUser.email,
			binding_message: "Approve on Acme",
		});
		const details = await getRequest(start.body.auth_req_id as string);
		expect(details.status).toBe(200);
		expect(details.headers.get("Cache-Control")).toBe("no-store");
		expect(details.body.scope).toBe("openid profile");
		expect(details.body.binding_message).toBe("Approve on Acme");
		expect(details.body.status).toBe("pending");
		expect(details.body.expires_at).toBeDefined();
	});

	it("returns 404 for an unknown auth_req_id", async () => {
		const details = await getRequest("never-issued");
		expect(details.status).toBe(404);
	});
});

describe("ciba discovery metadata", () => {
	it("advertises the backchannel endpoint and poll delivery mode", async () => {
		const metadata = (await auth.api.getOpenIdConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.backchannel_authentication_endpoint).toContain(
			"/oauth2/bc-authorize",
		);
		expect(metadata.backchannel_token_delivery_modes_supported).toEqual([
			"poll",
		]);
		expect(metadata.backchannel_user_code_parameter_supported).toBe(false);
	});
});

describe("ciba agent claims (act.sub, RAR)", () => {
	const rar = JSON.stringify([
		{ type: "purchase", actions: ["buy"], locations: ["https://shop.example"] },
	]);

	async function introspect(accessToken: string) {
		const res = await customFetchImpl(`${baseURL}/api/auth/oauth2/introspect`, {
			method: "POST",
			headers: {
				authorization: basicAuth,
				"content-type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				token: accessToken,
				token_type_hint: "access_token",
			}).toString(),
		});
		return (await res.json()) as Record<string, unknown>;
	}

	it("stamps act.sub on the token (visible at opaque introspection)", async () => {
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		await auth.api.cibaAuthorize({ headers, body: { auth_req_id: authReqId } });

		const issued = await poll(authReqId);
		expect(issued.status).toBe(200);

		// act.sub (RFC 8693) names the calling client as the actor. The CIBA
		// claims contributor re-derives it at introspection, where the token is
		// opaque and the grant type is unknown.
		const introspection = await introspect(issued.body.access_token as string);
		expect(introspection.active).toBe(true);
		expect(introspection.act).toEqual({ sub: confidentialClient.client_id });
	});

	it("round-trips authorization_details into the token response", async () => {
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			authorization_details: rar,
		});
		const authReqId = start.body.auth_req_id as string;
		await auth.api.cibaAuthorize({ headers, body: { auth_req_id: authReqId } });
		const issued = await poll(authReqId);
		expect(issued.status).toBe(200);
		// RFC 9396 RAR is echoed in the token response body.
		expect(issued.body.authorization_details).toEqual(JSON.parse(rar));
	});

	it("issues without authorization_details when none was requested", async () => {
		const start = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
		});
		const authReqId = start.body.auth_req_id as string;
		await auth.api.cibaAuthorize({ headers, body: { auth_req_id: authReqId } });
		const issued = await poll(authReqId);
		expect(issued.body.authorization_details).toBeUndefined();
	});

	it("forwards parsed authorization_details to the notification", async () => {
		await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			authorization_details: rar,
		});
		expect(lastNotification?.authorizationDetails).toEqual(JSON.parse(rar));
	});

	it("rejects malformed authorization_details at request time", async () => {
		const res = await bcAuthorize({
			scope: "openid",
			login_hint: testUser.email,
			authorization_details: "{not json",
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});
});

const baseURL2 = "http://localhost:3020";
const seenRequests: CibaRequest[] = [];
let acrNotification: SendNotificationData | undefined;
const pushDeliveries: Array<Record<string, unknown>> = [];
const pingDeliveries: string[] = [];

const {
	auth: auth2,
	signInWithTestUser: signIn2,
	customFetchImpl: fetch2,
	testUser: user2,
} = await getTestInstance({
	baseURL: baseURL2,
	plugins: [
		jwt({ jwt: { issuer: baseURL2 } }),
		oauthProvider({
			loginPage: "/login",
			consentPage: "/consent",
			silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
		}),
		ciba({
			approvalPage: "/approve",
			pollingInterval: POLL_INTERVAL,
			deliveryModes: ["poll", "ping", "push"],
			pushRetryAttempts: 0,
			sendNotification: (data) => {
				acrNotification = data;
			},
			// Step-up: refuse issuance when the request carried acr_values.
			enforceTokenAcr: (request) => {
				if (request.acrValues === "tier-3") {
					throw new APIError("FORBIDDEN", {
						error: "insufficient_authorization",
						error_description: "User does not satisfy acr_values: tier-3",
					});
				}
			},
			// authContextId write-through: a deployment stamps an auth-context id
			// after approval and reads it back into a claim here.
			buildAccessTokenClaims: (request) => {
				seenRequests.push(request);
				return request.authContextId
					? { auth_context_id: request.authContextId }
					: {};
			},
		}),
	],
});

const { headers: headers2 } = await signIn2();

/**
 * Intercepts the plugin's outbound ping/push call to a single endpoint while
 * delegating every other request to the real `fetch`. Returns a restore fn.
 */
function interceptFetch(
	endpoint: string,
	handler: (request: Request) => Promise<Response>,
): () => void {
	const realFetch = globalThis.fetch;
	const patched: typeof fetch = (input, init) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url === endpoint) {
			return handler(new Request(url, init));
		}
		return realFetch(input, init);
	};
	patched.preconnect = realFetch.preconnect;
	globalThis.fetch = patched;
	return () => {
		globalThis.fetch = realFetch;
	};
}

describe("ciba step-up, hooks, and ping/push delivery", () => {
	let pollClient: OAuthClient;
	let pingClient: OAuthClient;
	let pushClient: OAuthClient;
	let pushEndpoint: string;

	beforeAll(async () => {
		// A push/ping notification sink served by the same fetch impl.
		pushEndpoint = `${baseURL2}/__notify`;
		pollClient = await auth2.api.adminCreateOAuthClient({
			headers: headers2,
			body: {
				grant_types: [CIBA_GRANT_TYPE],
				metadata: { backchannel_token_delivery_mode: "poll" },
			},
		});
		pingClient = await auth2.api.adminCreateOAuthClient({
			headers: headers2,
			body: {
				grant_types: [CIBA_GRANT_TYPE],
				metadata: { backchannel_token_delivery_mode: "ping" },
			},
		});
		pushClient = await auth2.api.adminCreateOAuthClient({
			headers: headers2,
			body: {
				grant_types: [CIBA_GRANT_TYPE],
				metadata: { backchannel_token_delivery_mode: "push" },
			},
		});
	});

	function basic(client: OAuthClient): string {
		return `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`;
	}

	async function bc(body: Record<string, string>, client: OAuthClient) {
		const res = await fetch2(`${baseURL2}/api/auth/oauth2/bc-authorize`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: basic(client),
			},
			body: JSON.stringify(body),
		});
		return { status: res.status, body: await res.json() };
	}

	async function poll2(authReqId: string, client: OAuthClient) {
		const res = await fetch2(`${baseURL2}/api/auth/oauth2/token`, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				authorization: basic(client),
			},
			body: new URLSearchParams({
				grant_type: CIBA_GRANT_TYPE,
				auth_req_id: authReqId,
			}).toString(),
		});
		return { status: res.status, body: await res.json() };
	}

	it("advertises all configured delivery modes in discovery metadata", async () => {
		const metadata = (await auth2.api.getOpenIdConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.backchannel_token_delivery_modes_supported).toEqual([
			"poll",
			"ping",
			"push",
		]);
	});

	it("refuses issuance when acr_values are not satisfied (step-up)", async () => {
		const start = await bc(
			{ scope: "openid", login_hint: user2.email, acr_values: "tier-3" },
			pollClient,
		);
		expect(start.status).toBe(200);
		expect(acrNotification?.acrValues).toBe("tier-3");
		const authReqId = start.body.auth_req_id as string;
		await auth2.api.cibaAuthorize({
			headers: headers2,
			body: { auth_req_id: authReqId },
		});
		const denied = await poll2(authReqId, pollClient);
		expect(denied.status).toBe(403);
		expect(denied.body.error).toBe("insufficient_authorization");

		// The refusal ran before the single-use consume, so the approved request
		// survives for a retry after the user elevates (here it stays approved).
		const ctx = await auth2.$context;
		const row = await ctx.adapter.findOne<{ status: string }>({
			model: "cibaRequest",
			where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
		});
		expect(row?.status).toBe("approved");
	});

	it("issues when acr_values are satisfied", async () => {
		const start = await bc(
			{ scope: "openid", login_hint: user2.email, acr_values: "tier-1" },
			pollClient,
		);
		const authReqId = start.body.auth_req_id as string;
		await auth2.api.cibaAuthorize({
			headers: headers2,
			body: { auth_req_id: authReqId },
		});
		const issued = await poll2(authReqId, pollClient);
		expect(issued.status).toBe(200);
		expect(issued.body.access_token).toBeDefined();
	});

	it("persists authContextId and reads it back at issuance via the hook", async () => {
		const start = await bc(
			{ scope: "openid", login_hint: user2.email },
			pollClient,
		);
		const authReqId = start.body.auth_req_id as string;

		// Approve, then a deployment stamps an auth-context id on the persisted row
		// before the agent polls (the plugin owns the column; the deployment writes
		// it). The issuance hook receives the row, proving the write-through.
		await auth2.api.cibaAuthorize({
			headers: headers2,
			body: { auth_req_id: authReqId },
		});
		const ctx = await auth2.$context;
		await ctx.adapter.update({
			model: "cibaRequest",
			where: [{ field: "authReqId", value: await hashAuthReqId(authReqId) }],
			update: { authContextId: "auth-ctx-123" },
		});

		const issued = await poll2(authReqId, pollClient);
		expect(issued.status).toBe(200);
		expect(seenRequests.some((r) => r.authContextId === "auth-ctx-123")).toBe(
			true,
		);
	});

	it("delivers tokens inline for push mode and consumes the request once", async () => {
		const handler = async (request: Request) => {
			pushDeliveries.push((await request.json()) as Record<string, unknown>);
			return new Response(null, { status: 204 });
		};
		const start = await bc(
			{
				scope: "openid",
				login_hint: user2.email,
				client_notification_token: "push-notification-token",
				client_notification_uri: pushEndpoint,
			},
			pushClient,
		);
		expect(start.status).toBe(200);
		// Push response omits the polling interval (CIBA §7.3).
		expect(start.body.interval).toBeUndefined();
		const authReqId = start.body.auth_req_id as string;

		// Intercept the AS -> client notification call.
		const restore = interceptFetch(pushEndpoint, handler);
		try {
			await auth2.api.cibaAuthorize({
				headers: headers2,
				body: { auth_req_id: authReqId },
			});
			// Allow the fire-and-forget push to settle.
			await new Promise((r) => setTimeout(r, 50));
		} finally {
			restore();
		}

		expect(pushDeliveries).toHaveLength(1);
		const delivered = pushDeliveries[0]!;
		expect(delivered.auth_req_id).toBe(authReqId);
		expect(typeof delivered.access_token).toBe("string");

		// act.sub is visible at introspection of the pushed (opaque) token.
		const introspectRes = await fetch2(
			`${baseURL2}/api/auth/oauth2/introspect`,
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					authorization: basic(pushClient),
				},
				body: new URLSearchParams({
					token: delivered.access_token as string,
					token_type_hint: "access_token",
				}).toString(),
			},
		);
		const introspection = (await introspectRes.json()) as Record<
			string,
			unknown
		>;
		expect(introspection.act).toEqual({ sub: pushClient.client_id });

		// Single-use: the push request was consumed at approval, so a poll fails.
		const replay = await poll2(authReqId, pushClient);
		expect(replay.status).toBe(400);
	});

	it("pings the client to poll for ping mode, then issues on poll", async () => {
		const handler = async (request: Request) => {
			const body = (await request.json()) as { auth_req_id: string };
			pingDeliveries.push(body.auth_req_id);
			return new Response(null, { status: 204 });
		};
		const pingEndpoint = `${baseURL2}/__ping`;
		const start = await bc(
			{
				scope: "openid",
				login_hint: user2.email,
				client_notification_token: "ping-notification-token",
				client_notification_uri: pingEndpoint,
			},
			pingClient,
		);
		expect(start.status).toBe(200);
		expect(start.body.interval).toBe(POLL_INTERVAL);
		const authReqId = start.body.auth_req_id as string;

		const restore = interceptFetch(pingEndpoint, handler);
		try {
			await auth2.api.cibaAuthorize({
				headers: headers2,
				body: { auth_req_id: authReqId },
			});
			await new Promise((r) => setTimeout(r, 50));
		} finally {
			restore();
		}

		expect(pingDeliveries).toContain(authReqId);

		// Ping mode still issues by polling (the AS only signaled readiness).
		const issued = await poll2(authReqId, pingClient);
		expect(issued.status).toBe(200);
		expect(issued.body.access_token).toBeDefined();
	});

	it("requires a notification endpoint for ping/push requests", async () => {
		const res = await bc(
			{
				scope: "openid",
				login_hint: user2.email,
				client_notification_token: "notification-token",
			},
			pushClient,
		);
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});

	it("rejects a non-HTTPS notification endpoint for push", async () => {
		const res = await bc(
			{
				scope: "openid",
				login_hint: user2.email,
				client_notification_token: "notification-token",
				client_notification_uri: "http://insecure.example/notify",
			},
			pushClient,
		);
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_request");
	});
});
