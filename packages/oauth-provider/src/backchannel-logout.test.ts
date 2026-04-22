import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
} from "@better-auth/core/oauth2";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { createLocalJWKSet, jwtVerify } from "jose";
import type { Listener } from "listhen";
import { listen } from "listhen";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

interface ReceivedLogoutRequest {
	contentType: string | undefined;
	logoutToken: string | undefined;
	raw: string;
}

/**
 * Minimal mock Relying Party that records back-channel logout requests and
 * returns a configurable status, with optional artificial latency.
 */
async function startMockRp(
	options: { status?: number; delayMs?: number } = {},
) {
	const received: ReceivedLogoutRequest[] = [];
	const server = createServer((req, res) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			const params = new URLSearchParams(body);
			received.push({
				contentType: req.headers["content-type"],
				logoutToken: params.get("logout_token") ?? undefined,
				raw: body,
			});
			if (options.delayMs) {
				await new Promise((r) => setTimeout(r, options.delayMs));
			}
			res.statusCode = options.status ?? 200;
			res.end();
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as AddressInfo;
	const url = `http://127.0.0.1:${address.port}`;
	return {
		received,
		url,
		async close() {
			await new Promise<void>((resolve, reject) =>
				server.close((err) => (err ? reject(err) : resolve())),
			);
		},
	};
}

type MakeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

describe("oauth back-channel logout", async () => {
	const port = 3010;
	const baseUrl = `http://localhost:${port}`;
	const state = "123";
	const scopes = ["openid", "email", "profile", "offline_access"];

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes,
			}),
			jwt(),
		],
	});
	let { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: { customFetchImpl },
	});
	let server: Listener;

	let rp: Awaited<ReturnType<typeof startMockRp>>;

	beforeAll(async () => {
		server = await listen(toNodeHandler(auth.handler), { port });
	});
	afterAll(async () => {
		if (server) await server.close();
	});
	beforeEach(async () => {
		rp = await startMockRp();
		const signed = await signInWithTestUser();
		headers = signed.headers;
	});
	afterEach(async () => {
		await rp.close();
	});

	async function registerClient(
		overrides: Partial<{
			enable_end_session: boolean;
			backchannel_logout_uri: string | undefined;
			backchannel_logout_session_required: boolean;
		}> = {},
	) {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [`${rp.url}/callback`],
				skip_consent: true,
				enable_end_session: true,
				backchannel_logout_uri: `${rp.url}/logout/backchannel`,
				...overrides,
			},
		});
		if (!response?.client_id || !response?.client_secret) {
			throw new Error("client registration failed");
		}
		return response;
	}

	async function issueTokens(params: {
		client: Awaited<ReturnType<typeof registerClient>>;
		requestScopes?: string[];
	}) {
		const { client: oauthClient, requestScopes = scopes } = params;
		const redirectUri = `${rp.url}/callback`;
		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: "test",
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: requestScopes,
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const code = new URL(callbackRedirectUrl).searchParams.get("code");
		if (!code) {
			throw new Error(`no authorization code in ${callbackRedirectUrl}`);
		}

		const { body, headers: tokenHeaders } = createAuthorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
		} satisfies MakeRequired<
			Parameters<typeof createAuthorizationCodeRequest>[0],
			"code"
		>);

		const tokens = await client.$fetch<{
			access_token: string;
			id_token: string;
			refresh_token?: string;
		}>("/oauth2/token", { method: "POST", body, headers: tokenHeaders });
		return tokens.data!;
	}

	async function waitForDispatches(min = 1, timeoutMs = 2_000) {
		const start = Date.now();
		while (rp.received.length < min) {
			if (Date.now() - start > timeoutMs) {
				throw new Error(
					`Timed out waiting for ${min} logout dispatches; received ${rp.received.length}`,
				);
			}
			await new Promise((r) => setTimeout(r, 25));
		}
	}

	it("dispatches a conformant logout token when the session is signed out", async () => {
		const oauthClient = await registerClient();
		const tokens = await issueTokens({ client: oauthClient });

		// signOut on the OP triggers session.delete.before → dispatch
		await client.signOut({ fetchOptions: { headers } });
		await waitForDispatches();

		expect(rp.received).toHaveLength(1);
		const received = rp.received[0]!;
		expect(received.contentType).toContain("application/x-www-form-urlencoded");
		expect(received.logoutToken).toBeDefined();

		const { keys } = await auth.api.getJwks();
		const { payload, protectedHeader } = await jwtVerify(
			received.logoutToken!,
			createLocalJWKSet({ keys: keys as any }),
		);
		expect(protectedHeader.typ).toBe("logout+jwt");
		expect(protectedHeader.alg).not.toBe("none");
		expect(payload.iss).toBe(`${baseUrl}/api/auth`);
		expect(payload.aud).toBe(oauthClient.client_id);
		expect(payload.iat).toEqual(expect.any(Number));
		expect(payload.exp).toEqual(expect.any(Number));
		expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(120);
		expect(payload.jti).toEqual(expect.any(String));
		expect(payload.sub).toEqual(expect.any(String));
		expect(payload.sid).toEqual(expect.any(String));
		expect(payload.nonce).toBeUndefined();
		expect(payload.events).toEqual({
			"http://schemas.openid.net/event/backchannel-logout": {},
		});

		// ID token sid must equal Logout Token sid (same session identifier)
		const [, idTokenPayloadB64] = tokens.id_token.split(".");
		const idTokenPayload = JSON.parse(
			Buffer.from(idTokenPayloadB64!, "base64url").toString("utf8"),
		);
		expect(payload.sid).toBe(idTokenPayload.sid);
	});

	it("dispatches when RP-Initiated Logout tears down the session", async () => {
		const oauthClient = await registerClient();
		const tokens = await issueTokens({ client: oauthClient });

		await client.oauth2.endSession({
			query: { id_token_hint: tokens.id_token },
		});
		await waitForDispatches();

		expect(rp.received).toHaveLength(1);
	});

	it("marks non-offline_access access + refresh tokens revoked, preserves offline_access refresh tokens", async () => {
		const oauthClient = await registerClient();
		await issueTokens({ client: oauthClient });

		const ctx = await auth.$context;

		const accessBefore = await ctx.adapter.findMany<{ revoked?: Date | null }>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		const refreshBefore = await ctx.adapter.findMany<{
			revoked?: Date | null;
			scopes: string[];
		}>({
			model: "oauthRefreshToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		expect(accessBefore.length).toBeGreaterThan(0);
		expect(refreshBefore.length).toBeGreaterThan(0);
		for (const t of accessBefore) expect(t.revoked ?? null).toBeNull();
		for (const t of refreshBefore) expect(t.revoked ?? null).toBeNull();

		await client.signOut({ fetchOptions: { headers } });
		await waitForDispatches();

		const accessAfter = await ctx.adapter.findMany<{ revoked?: Date | null }>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		const refreshAfter = await ctx.adapter.findMany<{
			revoked?: Date | null;
			scopes: string[];
		}>({
			model: "oauthRefreshToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		for (const t of accessAfter) expect(t.revoked).toBeInstanceOf(Date);
		// Offline access refresh tokens must survive (spec §2.7)
		for (const t of refreshAfter) {
			if (t.scopes.includes("offline_access")) {
				expect(t.revoked ?? null).toBeNull();
			} else {
				expect(t.revoked).toBeInstanceOf(Date);
			}
		}
	});

	it("revokes access tokens on session end even when no refresh token was issued", async () => {
		// Without `offline_access` in scope, `handleAuthorizationCodeGrant` never
		// mints a refresh token. Access tokens must still be revoked when the
		// session ends (spec §2.7).
		const oauthClient = await registerClient();
		await issueTokens({
			client: oauthClient,
			requestScopes: ["openid", "email", "profile"],
		});

		const ctx = await auth.$context;
		const refreshBefore = await ctx.adapter.findMany<{
			revoked?: Date | null;
			scopes: string[];
		}>({
			model: "oauthRefreshToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		expect(refreshBefore).toHaveLength(0);
		const accessBefore = await ctx.adapter.findMany<{ revoked?: Date | null }>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		expect(accessBefore.length).toBeGreaterThan(0);
		for (const t of accessBefore) expect(t.revoked ?? null).toBeNull();

		await client.signOut({ fetchOptions: { headers } });
		await waitForDispatches();

		const accessAfter = await ctx.adapter.findMany<{ revoked?: Date | null }>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		for (const t of accessAfter) expect(t.revoked).toBeInstanceOf(Date);
	});

	it("does not dispatch to clients without a backchannel_logout_uri", async () => {
		const oauthClient = await registerClient({
			backchannel_logout_uri: undefined,
		});
		await issueTokens({ client: oauthClient });

		await client.signOut({ fetchOptions: { headers } });
		await new Promise((r) => setTimeout(r, 200));

		expect(rp.received).toHaveLength(0);
	});

	it("treats RP failures as non-fatal for the user-facing sign-out", async () => {
		await rp.close();
		rp = await startMockRp({ status: 500 });
		const oauthClient = await registerClient({
			backchannel_logout_uri: `${rp.url}/logout/backchannel`,
		});
		await issueTokens({ client: oauthClient });

		const result = await client.signOut({ fetchOptions: { headers } });
		expect(result.error).toBeNull();
		await waitForDispatches();
		expect(rp.received).toHaveLength(1);
	});
});
