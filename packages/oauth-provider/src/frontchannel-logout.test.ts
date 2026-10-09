import { createHash } from "node:crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "@better-auth/core/oauth2";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import type { Listener } from "listhen";
import { listen } from "listhen";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

type MakeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Extracts iframe `src` attribute values from the rendered logout page, with
 * HTML attribute entities decoded back to the raw URL.
 */
function extractIframeSources(html: string): string[] {
	return [...html.matchAll(/<iframe[^>]*\ssrc="([^"]*)"/g)].map((m) =>
		m[1]!.replaceAll("&amp;", "&"),
	);
}

function extractInlineScript(html: string): string {
	const match = html.match(/<script>([\s\S]*?)<\/script>/);
	if (!match) throw new Error("logout page has no inline script");
	return match[1]!;
}

describe("oauth front-channel logout", async () => {
	const port = 3011;
	const baseUrl = `http://localhost:${port}`;
	const issuer = `${baseUrl}/api/auth`;
	const rpBaseUrl = "http://localhost:5001";
	const state = "123";
	const scopes = ["openid", "email", "profile"];
	let vetoSessionDelete = false;

	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			baseURL: baseUrl,
			databaseHooks: {
				session: {
					delete: {
						async before() {
							if (vetoSessionDelete) return false;
						},
					},
				},
			},
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

	beforeAll(async () => {
		server = await listen(toNodeHandler(auth.handler), { port });
	});
	afterAll(async () => {
		if (server) await server.close();
	});
	beforeEach(async () => {
		vetoSessionDelete = false;
		const signed = await signInWithTestUser();
		headers = signed.headers;
	});

	async function registerClient(
		overrides: Partial<{
			enable_end_session: boolean;
			frontchannel_logout_uri: string | undefined;
			frontchannel_logout_session_required: boolean;
			post_logout_redirect_uris: string[];
		}> = {},
	) {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [`${rpBaseUrl}/callback`],
				// http loopback redirect URIs are only valid for native clients;
				// web clients require https on a non-loopback host.
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
				enable_end_session: true,
				frontchannel_logout_uri: `${rpBaseUrl}/logout/frontchannel`,
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
	}) {
		const { client: oauthClient } = params;
		const redirectUri = `${rpBaseUrl}/callback`;
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
			scopes,
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
		}>("/oauth2/token", { method: "POST", body, headers: tokenHeaders });
		return tokens.data!;
	}

	/**
	 * Hits the end-session endpoint the way a top-level browser navigation does.
	 * `isBrowserNavigation` requires `sec-fetch-mode: navigate` or an HTML
	 * `accept`, and that is the only request shape that renders the iframe
	 * fan-out page — anything else keeps the redirect/JSON contract.
	 */
	async function endSessionNavigation(
		query: Record<string, string>,
		init?: RequestInit,
	) {
		const params = new URLSearchParams(query);
		return auth.handler(
			new Request(`${baseUrl}/api/auth/oauth2/end-session?${params}`, {
				...init,
				headers: {
					accept: "text/html,application/xhtml+xml",
					"sec-fetch-mode": "navigate",
					...(init?.headers as Record<string, string> | undefined),
				},
			}),
		);
	}

	it("renders one hidden iframe per front-channel client after ending the session", async () => {
		const fcClient = await registerClient();
		const plainClient = await registerClient({
			frontchannel_logout_uri: undefined,
		});
		const tokens = await issueTokens({ client: fcClient });
		await issueTokens({ client: plainClient });

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");

		const html = await response.text();
		const sources = extractIframeSources(html).map((src) => new URL(src));
		expect(sources).toHaveLength(1);
		expect(sources[0]!.origin + sources[0]!.pathname).toBe(
			`${rpBaseUrl}/logout/frontchannel`,
		);

		// Spec §3: the OP terminates the session before rendering the iframes
		const session = await client.getSession({ fetchOptions: { headers } });
		expect(session.data).toBeNull();
	});

	it("keeps the logout page CSP and allows only the RP frames and the page script", async () => {
		const fcClient = await registerClient();
		const tokens = await issueTokens({ client: fcClient });

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
		});
		const html = await response.text();
		const scriptHash = createHash("sha256")
			.update(extractInlineScript(html))
			.digest("base64");
		expect(response.headers.get("content-security-policy")).toBe(
			`default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; frame-src ${rpBaseUrl}; script-src 'sha256-${scriptHash}'`,
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});

	/**
	 * @see https://openid.net/specs/openid-connect-frontchannel-1_0.html#OPLogout
	 */
	it("sends iss and sid to every front-channel client, matching each ID token sid", async () => {
		const initiator = await registerClient({
			frontchannel_logout_uri: `${rpBaseUrl}/logout/fc-required`,
			frontchannel_logout_session_required: true,
		});
		// Registers only front-channel logout: no end-session, no back-channel.
		const participant = await registerClient({
			enable_end_session: false,
			frontchannel_logout_uri: `${rpBaseUrl}/logout/fc-optional`,
		});
		const initiatorTokens = await issueTokens({ client: initiator });
		const participantTokens = await issueTokens({ client: participant });

		const sid = decodeJwt(initiatorTokens.id_token).sid;
		expect(sid).toBeDefined();
		expect(decodeJwt(participantTokens.id_token).sid).toBe(sid);

		const response = await endSessionNavigation({
			id_token_hint: initiatorTokens.id_token,
		});
		const sources = extractIframeSources(await response.text()).map(
			(src) => new URL(src),
		);
		expect(sources.map((u) => u.pathname).sort()).toEqual([
			"/logout/fc-optional",
			"/logout/fc-required",
		]);
		for (const source of sources) {
			expect(source.searchParams.get("iss")).toBe(issuer);
			expect(source.searchParams.get("sid")).toBe(sid);
		}
	});

	it("redirects to the verified post_logout_redirect_uri after the iframes", async () => {
		const fcClient = await registerClient({
			post_logout_redirect_uris: [`${rpBaseUrl}/logout/callback`],
		});
		const tokens = await issueTokens({ client: fcClient });

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
			post_logout_redirect_uri: `${rpBaseUrl}/logout/callback`,
			state,
		});
		expect(response.status).toBe(200);
		const html = await response.text();
		const redirect = `${rpBaseUrl}/logout/callback?state=${state}`;
		expect(html).toContain(`data-post-logout-redirect-uri="${redirect}"`);
		// Without JavaScript, a meta refresh performs the same redirect.
		expect(html).toContain(
			`<meta http-equiv="refresh" content="3;url=${redirect}">`,
		);
	});

	it("shows the logged-out state, not a redirect, for an unregistered post_logout_redirect_uri", async () => {
		const fcClient = await registerClient();
		const tokens = await issueTokens({ client: fcClient });

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
			post_logout_redirect_uri: `${rpBaseUrl}/evil`,
		});
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).not.toContain(`${rpBaseUrl}/evil`);
		expect(html).not.toContain("data-post-logout-redirect-uri=");
		expect(html).toContain(
			'data-logged-out-message="Logged out. The requested post-logout redirect was not registered."',
		);
	});

	it("keeps the immediate redirect when no front-channel client holds tokens on the session", async () => {
		const plainClient = await registerClient({
			frontchannel_logout_uri: undefined,
			post_logout_redirect_uris: [`${rpBaseUrl}/logout/callback`],
		});
		const tokens = await issueTokens({ client: plainClient });

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
			post_logout_redirect_uri: `${rpBaseUrl}/logout/callback`,
			state,
		});
		expect(response.status).toBe(302);
		const location = response.headers.get("location")!;
		expect(location).toContain(`${rpBaseUrl}/logout/callback`);
		expect(location).toContain(`state=${state}`);
	});

	it("keeps the registered query, overwrites a registered sid, and escapes the iframe source", async () => {
		const fcClient = await registerClient({
			frontchannel_logout_uri: `${rpBaseUrl}/logout/frontchannel?a=1&b=2&sid=stale`,
		});
		const tokens = await issueTokens({ client: fcClient });

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
		});
		const html = await response.text();
		// Raw `&` must be entity-encoded inside the attribute value
		expect(html).toContain("a=1&amp;b=2&amp;sid=");
		const [source] = extractIframeSources(html).map((src) => new URL(src));
		expect(source!.searchParams.get("a")).toBe("1");
		expect(source!.searchParams.get("b")).toBe("2");
		expect(source!.searchParams.getAll("sid")).toEqual([
			decodeJwt(tokens.id_token).sid,
		]);
		expect(source!.searchParams.getAll("iss")).toEqual([issuer]);
	});

	it("skips a client whose stored frontchannel_logout_uri is not a URL without dropping the others", async () => {
		const validClient = await registerClient();
		const corruptClient = await registerClient({
			frontchannel_logout_uri: `${rpBaseUrl}/logout/corrupt`,
		});
		const tokens = await issueTokens({ client: validClient });
		await issueTokens({ client: corruptClient });
		const ctx = await auth.$context;
		await ctx.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: corruptClient.client_id }],
			update: { frontchannelLogoutUri: "not a url" },
		});

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
		});
		const sources = extractIframeSources(await response.text()).map(
			(src) => new URL(src).pathname,
		);
		expect(sources).toEqual(["/logout/frontchannel"]);
	});

	it("does not notify relying parties when a hook vetoes the session deletion", async () => {
		const fcClient = await registerClient();
		const tokens = await issueTokens({ client: fcClient });
		vetoSessionDelete = true;

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
		});
		const html = await response.text();
		expect(html).not.toContain("<iframe");
		const session = await auth.api.getSession({ headers });
		expect(session).not.toBeNull();
	});

	it("renders the front-channel page after the user confirms logout", async () => {
		const fcClient = await registerClient();
		await issueTokens({ client: fcClient });

		// No id_token_hint, so the OP asks the user to confirm first.
		const confirmation = await endSessionNavigation({});
		expect(await confirmation.text()).toContain(
			"data-oidc-logout-confirmation",
		);
		cookieSetter(headers)({ response: confirmation } as never);

		const completed = await auth.handler(
			new Request(`${baseUrl}/api/auth/oauth2/end-session/confirm`, {
				method: "POST",
				headers: {
					accept: "text/html",
					"content-type": "application/x-www-form-urlencoded",
					cookie: headers.get("cookie") ?? "",
					origin: baseUrl,
					"sec-fetch-mode": "navigate",
				},
				body: new URLSearchParams({ action: "confirm" }),
			}),
		);
		expect(completed.status).toBe(200);
		const sources = extractIframeSources(await completed.text()).map(
			(src) => new URL(src).pathname,
		);
		expect(sources).toEqual(["/logout/frontchannel"]);
	});

	it("preserves the JSON contract for fetch-style requests", async () => {
		const fcClient = await registerClient({
			post_logout_redirect_uris: [`${rpBaseUrl}/logout/callback`],
		});
		const tokens = await issueTokens({ client: fcClient });

		// Browser `fetch()` calls cannot render iframes, so the response must
		// stay on the pre-existing JSON shape even when front-channel clients
		// hold tokens on the session.
		const response = await auth.handler(
			new Request(
				`${baseUrl}/api/auth/oauth2/end-session?${new URLSearchParams({
					id_token_hint: tokens.id_token,
					post_logout_redirect_uri: `${rpBaseUrl}/logout/callback`,
				})}`,
				{
					headers: {
						accept: "application/json",
						"sec-fetch-mode": "cors",
						"sec-fetch-dest": "empty",
						"sec-fetch-site": "same-origin",
					},
				},
			),
		);
		expect(response.headers.get("content-type")).toContain("application/json");
		const body = (await response.json()) as { redirect: boolean; url: string };
		expect(body.redirect).toBe(true);
		expect(body.url).toContain(`${rpBaseUrl}/logout/callback`);
	});
});

