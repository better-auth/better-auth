import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createAuthEndpoint } from "@better-auth/core/api";
import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "@better-auth/core/oauth2";
import { memoryAdapter } from "@better-auth/memory-adapter";
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
import * as z from "zod";
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
	const database = {
		account: [],
		jwks: [],
		oauthAccessToken: [],
		oauthClient: [],
		oauthClientAssertion: [],
		oauthClientResource: [],
		oauthConsent: [],
		oauthRefreshToken: [],
		oauthResource: [],
		session: [],
		user: [],
		verification: [],
	};
	const port = 3010;
	const baseUrl = `http://localhost:${port}`;
	const state = "123";
	const scopes = ["openid", "email", "profile", "offline_access"];
	let shouldVetoSessionDeletion = false;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		database: memoryAdapter(database),
		databaseHooks: {
			session: {
				delete: {
					async before() {
						if (!shouldVetoSessionDeletion) return;
						shouldVetoSessionDeletion = false;
						return false;
					},
				},
			},
		},
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				pairwiseSecret: "test-backchannel-pairwise-secret-32-chars",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes,
			}),
			jwt(),
			{
				id: "transactional-session-revocation-test",
				endpoints: {
					testTransactionalSessionRevocation: createAuthEndpoint(
						"/test/transactional-session-revocation",
						{
							method: "POST",
							body: z.object({
								clientId: z.string().optional(),
								rollback: z.boolean(),
								sessionToken: z.string(),
								transactionAccessTokenId: z.string().optional(),
							}),
						},
						async (ctx) => {
							const rollbackMarker = Symbol("rollback session revocation");
							try {
								await runWithTransaction(ctx.context.adapter, async () => {
									if (ctx.body.clientId && ctx.body.transactionAccessTokenId) {
										const activeSession =
											await ctx.context.internalAdapter.findSession(
												ctx.body.sessionToken,
											);
										if (!activeSession) throw new Error("Session not found");
										const adapter = await getCurrentAdapter(
											ctx.context.adapter,
										);
										await adapter.create({
											model: "oauthAccessToken",
											forceAllowId: true,
											data: {
												id: ctx.body.transactionAccessTokenId,
												token: ctx.body.transactionAccessTokenId,
												clientId: ctx.body.clientId,
												sessionId: activeSession.session.id,
												userId: activeSession.user.id,
												scopes: ["openid"],
												expiresAt: new Date(Date.now() + 60_000),
												createdAt: new Date(),
												revoked: null,
											},
										});
									}
									await ctx.context.internalAdapter.deleteSession(
										ctx.body.sessionToken,
									);
									if (ctx.body.rollback) throw rollbackMarker;
								});
							} catch (error) {
								if (error !== rollbackMarker) throw error;
								return ctx.json({ committed: false });
							}
							return ctx.json({ committed: true });
						},
					),
				},
			},
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
		shouldVetoSessionDeletion = false;
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
			subject_type: "pairwise" | "public";
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

		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
		} satisfies MakeRequired<
			Parameters<typeof authorizationCodeRequest>[0],
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

	async function revokeSessionOverHTTP(input: {
		clientId?: string;
		rollback: boolean;
		sessionToken: string;
		transactionAccessTokenId?: string;
	}) {
		const response = await fetch(
			`${baseUrl}/api/auth/test/transactional-session-revocation`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			},
		);
		if (!response.ok) {
			throw new Error(
				`Transactional session revocation failed: ${await response.text()}`,
			);
		}
		return (await response.json()) as { committed: boolean };
	}

	async function readClientTokenRevocation(clientId: string) {
		const ctx = await auth.$context;
		const [accessTokens, refreshTokens] = await Promise.all([
			ctx.adapter.findMany<{ revoked?: Date | null }>({
				model: "oauthAccessToken",
				where: [{ field: "clientId", value: clientId }],
			}),
			ctx.adapter.findMany<{ revoked?: Date | null }>({
				model: "oauthRefreshToken",
				where: [{ field: "clientId", value: clientId }],
			}),
		]);
		return { accessTokens, refreshTokens };
	}

	async function getSessionToken(requestHeaders: Headers) {
		const session = await auth.api.getSession({ headers: requestHeaders });
		if (!session) throw new Error("Expected an active test session");
		return session.session.token;
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

	it("dispatches logout only after a transactional session revocation commits", async () => {
		const signedIn = await signInWithTestUser();
		headers = signedIn.headers;
		const oauthClient = await registerClient();
		await issueTokens({ client: oauthClient });

		const rolledBack = await revokeSessionOverHTTP({
			rollback: true,
			sessionToken: await getSessionToken(headers),
		});
		expect(rolledBack).toEqual({ committed: false });
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(rp.received).toHaveLength(0);
		expect(await auth.api.getSession({ headers })).not.toBeNull();
		const tokensAfterRollback = await readClientTokenRevocation(
			oauthClient.client_id,
		);
		expect(tokensAfterRollback.accessTokens.length).toBeGreaterThan(0);
		expect(tokensAfterRollback.refreshTokens.length).toBeGreaterThan(0);
		for (const token of tokensAfterRollback.accessTokens) {
			expect(token.revoked ?? null).toBeNull();
		}
		for (const token of tokensAfterRollback.refreshTokens) {
			expect(token.revoked ?? null).toBeNull();
		}

		const committed = await revokeSessionOverHTTP({
			clientId: oauthClient.client_id,
			rollback: false,
			sessionToken: await getSessionToken(headers),
			transactionAccessTokenId: "transaction-only-access-token",
		});
		expect(committed).toEqual({ committed: true });
		await waitForDispatches();
		expect(rp.received).toHaveLength(1);
		expect(await auth.api.getSession({ headers })).toBeNull();
		const tokensAfterCommit = await readClientTokenRevocation(
			oauthClient.client_id,
		);
		for (const token of tokensAfterCommit.accessTokens) {
			expect(token.revoked).toBeInstanceOf(Date);
		}
		for (const token of tokensAfterCommit.refreshTokens) {
			expect(token.revoked ?? null).toBeNull();
		}
		const transactionOnlyToken = await (await auth.$context).adapter.findOne<{
			revoked?: Date | null;
		}>({
			model: "oauthAccessToken",
			where: [{ field: "id", value: "transaction-only-access-token" }],
		});
		expect(transactionOnlyToken?.revoked).toBeInstanceOf(Date);
	});

	it("keeps the session and tokens active when a later hook vetoes deletion", async () => {
		const signedIn = await signInWithTestUser();
		headers = signedIn.headers;
		const oauthClient = await registerClient();
		await issueTokens({ client: oauthClient });
		shouldVetoSessionDeletion = true;

		const result = await revokeSessionOverHTTP({
			rollback: false,
			sessionToken: await getSessionToken(headers),
		});
		expect(result).toEqual({ committed: true });
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(await auth.api.getSession({ headers })).not.toBeNull();
		expect(rp.received).toHaveLength(0);
		const tokens = await readClientTokenRevocation(oauthClient.client_id);
		for (const token of [...tokens.accessTokens, ...tokens.refreshTokens]) {
			expect(token.revoked ?? null).toBeNull();
		}
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

	it("isolates a malformed pairwise client from revocation and healthy RP delivery", async () => {
		const healthyClient = await registerClient();
		const malformedClient = await registerClient({ subject_type: "pairwise" });
		await issueTokens({ client: healthyClient });
		await issueTokens({ client: malformedClient });

		const ctx = await auth.$context;
		await ctx.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: malformedClient.client_id }],
			update: { redirectUris: [] },
		});

		await client.signOut({ fetchOptions: { headers } });
		await waitForDispatches();

		expect(rp.received).toHaveLength(1);
		for (const clientId of [
			healthyClient.client_id,
			malformedClient.client_id,
		]) {
			const tokens = await readClientTokenRevocation(clientId);
			expect(tokens.accessTokens.length).toBeGreaterThan(0);
			for (const token of tokens.accessTokens) {
				expect(token.revoked).toBeInstanceOf(Date);
			}
		}
	});
});

