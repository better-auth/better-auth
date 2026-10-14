import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	APIRequestContext,
	BrowserContext,
	Page,
	Request as PlaywrightRequest,
} from "@playwright/test";
import { expect, test } from "@playwright/test";
import { encodeBasicCredentials } from "better-auth/oauth2";
import { decodeJwt, decodeProtectedHeader } from "jose";
import type { DemoProcess } from "./demo-runtime";
import {
	createOrganization,
	getAvailablePort,
	migrateDemoDatabase,
	runDemoNodeScript,
	startDemoProcess,
	startNextDevServer,
	stopProcess,
} from "./demo-runtime";

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const MCP_PROTOCOL_VERSION = "2026-07-28";
const MCP_CLIENT_SCOPE = "openid profile email offline_access";
const PASSWORD = "correct-horse-battery-staple";
const SECRET_FIELDS = new Set([
	"access_token",
	"actor_token",
	"client_secret",
	"code",
	"code_verifier",
	"id_token",
	"refresh_token",
	"subject_token",
	"token",
]);

type JSONObject = Record<string, unknown>;

interface ClientCredentials {
	client_id: string;
	client_secret: string;
}

interface TokenExchangeRuntime {
	apiURL: string;
	baseURL: string;
	callbackURL: string;
	demo: DemoProcess;
	exchanger: ClientCredentials;
	mcpResource: string;
	temporaryDirectory: string;
	api: DemoProcess;
}

interface OAuthResponse {
	status: number;
	headers: Record<string, string>;
	body: JSONObject;
}

function isJSONObject(value: unknown): value is JSONObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redact(body: JSONObject): JSONObject {
	return Object.fromEntries(
		Object.entries(body).map(([key, value]) => [
			key,
			SECRET_FIELDS.has(key) ? "[redacted]" : value,
		]),
	);
}

function readString(body: JSONObject, key: string): string {
	const value = body[key];
	if (typeof value !== "string" || !value) {
		throw new Error(`Expected ${key} in ${JSON.stringify(redact(body))}`);
	}
	return value;
}

function base64url(bytes: Buffer): string {
	return bytes.toString("base64url");
}

function scopeList(scope: unknown): string[] {
	return typeof scope === "string" ? scope.split(" ").filter(Boolean) : [];
}

function audienceList(aud: unknown): unknown[] {
	return Array.isArray(aud) ? aud : [aud];
}

/**
 * A direct OAuth call (discovery, token, introspection). Each one is attached,
 * redacted, to the test report under the RFC section it checks.
 */
async function oauthCall(
	request: APIRequestContext,
	input: {
		name: string;
		rfc: string;
		url: string;
		method?: "GET" | "POST";
		form?: Record<string, string>;
		client?: ClientCredentials;
	},
): Promise<OAuthResponse> {
	const method = input.method ?? "POST";
	const headers: Record<string, string> = { accept: "application/json" };
	if (input.client) {
		headers.authorization = encodeBasicCredentials(
			input.client.client_id,
			input.client.client_secret,
		);
	}
	const response = await request.fetch(input.url, {
		method,
		headers,
		...(input.form ? { form: input.form } : {}),
	});
	const text = await response.text();
	let body: JSONObject = {};
	try {
		const parsed: unknown = JSON.parse(text);
		body = isJSONObject(parsed) ? parsed : { value: parsed };
	} catch {
		body = { text };
	}
	const result = {
		status: response.status(),
		headers: response.headers(),
		body,
	};
	await test.info().attach(`${input.rfc}: ${input.name}`, {
		contentType: "application/json",
		body: JSON.stringify(
			{
				request: {
					method,
					url: input.url,
					body: input.form ? redact(input.form) : null,
				},
				response: {
					status: result.status,
					headers: Object.fromEntries(
						Object.entries(result.headers).filter(
							([key]) => key !== "set-cookie",
						),
					),
					body: redact(body),
				},
			},
			null,
			2,
		),
	});
	return result;
}

function expectNoStoreJSON(response: OAuthResponse) {
	expect(response.headers["content-type"]).toContain("application/json");
	expect(response.headers["cache-control"]).toContain("no-store");
}

