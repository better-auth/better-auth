import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { cimd } from "@better-auth/cimd";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";

// Deterministic PKCE pair (challenge is base64url-encoded SHA-256 of verifier).
const PKCE_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("CIMD end-to-end flow", () => {
	it("runs the full authorize → consent → token → userinfo → refresh loop with a URL client_id", async (t) => {
		// 1. Host the CIMD metadata document on a local HTTP server. CIMD
		//    permits HTTP for localhost so no TLS scaffolding is required.
		const metadataHost = createServer();
		metadataHost.listen(0);
		t.after(() => metadataHost.close());
		await once(metadataHost, "listening");
		const metadataAddr = metadataHost.address() as AddressInfo;
		const clientMetadataUrl = `http://localhost:${metadataAddr.port}/client-metadata.json`;
		const redirectUri = `http://localhost:${metadataAddr.port}/callback`;

		const metadataDocument = {
			client_id: clientMetadataUrl,
			client_name: "CIMD Smoke Test Client",
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: "openid profile email offline_access",
		};

		metadataHost.on("request", (req, res) => {
			if (req.url === "/client-metadata.json") {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify(metadataDocument));
				return;
			}
			res.writeHead(404).end();
		});

		// 2. Pre-reserve the auth server port so `baseURL` reflects reality.
		const authPlaceholder = createServer();
		authPlaceholder.listen(0);
		await once(authPlaceholder, "listening");
		const authPort = (authPlaceholder.address() as AddressInfo).port;
		const authBaseUrl = `http://localhost:${authPort}`;
		authPlaceholder.close();

		// 3. Build auth with oauth-provider + cimd, backed by an in-memory
		//    sqlite database.
		const db = new DatabaseSync(":memory:");
		const auth = betterAuth({
			baseURL: authBaseUrl,
			secret: "smoke-test-secret-that-is-long-enough-for-validation",
			database: db,
			emailAndPassword: { enabled: true },
			trustedOrigins: [authBaseUrl],
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid", "profile", "email", "offline_access"],
					silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
				}),
				cimd({ refreshRate: "60m" }),
			],
		});

		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();

		const authServer = createServer(toNodeHandler(auth.handler));
		authServer.listen(authPort);
		t.after(() => authServer.close());
		await once(authServer, "listening");

		// 4. Discovery metadata advertises CIMD. The `.well-known` endpoint
		//    is server-only, so call it via the in-process API (the same
		//    pattern oauth-provider's MCP integration uses when bridging the
		//    route through a framework handler).
		const discovery = (await auth.api.getOAuthServerConfig()) as Record<
			string,
			unknown
		>;
		assert.equal(
			discovery.client_id_metadata_document_supported,
			true,
			"discovery should advertise CIMD support",
		);

		// 5. Create a demo user and capture the session cookie.
		const signupRes = await fetch(`${authBaseUrl}/api/auth/sign-up/email`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: authBaseUrl,
			},
			body: JSON.stringify({
				email: "alice@example.com",
				password: "smoke-test-password-1",
				name: "Alice",
			}),
		});
		assert.equal(signupRes.ok, true, "sign-up should succeed");
		const sessionCookies = signupRes.headers.get("set-cookie");
		assert.ok(sessionCookies, "sign-up should return session cookies");

		// 6. Hit /oauth2/authorize with the URL client_id. The server fetches
		//    the metadata document, validates it, and creates a public client
		//    record keyed by the URL.
		const authorizeUrl =
			`${authBaseUrl}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(clientMetadataUrl)}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent(redirectUri)}` +
			`&scope=${encodeURIComponent("openid email profile offline_access")}` +
			`&code_challenge=${PKCE_CHALLENGE}` +
			`&code_challenge_method=S256`;

		const authorizeRes = await fetch(authorizeUrl, {
			method: "GET",
			headers: {
				cookie: sessionCookies,
				origin: authBaseUrl,
				// Force the JSON envelope shape (`{ redirect, url }`). Without
				// an explicit Accept, a future change to server-side
				// content negotiation could switch this to a raw 302 and
				// break the test silently.
				accept: "application/json",
			},
			redirect: "manual",
		});
		const authorizePayload = (await authorizeRes.json()) as {
			redirect?: boolean;
			url?: string;
		};
		const consentRedirect = authorizePayload.url ?? "";
		assert.match(
			consentRedirect,
			/\/consent\?/,
			`authorize should redirect to /consent, got: ${consentRedirect}`,
		);

		// 7. Accept consent. `oauth_query` is the literal query string from
		//    the consent URL, signed by /authorize so /consent can verify it.
		const oauthQuery = new URL(consentRedirect, authBaseUrl).search.replace(
			/^\?/,
			"",
		);
		const consentRes = await fetch(`${authBaseUrl}/api/auth/oauth2/consent`, {
			method: "POST",
			headers: {
				cookie: sessionCookies,
				"content-type": "application/json",
				origin: authBaseUrl,
			},
			body: JSON.stringify({ accept: true, oauth_query: oauthQuery }),
		});
		const consentBody = (await consentRes.json()) as {
			redirect?: boolean;
			url?: string;
		};
		const codeUrl = consentBody.url ?? "";
		const code = new URL(codeUrl).searchParams.get("code");
		assert.ok(code, `consent should return authorization code: ${codeUrl}`);

		// 8. Exchange the code for tokens.
		const tokenRes = await fetch(`${authBaseUrl}/api/auth/oauth2/token`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: clientMetadataUrl,
				code_verifier: PKCE_VERIFIER,
			}).toString(),
		});
		assert.equal(tokenRes.status, 200, "token exchange should succeed");
		const tokens = (await tokenRes.json()) as Record<string, unknown>;
		assert.equal(typeof tokens.access_token, "string");
		assert.equal(typeof tokens.refresh_token, "string");
		assert.equal(typeof tokens.id_token, "string");
		assert.equal(tokens.token_type, "Bearer");

		// 9. Call userinfo with the CIMD-issued access token.
		const userinfoRes = await fetch(`${authBaseUrl}/api/auth/oauth2/userinfo`, {
			headers: { authorization: `Bearer ${tokens.access_token as string}` },
		});
		assert.equal(userinfoRes.status, 200, "userinfo should succeed");
		const claims = (await userinfoRes.json()) as Record<string, unknown>;
		assert.equal(typeof claims.sub, "string");
		assert.equal(claims.email, "alice@example.com");
		assert.equal(claims.name, "Alice");

		// 10. Use the refresh_token to mint a new access token.
		const refreshRes = await fetch(`${authBaseUrl}/api/auth/oauth2/token`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: tokens.refresh_token as string,
				client_id: clientMetadataUrl,
			}).toString(),
		});
		assert.equal(refreshRes.status, 200, "refresh grant should succeed");
		const refreshed = (await refreshRes.json()) as Record<string, unknown>;
		assert.equal(typeof refreshed.access_token, "string");
		assert.notEqual(refreshed.access_token, tokens.access_token);
	});

	it("rejects a URL client_id that is blocked by allowFetch before any outbound fetch", async (t) => {
		// Reserve auth port first so baseURL is accurate.
		const placeholder = createServer();
		placeholder.listen(0);
		await once(placeholder, "listening");
		const authPort = (placeholder.address() as AddressInfo).port;
		const authBaseUrl = `http://localhost:${authPort}`;
		placeholder.close();

		const blockedClientUrl = "http://localhost:59999/blocked.json";

		// Stand up a metadata host that would serve a valid document if the
		// server ever reached it — the assertion is that it never does.
		const metadataHost = createServer();
		let fetchCount = 0;
		metadataHost.on("request", (req, res) => {
			fetchCount++;
			res.writeHead(200, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					client_id: blockedClientUrl,
					redirect_uris: ["http://localhost:59999/callback"],
					token_endpoint_auth_method: "none",
				}),
			);
		});
		metadataHost.listen(59999);
		t.after(() => metadataHost.close());
		await once(metadataHost, "listening");

		const auth = betterAuth({
			baseURL: authBaseUrl,
			secret: "smoke-test-secret-that-is-long-enough-for-validation",
			database: new DatabaseSync(":memory:"),
			emailAndPassword: { enabled: true },
			trustedOrigins: [authBaseUrl],
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid", "profile", "email", "offline_access"],
					silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
				}),
				cimd({
					// Block any client_id whose host is `localhost:59999`.
					allowFetch: (url) => new URL(url).host !== "localhost:59999",
				}),
			],
		});

		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();

		const authServer = createServer(toNodeHandler(auth.handler));
		authServer.listen(authPort);
		t.after(() => authServer.close());
		await once(authServer, "listening");

		// Sign up + get a session.
		const signup = await fetch(`${authBaseUrl}/api/auth/sign-up/email`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: authBaseUrl,
			},
			body: JSON.stringify({
				email: "bob@example.com",
				password: "smoke-test-password-1",
				name: "Bob",
			}),
		});
		const sessionCookies = signup.headers.get("set-cookie") ?? "";

		// Authorize attempt against the blocked URL.
		const authorizeRes = await fetch(
			`${authBaseUrl}/api/auth/oauth2/authorize` +
				`?client_id=${encodeURIComponent(blockedClientUrl)}` +
				`&response_type=code` +
				`&redirect_uri=${encodeURIComponent("http://localhost:59999/callback")}` +
				`&scope=openid` +
				`&code_challenge=${PKCE_CHALLENGE}` +
				`&code_challenge_method=S256`,
			{
				method: "GET",
				headers: {
					cookie: sessionCookies,
					origin: authBaseUrl,
					accept: "application/json",
				},
				redirect: "manual",
			},
		);

		assert.ok(
			authorizeRes.status >= 400,
			`authorize should reject blocked URL, got status ${authorizeRes.status}`,
		);
		assert.equal(
			fetchCount,
			0,
			"metadata host should never be fetched when allowFetch rejects",
		);
	});
});
