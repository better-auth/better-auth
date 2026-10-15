import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SendNotificationData } from "@better-auth/ciba";
import { CIBA_GRANT_TYPE, ciba } from "@better-auth/ciba";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { APIRequestContext, Browser } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import {
	Agent,
	getGlobalDispatcher,
	setGlobalDispatcher,
	fetch as undiciFetch,
} from "undici";

/**
 * Runs CIBA across separate processes' worth of parties, over real sockets:
 * the provider (Better Auth with `oauthProvider` and `ciba`), the client's
 * HTTPS notification receiver, and the approving user in a browser context.
 * The client itself is this test, speaking only HTTP to the provider.
 *
 * The provider only pings an https endpoint on a public host, so the receiver
 * serves a throwaway certificate for a public-looking name, and the provider's
 * HTTP client resolves that one name to loopback and trusts that one
 * certificate. Everything else about the request (TLS, the host check, the
 * redirect refusal) is the code under test.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
const SECRET = "ciba-e2e-secret-0123456789abcdefghij";
const USER = {
	name: "CIBA User",
	email: "ciba-user@example.com",
	password: "correct-horse-battery-staple",
};
const RESOURCE = "https://api.example.com";
const RECEIVER_HOST = "ciba-client.example.com";
const FORM = { "content-type": "application/x-www-form-urlencoded" };

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

function listen(server: Server): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") resolve(address.port);
			else reject(new Error("Failed to get server port"));
		});
	});
}

function close(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.closeAllConnections();
		server.close((err) => (err ? reject(err) : resolve()));
	});
}

async function readJson(
	req: IncomingMessage,
): Promise<Record<string, unknown>> {
	let body = "";
	for await (const chunk of req) body += chunk;
	return body ? JSON.parse(body) : {};
}

/** A self-signed certificate for {@link RECEIVER_HOST}, valid for one day. */
function createCertificate() {
	const dir = mkdtempSync(join(tmpdir(), "ciba-e2e-"));
	try {
		execFileSync(
			"openssl",
			[
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-days",
				"1",
				"-subj",
				`/CN=${RECEIVER_HOST}`,
				"-addext",
				`subjectAltName=DNS:${RECEIVER_HOST}`,
				"-keyout",
				join(dir, "key.pem"),
				"-out",
				join(dir, "cert.pem"),
			],
			{ stdio: "ignore" },
		);
		return {
			key: readFileSync(join(dir, "key.pem")),
			cert: readFileSync(join(dir, "cert.pem")),
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

interface Ping {
	path: string;
	authorization: string | undefined;
	body: Record<string, unknown>;
}

/** The client's notification receiver: HTTPS on {@link RECEIVER_HOST}. */
async function startReceiver(tls: { key: Buffer; cert: Buffer }) {
	const pings: Ping[] = [];
	const server = createHttpsServer(tls, async (req, res) => {
		const path = req.url ?? "/";
		pings.push({
			path,
			authorization: req.headers.authorization,
			body: await readJson(req),
		});
		if (path === "/redirect") {
			res.statusCode = 302;
			res.setHeader("location", `https://${RECEIVER_HOST}:${port}/internal`);
		} else {
			res.statusCode = 204;
		}
		res.end();
	});
	const port = await listen(server);
	return {
		url: (path: string) => `https://${RECEIVER_HOST}:${port}${path}`,
		pings,
		stop: () => close(server),
	};
}

async function startProvider() {
	let handler: Handler = (_req, res) => {
		res.statusCode = 503;
		res.end();
	};
	const server = createHttpServer((req, res) => handler(req, res));
	const port = await listen(server);
	const origin = `http://127.0.0.1:${port}`;
	const notifications: SendNotificationData[] = [];

	const auth = betterAuth({
		database: new DatabaseSync(":memory:"),
		baseURL: origin,
		secret: SECRET,
		emailAndPassword: { enabled: true },
		trustedOrigins: [origin],
		plugins: [
			jwt({ jwt: { issuer: `${origin}/api/auth` } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email"],
				resources: [RESOURCE],
				enforcePerClientResources: false,
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
			ciba({
				approvalPage: "/approve",
				deliveryModes: ["poll", "ping"],
				interval: 1,
				// The user's inbox: the test reads what the provider sent.
				sendNotification: (data) => {
					notifications.push(data);
				},
			}),
		],
	});
	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();
	await auth.api.signUpEmail({ body: USER });
	const signIn = await auth.api.signInEmail({
		body: { email: USER.email, password: USER.password },
		returnHeaders: true,
	});
	const operatorHeaders = new Headers({
		cookie: signIn.headers
			.getSetCookie()
			.map((cookie) => cookie.split(";")[0])
			.join("; "),
	});

	const authHandler = toNodeHandler(auth);
	handler = async (req, res) => {
		if (req.url?.startsWith("/api/auth")) return authHandler(req, res);
		// The deployment's own server code, deciding a request by policy.
		if (req.url === "/policy/complete" && req.method === "POST") {
			const body = await readJson(req);
			const result = await auth.api.completeCibaRequest({
				body: {
					request_id: String(body.request_id),
					decision: body.decision === "denied" ? "denied" : "approved",
				},
			});
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify(result));
			return;
		}
		res.statusCode = 404;
		res.end();
	};

	return {
		origin,
		authBaseURL: `${origin}/api/auth`,
		notifications,
		/** Registration is the operator's job, so it uses the admin API. */
		async registerClient(metadata: Record<string, unknown>) {
			const client = await auth.api.adminCreateOAuthClient({
				headers: operatorHeaders,
				body: {
					client_name: "Scheduling Agent",
					grant_types: [CIBA_GRANT_TYPE],
					scope: "openid profile email",
					metadata,
				},
			});
			return {
				clientId: client.client_id,
				basic: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`,
			};
		},
		stop: () => close(server),
	};
}

type Provider = Awaited<ReturnType<typeof startProvider>>;
type Client = Awaited<ReturnType<Provider["registerClient"]>>;

async function backchannelAuthorize(
	provider: Provider,
	client: Client,
	params: Record<string, string>,
) {
	const response = await fetch(`${provider.authBaseURL}/oauth2/bc-authorize`, {
		method: "POST",
		headers: { ...FORM, authorization: client.basic },
		body: new URLSearchParams({
			scope: "openid profile",
			login_hint: USER.email,
			...params,
		}),
	});
	return {
		status: response.status,
		body: (await response.json()) as Record<string, unknown>,
	};
}

async function pollToken(
	provider: Provider,
	client: Client,
	authReqId: string,
) {
	const response = await fetch(`${provider.authBaseURL}/oauth2/token`, {
		method: "POST",
		headers: { ...FORM, authorization: client.basic },
		body: new URLSearchParams({
			grant_type: CIBA_GRANT_TYPE,
			auth_req_id: authReqId,
		}),
	});
	return {
		status: response.status,
		body: (await response.json()) as Record<string, string>,
	};
}

/** The approving user, signed in through their own browser. */
async function signInUser(browser: Browser, provider: Provider) {
	const context = await browser.newContext({ baseURL: provider.origin });
	const response = await context.request.post(
		`${provider.authBaseURL}/sign-in/email`,
		{
			headers: { origin: provider.origin },
			data: { email: USER.email, password: USER.password },
		},
	);
	expect(response.ok(), await response.text()).toBe(true);
	return context;
}

async function decide(
	user: APIRequestContext,
	provider: Provider,
	decision: "approve" | "deny",
	identifier: Record<string, string>,
) {
	const response = await user.post(`${provider.authBaseURL}/ciba/${decision}`, {
		headers: { origin: provider.origin },
		data: identifier,
	});
	expect(response.ok(), await response.text()).toBe(true);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("CIBA over HTTP", () => {
	let provider: Provider;
	let receiver: Awaited<ReturnType<typeof startReceiver>>;
	const previousDispatcher = getGlobalDispatcher();
	const previousFetch = globalThis.fetch;

	test.beforeAll(async () => {
		const tls = createCertificate();
		receiver = await startReceiver(tls);
		// The provider's outbound HTTP: resolve only the receiver's name to
		// loopback and trust only its certificate.
		setGlobalDispatcher(
			new Agent({
				connect: {
					ca: tls.cert,
					lookup: (hostname, options, callback) => {
						if (hostname !== RECEIVER_HOST) {
							callback(new Error(`unexpected host ${hostname}`), "", 4);
							return;
						}
						if (options.all) {
							callback(null, [{ address: "127.0.0.1", family: 4 }]);
						} else {
							callback(null, "127.0.0.1", 4);
						}
					},
				},
			}),
		);
		globalThis.fetch = undiciFetch as unknown as typeof fetch;
		provider = await startProvider();
	});

	test.afterAll(async () => {
		globalThis.fetch = previousFetch;
		setGlobalDispatcher(previousDispatcher);
		await provider?.stop();
		await receiver?.stop();
	});

	test("poll: the user approves from a list, and the client gets one token set", async ({
		browser,
	}) => {
		const client = await provider.registerClient({
			backchannel_token_delivery_mode: "poll",
		});
		const other = await provider.registerClient({
			backchannel_token_delivery_mode: "poll",
		});

		const discovery = await fetch(
			`${provider.authBaseURL}/.well-known/openid-configuration`,
		).then((r) => r.json());
		expect(discovery).toMatchObject({
			backchannel_authentication_endpoint: `${provider.authBaseURL}/oauth2/bc-authorize`,
			backchannel_token_delivery_modes_supported: ["poll", "ping"],
		});

		const started = await backchannelAuthorize(provider, client, {
			binding_message: "Code 4821",
			resource: RESOURCE,
		});
		expect(started.status).toBe(200);
		const authReqId = started.body.auth_req_id as string;
		expect(provider.notifications.at(-1)?.approvalUrl).toContain(authReqId);

		expect((await pollToken(provider, client, authReqId)).body.error).toBe(
			"authorization_pending",
		);

		const user = await signInUser(browser, provider);
		try {
			const pending = await user.request
				.get(`${provider.authBaseURL}/ciba/requests`)
				.then((r) => r.json());
			const listed = pending.find(
				(r: { binding_message?: string }) => r.binding_message === "Code 4821",
			);
			expect(listed).toMatchObject({ client_name: "Scheduling Agent" });
			expect(JSON.stringify(pending)).not.toContain(authReqId);
			await decide(user.request, provider, "approve", {
				request_id: listed.request_id,
			});
		} finally {
			await user.close();
		}

		// Another client holding the auth_req_id gets nothing and consumes nothing.
		expect((await pollToken(provider, other, authReqId)).body.error).toBe(
			"invalid_grant",
		);

		await wait(1_100);
		const issued = await pollToken(provider, client, authReqId);
		expect(issued.status).toBe(200);
		const jwks = createLocalJWKSet(
			await fetch(discovery.jwks_uri).then((r) => r.json()),
		);
		const accessToken = await jwtVerify(issued.body.access_token, jwks, {
			issuer: discovery.issuer,
			audience: RESOURCE,
		});
		expect(accessToken.payload.client_id).toBe(client.clientId);
		expect(decodeJwt(issued.body.id_token).auth_time).toEqual(
			expect.any(Number),
		);

		expect((await pollToken(provider, client, authReqId)).body.error).toBe(
			"invalid_grant",
		);
	});

	test("ping: every decision path calls the client's registered endpoint", async ({
		browser,
	}) => {
		const client = await provider.registerClient({
			backchannel_token_delivery_mode: "ping",
			backchannel_client_notification_endpoint: receiver.url("/cb"),
		});
		const start = async () => {
			const started = await backchannelAuthorize(provider, client, {
				client_notification_token: "client-token",
			});
			expect(started.status).toBe(200);
			return {
				authReqId: started.body.auth_req_id as string,
				requestId: provider.notifications.at(-1)?.requestId as string,
			};
		};
		const pingFor = (authReqId: string) =>
			expect
				.poll(() =>
					receiver.pings.find((ping) => ping.body.auth_req_id === authReqId),
				)
				.toMatchObject({
					path: "/cb",
					authorization: "Bearer client-token",
				});

		// The user denies in the browser.
		const denied = await start();
		const user = await signInUser(browser, provider);
		try {
			await decide(user.request, provider, "deny", {
				auth_req_id: denied.authReqId,
			});
		} finally {
			await user.close();
		}
		await pingFor(denied.authReqId);
		expect(
			(await pollToken(provider, client, denied.authReqId)).body.error,
		).toBe("access_denied");

		// Server code approves by request_id, which has no auth_req_id to echo,
		// and the ping still carries the client's auth_req_id.
		const approved = await start();
		const completed = await fetch(`${provider.origin}/policy/complete`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				request_id: approved.requestId,
				decision: "approved",
			}),
		});
		expect(await completed.json()).toEqual({ status: "approved" });
		await pingFor(approved.authReqId);
		expect((await pollToken(provider, client, approved.authReqId)).status).toBe(
			200,
		);
	});

	test("ping: the provider does not follow a redirect from the client endpoint", async () => {
		const client = await provider.registerClient({
			backchannel_token_delivery_mode: "ping",
			backchannel_client_notification_endpoint: receiver.url("/redirect"),
		});
		const started = await backchannelAuthorize(provider, client, {
			client_notification_token: "client-token",
		});
		const requestId = provider.notifications.at(-1)?.requestId;
		await fetch(`${provider.origin}/policy/complete`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ request_id: requestId, decision: "approved" }),
		});
		await expect
			.poll(() =>
				receiver.pings.some(
					(ping) => ping.body.auth_req_id === started.body.auth_req_id,
				),
			)
			.toBe(true);
		await wait(500);
		expect(receiver.pings.some((ping) => ping.path === "/internal")).toBe(
			false,
		);
	});

	test("ping: registration refuses a non-https notification endpoint", async () => {
		await expect(
			provider.registerClient({
				backchannel_token_delivery_mode: "ping",
				backchannel_client_notification_endpoint: `http://${RECEIVER_HOST}/cb`,
			}),
		).rejects.toMatchObject({ body: { error: "invalid_client_metadata" } });
	});
});