function expectOAuthError(
	response: OAuthResponse,
	status: number,
	error: string,
) {
	expect(response.status, JSON.stringify(response.body)).toBe(status);
	expect(response.body.error).toBe(error);
	expect(typeof response.body.error_description).toBe("string");
}

async function startTokenExchangeRuntime(): Promise<TokenExchangeRuntime> {
	const temporaryDirectory = await mkdtemp(
		join(tmpdir(), "better-auth-token-exchange-demo-"),
	);
	const [demoPort, apiPort, callbackPort] = await Promise.all([
		getAvailablePort(),
		getAvailablePort(),
		getAvailablePort(),
	]);
	const baseURL = `http://127.0.0.1:${demoPort}`;
	const apiURL = `http://127.0.0.1:${apiPort}`;
	const environment: NodeJS.ProcessEnv = {
		...process.env,
		BETTER_AUTH_SECRET:
			"better-auth-token-exchange-demo-e2e-secret-at-least-thirty-two-chars",
		BETTER_AUTH_URL: baseURL,
		DEMO_SQLITE_PATH: join(temporaryDirectory, "demo.sqlite"),
		NO_COLOR: "1",
		TOKEN_EXCHANGE_DEMO_API_URL: apiURL,
		TOKEN_EXCHANGE_DEMO_ENABLED: "true",
	};
	let api: DemoProcess | undefined;
	let demo: DemoProcess | undefined;
	try {
		api = await startDemoProcess({
			command: "node",
			args: ["--experimental-strip-types", "scripts/token-exchange-api.ts"],
			environment: {
				...environment,
				PORT: String(apiPort),
				TOKEN_EXCHANGE_DEMO_ISSUER: baseURL,
			},
			readyURL: `${apiURL}/health`,
			label: "Token exchange downstream API",
		});
		await migrateDemoDatabase(environment);
		const setupOutput = await runDemoNodeScript(
			["scripts/token-exchange-demo-setup.ts"],
			environment,
			"Token exchange demo provisioning",
		);
		const lines = setupOutput.trim().split("\n");
		expect(lines, setupOutput).toHaveLength(1);
		const credentials: unknown = JSON.parse(lines[0] ?? "");
		if (!isJSONObject(credentials)) {
			throw new Error("Provisioning did not print a JSON object");
		}
		const exchanger = {
			client_id: readString(credentials, "client_id"),
			client_secret: readString(credentials, "client_secret"),
		};
		demo = await startNextDevServer(demoPort, {
			...environment,
			TOKEN_EXCHANGE_DEMO_CLIENT_ID: exchanger.client_id,
			TOKEN_EXCHANGE_DEMO_CLIENT_SECRET: exchanger.client_secret,
		});
		return {
			api,
			apiURL,
			baseURL,
			callbackURL: `http://127.0.0.1:${callbackPort}/callback`,
			demo,
			exchanger,
			mcpResource: `${baseURL}/api/mcp`,
			temporaryDirectory,
		};
	} catch (error) {
		await stopProcess(demo?.process);
		await stopProcess(api?.process);
		await rm(temporaryDirectory, { recursive: true, force: true });
		throw error;
	}
}

/** Sends one stateless (2026-07-28) MCP `tools/call` to the demo MCP server. */
async function callMcpTool(
	request: APIRequestContext,
	runtime: TokenExchangeRuntime,
	accessToken: string,
	name: string,
): Promise<{ isError: boolean; text: string }> {
	const response = await request.post(runtime.mcpResource, {
		headers: {
			accept: "application/json, text/event-stream",
			authorization: `Bearer ${accessToken}`,
			"content-type": "application/json",
			"mcp-method": "tools/call",
			"mcp-name": name,
			"mcp-protocol-version": MCP_PROTOCOL_VERSION,
		},
		data: {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name,
				arguments: {},
				_meta: {
					"io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
					"io.modelcontextprotocol/clientCapabilities": {},
				},
			},
		},
	});
	const raw = await response.text();
	expect(response.status(), `${raw}\n${runtime.demo.readOutput()}`).toBe(200);
	// A streamable HTTP server may answer with SSE; the last data line is the reply.
	const payload = response
		.headers()
		["content-type"]?.includes("text/event-stream")
		? (raw
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.at(-1)
				?.slice(5) ?? "")
		: raw;
	const message: unknown = JSON.parse(payload);
	if (!isJSONObject(message) || !isJSONObject(message.result)) {
		throw new Error(`MCP tools/call returned no result: ${raw}`);
	}
	const content = message.result.content;
	const first: unknown = Array.isArray(content) ? content[0] : undefined;
	if (!isJSONObject(first) || typeof first.text !== "string") {
		throw new Error(`MCP tool result has no text content: ${raw}`);
	}
	return { isError: message.result.isError === true, text: first.text };
}