describe("oauth back-channel logout (jwt plugin disabled)", async () => {
	const baseUrl = "http://localhost:3021";
	const redirectUri = "http://localhost:5556/callback";
	const state = "123";

	// No jwt plugin: Logout Tokens cannot be signed, so delivery never runs, but
	// the spec §2.7 token revocation on session end must still happen.
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				disableJwtPlugin: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: { customFetchImpl },
	});

	it("revokes session-bound access tokens on sign-out even when the jwt plugin is disabled", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				enable_end_session: true,
			},
		});
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw new Error("client registration failed");
		}

		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: "test",
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid", "profile"],
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
		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		} satisfies MakeRequired<
			Parameters<typeof authorizationCodeRequest>[0],
			"code"
		>);
		const tokens = await client.$fetch<{ access_token: string }>(
			"/oauth2/token",
			{ method: "POST", body, headers: tokenHeaders },
		);
		expect(tokens.data?.access_token).toBeDefined();

		const ctx = await auth.$context;
		const before = await ctx.adapter.findMany<{ revoked?: Date | null }>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		expect(before.length).toBeGreaterThan(0);
		for (const t of before) expect(t.revoked ?? null).toBeNull();

		// With no JWT plugin, the post-delete phase revokes tokens without
		// attempting Logout Token delivery.
		await client.signOut({ fetchOptions: { headers } });

		const after = await ctx.adapter.findMany<{ revoked?: Date | null }>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		for (const t of after) expect(t.revoked).toBeInstanceOf(Date);
	});
});

