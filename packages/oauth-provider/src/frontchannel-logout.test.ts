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

describe("oauth front-channel logout", async () => {
	const port = 3011;
	const baseUrl = `http://localhost:${port}`;
	const issuer = `${baseUrl}/api/auth`;
	const rpBaseUrl = "http://localhost:5001";
	const state = "123";
	const scopes = ["openid", "email", "profile"];

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

	beforeAll(async () => {
		server = await listen(toNodeHandler(auth.handler), { port });
	});
	afterAll(async () => {
		if (server) await server.close();
	});
	beforeEach(async () => {
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
		const { url: authUrl } = await createAuthorizationURL({
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
	 * Hits the end-session endpoint the way a browser navigation does (no
	 * `sec-fetch-mode: cors`, no `accept: application/json`), which is the only
	 * request shape that can render the iframe fan-out page.
	 */
	async function endSessionNavigation(
		query: Record<string, string>,
		init?: RequestInit,
	) {
		const params = new URLSearchParams(query);
		return auth.handler(
			new Request(`${baseUrl}/api/auth/oauth2/end-session?${params}`, init),
		);
	}

	it("renders one hidden iframe per front-channel client and ends the session", async () => {
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
		// The page is per-session state and must never be cached
		expect(response.headers.get("cache-control")).toContain("no-store");

		const html = await response.text();
		const sources = extractIframeSources(html);
		expect(sources).toEqual([`${rpBaseUrl}/logout/frontchannel`]);

		// Spec §3: the OP terminates the session before rendering the iframes
		const session = await client.getSession({ fetchOptions: { headers } });
		expect(session.data).toBeNull();
	});

	it("appends iss and sid only for clients with frontchannel_logout_session_required", async () => {
		const requiredClient = await registerClient({
			frontchannel_logout_uri: `${rpBaseUrl}/logout/fc-required`,
			frontchannel_logout_session_required: true,
		});
		const optionalClient = await registerClient({
			frontchannel_logout_uri: `${rpBaseUrl}/logout/fc-optional`,
		});
		const tokens = await issueTokens({ client: requiredClient });
		await issueTokens({ client: optionalClient });

		const sid = decodeJwt(tokens.id_token).sid;
		expect(sid).toBeDefined();

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
		});
		const sources = extractIframeSources(await response.text()).map(
			(src) => new URL(src),
		);
		expect(sources).toHaveLength(2);

		// Spec §2: when the RP requires session matching, the OP includes both
		// `iss` and `sid` (if either is included, both MUST be)
		const required = sources.find((u) => u.pathname === "/logout/fc-required")!;
		expect(required.searchParams.get("iss")).toBe(issuer);
		expect(required.searchParams.get("sid")).toBe(sid);

		const optional = sources.find((u) => u.pathname === "/logout/fc-optional")!;
		expect(optional.searchParams.get("iss")).toBeNull();
		expect(optional.searchParams.get("sid")).toBeNull();
	});

	it("carries the validated post_logout_redirect_uri into the page redirect", async () => {
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
		expect(html).toContain(`${rpBaseUrl}/logout/callback?state=${state}`);
	});

	it("drops an unregistered post_logout_redirect_uri from the page", async () => {
		const fcClient = await registerClient();
		const tokens = await issueTokens({ client: fcClient });

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
			post_logout_redirect_uri: `${rpBaseUrl}/evil`,
		});
		expect(response.status).toBe(200);
		expect(await response.text()).not.toContain(`${rpBaseUrl}/evil`);
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

	it("escapes HTML metacharacters in iframe sources", async () => {
		const fcClient = await registerClient({
			frontchannel_logout_uri: `${rpBaseUrl}/logout/frontchannel?a=1&b=2`,
		});
		const tokens = await issueTokens({ client: fcClient });

		const response = await endSessionNavigation({
			id_token_hint: tokens.id_token,
		});
		const html = await response.text();
		// Raw `&` must be entity-encoded inside the attribute value
		expect(html).toContain("a=1&amp;b=2");
		expect(extractIframeSources(html)).toEqual([
			`${rpBaseUrl}/logout/frontchannel?a=1&b=2`,
		]);
	});

	it("preserves the JSON contract for fetch-style requests", async () => {
		const fcClient = await registerClient({
			post_logout_redirect_uris: [`${rpBaseUrl}/logout/callback`],
		});
		const tokens = await issueTokens({ client: fcClient });

		// Browser `fetch()` calls cannot render iframes, so the response must
		// stay on the pre-existing JSON shape even when front-channel clients
		// hold tokens on the session.
		const response = await endSessionNavigation(
			{
				id_token_hint: tokens.id_token,
				post_logout_redirect_uri: `${rpBaseUrl}/logout/callback`,
			},
			{ headers: { accept: "application/json" } },
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
				skip_consent: true,
				enable_end_session: true,
				frontchannel_logout_uri: `${rpBaseUrl}/logout/frontchannel`,
			},
		});
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw new Error("client registration failed");
		}

		const codeVerifier = generateRandomString(32);
		const { url: authUrl } = await createAuthorizationURL({
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
			),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(extractIframeSources(await response.text())).toEqual([
			`${rpBaseUrl}/logout/frontchannel`,
		]);
	});
});