async function completeBrowserAuthorization(
	page: Page,
	runtime: TokenExchangeRuntime,
	input: {
		clientId: string;
		clientName: string;
		email: string;
		scope?: string;
	},
): Promise<{ code: string; codeVerifier: string }> {
	const codeVerifier = base64url(randomBytes(32));
	const state = randomUUID();
	const authorizeURL = new URL(`${runtime.baseURL}/api/auth/oauth2/authorize`);
	for (const [key, value] of Object.entries({
		response_type: "code",
		client_id: input.clientId,
		redirect_uri: runtime.callbackURL,
		scope: input.scope ?? MCP_CLIENT_SCOPE,
		state,
		code_challenge: base64url(
			createHash("sha256").update(codeVerifier).digest(),
		),
		code_challenge_method: "S256",
		resource: runtime.mcpResource,
	})) {
		authorizeURL.searchParams.set(key, value);
	}

	// The MCP client's loopback redirect needs no server: the browser request
	// is captured and answered here.
	const isCallback = (url: URL) =>
		url.href.startsWith(`${runtime.callbackURL}?`);
	await page.route(isCallback, (route) =>
		route.fulfill({ status: 200, contentType: "text/plain", body: "done" }),
	);
	const callbackRequest = page.waitForRequest((request: PlaywrightRequest) =>
		isCallback(new URL(request.url())),
	);

	// Walk the demo's interaction pages until the consent screen.
	const steps = ["/sign-in", "/oauth/select-account", "/oauth/consent"];
	await page.goto(authorizeURL.toString());
	for (;;) {
		await page.waitForURL((url) => steps.includes(url.pathname));
		const pathname = new URL(page.url()).pathname;
		if (pathname === "/oauth/consent") break;
		if (pathname === "/sign-in") {
			await page.locator("#sign-in-email").fill(input.email);
			await page.locator("#sign-in-password").fill(PASSWORD);
			await page.getByRole("button", { name: "Login" }).click();
		} else {
			await page.getByRole("button", { name: new RegExp(input.email) }).click();
		}
		await page.waitForURL((url) => url.pathname !== pathname);
	}
	await expect(
		page.getByRole("heading", {
			name: `${input.clientName} is requesting access`,
		}),
	).toBeVisible();
	await page.getByRole("button", { name: "Authorize" }).click();

	const callback = new URL((await callbackRequest).url());
	expect(callback.searchParams.get("error")).toBeNull();
	// RFC 6749 §4.1.2: the state round-trips unchanged.
	expect(callback.searchParams.get("state")).toBe(state);
	const code = callback.searchParams.get("code");
	if (!code) throw new Error(`No authorization code in ${callback.href}`);
	return { code, codeVerifier };
}