describe("oauth back-channel logout - secondaryStorage + preserveSessionInDatabase", async () => {
	// With this topology, sign-out used to delete the secondary-storage entry and
	// return before the session-delete hook, so OAuth tokens were never revoked
	// and Logout Tokens were never dispatched while the preserved DB row stayed
	// live. The hook must still fire on session end when the row is preserved.
	const baseUrl = "http://localhost:3030";
	const redirectUri = `${baseUrl}/callback`;
	const state = "preserve-state";
	const store = new Map<string, string>();

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		secondaryStorage: {
			set(key, value) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			getAndDelete(key) {
				const value = store.get(key) || null;
				store.delete(key);
				return value;
			},
			increment(key) {
				const count = Number(store.get(key) ?? 0) + 1;
				store.set(key, String(count));
				return count;
			},
			delete(key) {
				store.delete(key);
			},
		},
		session: {
			storeSessionInDatabase: true,
			preserveSessionInDatabase: true,
		},
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				disableJwtPlugin: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: { customFetchImpl },
	});

	it("revokes session-bound access tokens on sign-out when the row is preserved", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				enable_end_session: true,
			},
		});
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw new Error("client registration failed");
		}

		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: "test",
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid", "profile"],
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
		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		} satisfies MakeRequired<
			Parameters<typeof authorizationCodeRequest>[0],
			"code"
		>);
		const tokens = await client.$fetch<{ access_token: string }>(
			"/oauth2/token",
			{ method: "POST", body, headers: tokenHeaders },
		);
		expect(tokens.data?.access_token).toBeDefined();

		const ctx = await auth.$context;
		const before = await ctx.adapter.findMany<{ revoked?: Date | null }>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		expect(before.length).toBeGreaterThan(0);
		for (const t of before) expect(t.revoked ?? null).toBeNull();

		await client.signOut({ fetchOptions: { headers } });

		const after = await ctx.adapter.findMany<{ revoked?: Date | null }>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient.client_id }],
		});
		for (const t of after) expect(t.revoked).toBeInstanceOf(Date);
	});
});