describe("oauth front-channel logout (jwt plugin disabled)", async () => {
	const port = 3022;
	const baseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5001";
	const state = "123";
	const scopes = ["openid", "email", "profile"];

	// Front-channel logout never signs anything — the iframe URLs carry plain
	// `iss`/`sid` query parameters — so it must keep working with HS256 ID
	// tokens when the jwt plugin is disabled.
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				disableJwtPlugin: true,
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes,
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: { customFetchImpl },
	});

	it("renders the front-channel logout page when the jwt plugin is disabled", async () => {
		const redirectUri = `${rpBaseUrl}/callback`;
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
				enable_end_session: true,
				frontchannel_logout_uri: `${rpBaseUrl}/logout/frontchannel`,
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
			scopes,
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
		const tokens = await client.$fetch<{ id_token: string }>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});

		const response = await auth.handler(
			new Request(
				`${baseUrl}/api/auth/oauth2/end-session?${new URLSearchParams({
					id_token_hint: tokens.data!.id_token,
				})}`,
				{
					headers: {
						accept: "text/html,application/xhtml+xml",
						"sec-fetch-mode": "navigate",
					},
				},
			),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(
			extractIframeSources(await response.text()).map(
				(src) => new URL(src).pathname,
			),
		).toEqual(["/logout/frontchannel"]);
	});
});