test.describe("Next.js token exchange demo (RFC 8693)", () => {
	test.describe.configure({ mode: "serial" });
	test.setTimeout(120_000);

	let runtime: TokenExchangeRuntime;
	let anonymous: APIRequestContext;
	let browserContext: BrowserContext;
	let page: Page;
	let userId: string;
	let mcpClientId: string;
	let mcpAccessToken: string;
	let mcpRefreshToken: string;
	let freshMcpAccessToken: string;
	let exchangedAccessToken: string;
	let userEmail: string;

	function exchangeForm(
		subjectToken: string,
		overrides: Record<string, string | undefined> = {},
	): Record<string, string> {
		const form: Record<string, string | undefined> = {
			grant_type: TOKEN_EXCHANGE_GRANT,
			subject_token: subjectToken,
			subject_token_type: ACCESS_TOKEN_TYPE,
			resource: runtime.apiURL,
			...overrides,
		};
		return Object.fromEntries(
			Object.entries(form).filter(
				(entry): entry is [string, string] => entry[1] !== undefined,
			),
		);
	}

	async function exchange(
		name: string,
		rfc: string,
		form: Record<string, string>,
		client: ClientCredentials = runtime.exchanger,
	) {
		return await oauthCall(anonymous, {
			name,
			rfc,
			url: `${runtime.baseURL}/api/auth/oauth2/token`,
			form,
			client,
		});
	}

	async function introspect(name: string, token: string) {
		return await oauthCall(anonymous, {
			name,
			rfc: "RFC 7662 §2",
			url: `${runtime.baseURL}/api/auth/oauth2/introspect`,
			form: { token, token_type_hint: "access_token" },
			client: runtime.exchanger,
		});
	}

	async function registerClient(
		request: APIRequestContext,
		metadata: JSONObject,
	): Promise<JSONObject> {
		const response = await request.post(
			`${runtime.baseURL}/api/auth/oauth2/register`,
			{ headers: { origin: runtime.baseURL }, data: metadata },
		);
		const body: unknown = await response.json();
		expect(response.status(), JSON.stringify(body)).toBe(201);
		if (!isJSONObject(body)) throw new Error("DCR returned no JSON object");
		return body;
	}

	test.beforeAll(async ({ browser, playwright }) => {
		test.setTimeout(180_000);
		runtime = await startTokenExchangeRuntime();
		anonymous = await playwright.request.newContext();
		browserContext = await browser.newContext();
		page = await browserContext.newPage();
	});

	test.afterAll(async () => {
		// Servers first and independently: a failed or timed-out test must not
		// leave the dev server holding the demo's .next lock.
		await Promise.allSettled([
			stopProcess(runtime?.demo.process),
			stopProcess(runtime?.api.process),
		]);
		if (runtime) {
			await rm(runtime.temporaryDirectory, { recursive: true, force: true });
		}
		await Promise.allSettled([browserContext?.close(), anonymous?.dispose()]);
	});

	test("an MCP client registers with DCR and the user signs in and consents in the browser (RFC 7591, RFC 6749 §4.1, RFC 7636, RFC 8707)", async ({
		playwright,
	}) => {
		const email = `token-exchange-user-${Date.now()}@example.com`;
		userEmail = email;
		const signUpContext = await playwright.request.newContext();
		try {
			const signUp = await signUpContext.post(
				`${runtime.baseURL}/api/auth/sign-up/email`,
				{ data: { email, name: "Token Exchange User", password: PASSWORD } },
			);
			const signUpBody: unknown = await signUp.json();
			expect(signUp.ok(), JSON.stringify(signUpBody)).toBe(true);
			if (!isJSONObject(signUpBody) || !isJSONObject(signUpBody.user)) {
				throw new Error("Sign-up returned no user");
			}
			userId = readString(signUpBody.user, "id");
		} finally {
			await signUpContext.dispose();
		}

		const clientName = "E2E MCP client";
		const registration = await registerClient(anonymous, {
			client_name: clientName,
			application_type: "native",
			redirect_uris: [runtime.callbackURL],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: MCP_CLIENT_SCOPE,
		});
		mcpClientId = readString(registration, "client_id");
		expect(registration.client_secret).toBeUndefined();

		const { code, codeVerifier } = await completeBrowserAuthorization(
			page,
			runtime,
			{ clientId: mcpClientId, clientName, email },
		);
		const token = await oauthCall(anonymous, {
			name: "authorization code exchange by the MCP client",
			rfc: "RFC 6749 §4.1.3, RFC 7636 §4.5, RFC 8707 §2.2",
			url: `${runtime.baseURL}/api/auth/oauth2/token`,
			form: {
				grant_type: "authorization_code",
				code,
				code_verifier: codeVerifier,
				redirect_uri: runtime.callbackURL,
				client_id: mcpClientId,
				resource: runtime.mcpResource,
			},
		});
		expect(token.status, JSON.stringify(token.body)).toBe(200);
		mcpAccessToken = readString(token.body, "access_token");
		mcpRefreshToken = readString(token.body, "refresh_token");
		const claims = decodeJwt(mcpAccessToken);
		expect(claims.sub).toBe(userId);
		expect(audienceList(claims.aud)).toContain(runtime.mcpResource);
		expect(claims.client_id).toBe(mcpClientId);
		expect(typeof claims.sid).toBe("string");
	});

	test("the downstream API rejects the MCP token directly, so passthrough fails the audience check (RFC 6750 §3, RFC 9068 §4)", async () => {
		const response = await anonymous.get(`${runtime.apiURL}/me`, {
			headers: { authorization: `Bearer ${mcpAccessToken}` },
		});
		expect(response.status()).toBe(401);
		expect(response.headers()["www-authenticate"]).toContain(
			'Bearer error="invalid_token"',
		);
		expect(await response.json()).toMatchObject({ error: "invalid_token" });
	});

	test("call_downstream_api exchanges the MCP token and calls the API as the same user (RFC 8693 §2.2.1, §4.3; RFC 9068 §2.2)", async () => {
		const subject = decodeJwt(mcpAccessToken);
		const result = await callMcpTool(
			anonymous,
			runtime,
			mcpAccessToken,
			"call_downstream_api",
		);
		expect(result.isError, result.text).toBe(false);
		const output: unknown = JSON.parse(result.text);
		if (
			!isJSONObject(output) ||
			!isJSONObject(output.exchange) ||
			!isJSONObject(output.downstream)
		) {
			throw new Error(`Unexpected tool output: ${result.text}`);
		}
		expect(result.text).not.toContain(mcpAccessToken);
		const { exchange, downstream } = output;
		// RFC 8693 §2.2.1: the response names the issued token type.
		expect(exchange.issued_token_type).toBe(ACCESS_TOKEN_TYPE);
		expect(String(exchange.token_type).toLowerCase()).toBe("bearer");
		expect(exchange.expires_in).toEqual(expect.any(Number));
		// Impersonation: the subject stays the user (RFC 8693 §1.1).
		expect(downstream.sub).toBe(userId);
		// RFC 8707 §2 / RFC 9068 §3: the token is audience-restricted to the API.
		expect(audienceList(downstream.aud)).toEqual([runtime.apiURL]);
		// RFC 9068 §2.2 / RFC 8693 §4.3: client_id names the exchanging client.
		expect(downstream.client_id).toBe(runtime.exchanger.client_id);
		expect(downstream.azp).toBe(runtime.exchanger.client_id);
		const subjectScopes = scopeList(subject.scope);
		const exchangedScopes = scopeList(downstream.scope);
		expect(exchangedScopes.length).toBeGreaterThan(0);
		expect(subjectScopes).toEqual(expect.arrayContaining(exchangedScopes));
		expect(exchangedScopes).not.toContain("openid");
		expect(exchangedScopes).not.toContain("offline_access");
		expect(exchange.scope).toBe(downstream.scope);
		// Never outlives the subject token, and logout ends it through sid.
		expect(Number(downstream.exp)).toBeLessThanOrEqual(Number(subject.exp));
		expect(downstream.sid).toBe(subject.sid);
		// Phase 1 is impersonation only: no actor claim (RFC 8693 §4.1).
		expect(downstream.act).toBeNull();
	});

	test("direct HTTP conformance of the token exchange grant (RFC 8414, RFC 6749 §5, RFC 8693 §2, RFC 9068, RFC 7662)", async () => {
		// A fresh subject token for the MCP resource, as the MCP client would hold.
		const refreshed = await oauthCall(anonymous, {
			name: "refresh grant for a fresh MCP access token",
			rfc: "RFC 6749 §6",
			url: `${runtime.baseURL}/api/auth/oauth2/token`,
			form: {
				grant_type: "refresh_token",
				refresh_token: mcpRefreshToken,
				client_id: mcpClientId,
				resource: runtime.mcpResource,
			},
		});
		expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
		const subjectToken = readString(refreshed.body, "access_token");
		freshMcpAccessToken = subjectToken;
		const subject = decodeJwt(subjectToken);

		await test.step("RFC 8414 §2: discovery advertises the grant", async () => {
			const discovery = await oauthCall(anonymous, {
				name: "authorization server metadata",
				rfc: "RFC 8414 §2, §3",
				method: "GET",
				url: `${runtime.baseURL}/.well-known/oauth-authorization-server`,
			});
			expect(discovery.status).toBe(200);
			expect(discovery.body.grant_types_supported).toContain(
				TOKEN_EXCHANGE_GRANT,
			);
		});

		await test.step("RFC 8693 §2.2.1 / RFC 6749 §5.1: successful response", async () => {
			// Both tokens get the same configured lifetime, so after a pause an
			// exchanged token that ignored the subject's expiry would expire later.
			await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_100));
			const success = await exchange(
				"token exchange success",
				"RFC 8693 §2.1, §2.2.1; RFC 6749 §5.1",
				exchangeForm(subjectToken),
			);
			expect(success.status, JSON.stringify(success.body)).toBe(200);
			expectNoStoreJSON(success);
			exchangedAccessToken = readString(success.body, "access_token");
			expect(success.body.issued_token_type).toBe(ACCESS_TOKEN_TYPE);
			expect(String(success.body.token_type).toLowerCase()).toBe("bearer");
			expect(success.body.expires_in).toEqual(expect.any(Number));
			expect(typeof success.body.scope).toBe("string");
			// RFC 8693 §2.2.1: a refresh token is typically not issued; never an ID token.
			expect(success.body).not.toHaveProperty("refresh_token");
			expect(success.body).not.toHaveProperty("id_token");
			expect(Number(success.body.expires_in)).toBeLessThanOrEqual(
				Number(subject.exp) - Math.floor(Date.now() / 1000) + 5,
			);

			// RFC 9068 §2.1: JWT access token header.
			expect(decodeProtectedHeader(exchangedAccessToken).typ).toBe("at+jwt");
			// RFC 9068 §2.2: required claims.
			const claims = decodeJwt(exchangedAccessToken);
			expect(claims.iss).toBe(runtime.baseURL);
			expect(claims.sub).toBe(userId);
			expect(audienceList(claims.aud)).toEqual([runtime.apiURL]);
			expect(claims.client_id).toBe(runtime.exchanger.client_id);
			expect(claims.exp).toEqual(expect.any(Number));
			expect(claims.iat).toEqual(expect.any(Number));
			expect(claims.jti).toEqual(expect.any(String));
			// The exchanged token never outlives the subject token.
			expect(Number(claims.exp)).toBe(Number(subject.exp));
			expect(scopeList(claims.scope)).toEqual(scopeList(success.body.scope));

			// RFC 8693 §2.1: exchange does not consume the subject token.
			const again = await exchange(
				"token exchange repeated with the same subject token",
				"RFC 8693 §2.1",
				exchangeForm(subjectToken),
			);
			expect(again.status, JSON.stringify(again.body)).toBe(200);
			expect(decodeJwt(readString(again.body, "access_token")).jti).not.toBe(
				claims.jti,
			);
		});

		await test.step("RFC 8693 §2.2.2 / RFC 6749 §5.2: error responses", async () => {
			const cases: Array<{
				name: string;
				rfc: string;
				form: Record<string, string>;
				error: string;
			}> = [
				{
					name: "missing subject_token",
					rfc: "RFC 8693 §2.1, §2.2.2",
					form: exchangeForm(subjectToken, { subject_token: undefined }),
					error: "invalid_request",
				},
				{
					name: "unsupported subject_token_type",
					rfc: "RFC 8693 §2.1, §2.2.2",
					form: exchangeForm(subjectToken, {
						subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
					}),
					error: "invalid_request",
				},
				{
					name: "garbage subject_token",
					rfc: "RFC 8693 §2.2.2",
					form: exchangeForm("not-a-token"),
					error: "invalid_request",
				},
				{
					name: "actor_token present (delegation is not supported)",
					rfc: "RFC 8693 §2.1, §2.2.2",
					form: exchangeForm(subjectToken, {
						actor_token: subjectToken,
						actor_token_type: ACCESS_TOKEN_TYPE,
					}),
					error: "invalid_request",
				},
				{
					name: "actor_token_type without actor_token",
					rfc: "RFC 8693 §2.1",
					form: exchangeForm(subjectToken, {
						actor_token_type: ACCESS_TOKEN_TYPE,
					}),
					error: "invalid_request",
				},
				{
					name: "unsupported requested_token_type",
					rfc: "RFC 8693 §2.1, §2.2.2",
					form: exchangeForm(subjectToken, {
						requested_token_type:
							"urn:ietf:params:oauth:token-type:refresh_token",
					}),
					error: "invalid_request",
				},
				{
					name: "audience parameter (use resource)",
					rfc: "RFC 8693 §2.1, §2.2.2",
					form: exchangeForm(subjectToken, { audience: runtime.apiURL }),
					error: "invalid_target",
				},
				{
					// RFC 8693 makes resource optional; this server requires a target.
					name: "missing resource",
					rfc: "RFC 8693 §2.1, §2.2.2",
					form: exchangeForm(subjectToken, { resource: undefined }),
					error: "invalid_request",
				},
				{
					name: "unknown resource",
					rfc: "RFC 8693 §2.2.2, RFC 8707 §2",
					form: exchangeForm(subjectToken, {
						resource: "http://127.0.0.1:1/unknown",
					}),
					error: "invalid_target",
				},
				{
					name: "scope not granted to the subject token",
					rfc: "RFC 8693 §2.2.2, RFC 6749 §5.2",
					form: exchangeForm(subjectToken, { scope: "read:organization" }),
					error: "invalid_scope",
				},
				{
					name: "non-exchangeable openid scope",
					rfc: "RFC 8693 §2.2.2, RFC 6749 §5.2",
					form: exchangeForm(subjectToken, { scope: "openid" }),
					error: "invalid_scope",
				},
			];
			for (const errorCase of cases) {
				const response = await exchange(
					errorCase.name,
					errorCase.rfc,
					errorCase.form,
				);
				expectOAuthError(response, 400, errorCase.error);
				expectNoStoreJSON(response);
			}

			const wrongSecret = await exchange(
				"wrong client secret",
				"RFC 6749 §5.2",
				exchangeForm(subjectToken),
				{ ...runtime.exchanger, client_secret: "wrong-secret" },
			);
			expectOAuthError(wrongSecret, 401, "invalid_client");
			// RFC 6749 §5.2: Basic authentication failures carry a challenge.
			expect(wrongSecret.headers["www-authenticate"]).toBeTruthy();
		});

		await test.step("a self-registered client the user never approved cannot exchange the user's token", async () => {
			// The demo links every DCR client to <BASE>/api/mcp
			// (clientRegistrationDefaultResources), so this client counts as a
			// resource server for the token's audience. Without the user's consent
			// for it, the exchange is refused. The unit tests cover a client that is
			// outside the token's audience.
			const deputy = await registerClient(browserContext.request, {
				client_name: "Unrelated confidential exchanger",
				token_endpoint_auth_method: "client_secret_basic",
				grant_types: [TOKEN_EXCHANGE_GRANT],
				scope: "profile email",
			});
			const response = await exchange(
				"self-registered client without the user's consent",
				"RFC 8693 §2.2.2, §5",
				exchangeForm(subjectToken),
				{
					client_id: readString(deputy, "client_id"),
					client_secret: readString(deputy, "client_secret"),
				},
			);
			expectOAuthError(response, 400, "invalid_request");
			expect(String(response.body.error_description)).toContain("consented");
		});

		await test.step("public clients cannot use the grant (RFC 8693 §2.1)", async () => {
			const publicClient = await registerClient(anonymous, {
				client_name: "Public exchanger",
				token_endpoint_auth_method: "none",
				grant_types: [TOKEN_EXCHANGE_GRANT],
			});
			const response = await oauthCall(anonymous, {
				name: "public client presents the grant",
				rfc: "RFC 8693 §2.1, RFC 6749 §5.2",
				url: `${runtime.baseURL}/api/auth/oauth2/token`,
				form: {
					...exchangeForm(subjectToken),
					client_id: readString(publicClient, "client_id"),
				},
			});
			expect([400, 401]).toContain(response.status);
			expect(response.body.error).toBe("invalid_client");
		});

		await test.step("RFC 7662 §2.2: the exchanger introspects the exchanged token", async () => {
			const response = await introspect(
				"introspection of the exchanged token",
				exchangedAccessToken,
			);
			expect(response.status, JSON.stringify(response.body)).toBe(200);
			expect(response.body).toMatchObject({
				active: true,
				sub: userId,
				client_id: runtime.exchanger.client_id,
			});
			expect(audienceList(response.body.aud)).toContain(runtime.apiURL);
			expect(typeof response.body.scope).toBe("string");
			expect(response.body.exp).toEqual(expect.any(Number));
		});
	});

	test("the exchanged token keeps the organization the user approved, even after switching (RFC 9068 §2.2.1)", async () => {
		// One organization while approving: the demo's select-organization page
		// loops for users with several (#11093).
		const acmeId = await createOrganization(
			browserContext.request,
			runtime.baseURL,
			"Acme",
		);

		// A second MCP client that asks for organization data, so the demo's
		// consentReferenceId issues the token under the active organization.
		const clientName = "E2E MCP organization client";
		const scope = `${MCP_CLIENT_SCOPE} read:organization`;
		const registration = await registerClient(anonymous, {
			client_name: clientName,
			application_type: "native",
			redirect_uris: [runtime.callbackURL],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope,
		});
		const clientId = readString(registration, "client_id");
		const { code, codeVerifier } = await completeBrowserAuthorization(
			page,
			runtime,
			{
				clientId,
				clientName,
				email: userEmail,
				scope,
			},
		);
		const token = await oauthCall(anonymous, {
			name: "authorization code exchange with an organization",
			rfc: "RFC 6749 §4.1.3",
			url: `${runtime.baseURL}/api/auth/oauth2/token`,
			form: {
				grant_type: "authorization_code",
				code,
				code_verifier: codeVerifier,
				redirect_uri: runtime.callbackURL,
				client_id: clientId,
				resource: runtime.mcpResource,
			},
		});
		expect(token.status, JSON.stringify(token.body)).toBe(200);
		const organizationToken = readString(token.body, "access_token");
		const organizationClaim = `${runtime.baseURL}/org`;
		expect(decodeJwt(organizationToken)[organizationClaim]).toBe(acmeId);

		const readDownstream = async () => {
			const result = await callMcpTool(
				anonymous,
				runtime,
				organizationToken,
				"call_downstream_api",
			);
			expect(result.isError, result.text).toBe(false);
			const output: unknown = JSON.parse(result.text);
			if (!isJSONObject(output) || !isJSONObject(output.downstream)) {
				throw new Error(`Unexpected tool output: ${result.text}`);
			}
			return output.downstream;
		};
		const approved = await readDownstream();
		expect(approved.reference_id).toBe(acmeId);
		expect(approved.org).toBe(acmeId);
		expect(scopeList(approved.scope)).toContain("read:organization");

		// Switching the active organization does not move tokens the user
		// already approved for Acme into Beta.
		const betaId = await createOrganization(
			browserContext.request,
			runtime.baseURL,
			"Beta",
		);
		const switched = await browserContext.request.post(
			`${runtime.baseURL}/api/auth/organization/set-active`,
			{
				headers: { origin: runtime.baseURL },
				data: { organizationId: betaId },
			},
		);
		expect(switched.ok(), await switched.text()).toBe(true);
		expect(await readDownstream()).toMatchObject({
			reference_id: acmeId,
			org: acmeId,
		});
	});

	test("after the user signs out, exchange fails and the exchanged token is inactive (RFC 8693 §2.2.2, RFC 7662 §2.2)", async () => {
		const before = await callMcpTool(
			anonymous,
			runtime,
			freshMcpAccessToken,
			"call_downstream_api",
		);
		expect(before.isError, before.text).toBe(false);

		await page.goto(`${runtime.baseURL}/dashboard`);
		const signOut = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === "/api/auth/sign-out" &&
				response.request().method() === "POST",
		);
		// The user card footer's button; the first "Sign Out" is the
		// current-session row, which revokes by token instead.
		await page.getByRole("button", { name: "Sign Out" }).last().click();
		expect((await signOut).status()).toBe(200);

		// The MCP token still verifies at the MCP server (JWT, not expired), but
		// its session is gone, so the exchange is refused.
		const result = await callMcpTool(
			anonymous,
			runtime,
			freshMcpAccessToken,
			"call_downstream_api",
		);
		expect(result.isError, result.text).toBe(true);
		expect(result.text).toContain("invalid_request");

		const response = await introspect(
			"introspection of the exchanged token after sign-out",
			exchangedAccessToken,
		);
		expect(response.status, JSON.stringify(response.body)).toBe(200);
		expect(response.body.active).toBe(false);
	});
});
