import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { decodeJwt } from "jose";

/**
 * Front-channel logout depends on what the browser does with cookies inside
 * cross-origin iframes, so these tests run the provider and each relying party
 * as separate Better Auth servers with their own databases and cookies. A site
 * ignores the port, so apps on `localhost` are same-site with each other and an
 * app on `127.0.0.1` is on a different site. Each app uses its own cookie
 * prefix because cookies on one host are shared across ports.
 *
 * @see https://openid.net/specs/openid-connect-frontchannel-1_0.html
 */
const SECRET = "frontchannel-logout-e2e-secret-0123456789";
const USER = {
	name: "Test User",
	email: "test@test.com",
	password: "password123",
};
const SCOPES = ["openid", "profile", "email"];

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

async function listen(): Promise<{
	port: number;
	setHandler: (handler: Handler) => void;
	stop: () => Promise<void>;
}> {
	let handler: Handler = (_req, res) => {
		res.statusCode = 503;
		res.end();
	};
	const server: Server = createServer((req, res) => handler(req, res));
	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		// Dual-stack, so both `localhost` (often ::1) and 127.0.0.1 connect.
		server.listen(0, () => {
			const address = server.address();
			if (address && typeof address === "object") resolve(address.port);
			else reject(new Error("Failed to get server port"));
		});
	});
	return {
		port,
		setHandler: (next) => {
			handler = next;
		},
		stop: () =>
			new Promise<void>((resolve, reject) => {
				server.closeAllConnections();
				server.close((err) => (err ? reject(err) : resolve()));
			}),
	};
}

function html(res: ServerResponse, body: string) {
	res.setHeader("content-type", "text/html; charset=utf-8");
	res.end(`<!doctype html><html><body>${body}</body></html>`);
}

async function startProvider() {
	const http = await listen();
	const origin = `http://localhost:${http.port}`;
	const auth = betterAuth({
		database: new DatabaseSync(":memory:"),
		baseURL: origin,
		secret: SECRET,
		emailAndPassword: { enabled: true },
		trustedOrigins: [origin],
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: SCOPES,
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
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
	const adminHeaders = new Headers({
		cookie: signIn.headers
			.getSetCookie()
			.map((cookie) => cookie.split(";")[0])
			.join("; "),
	});

	const authHandler = toNodeHandler(auth);
	http.setHandler((req, res) => {
		if (req.url?.startsWith("/api/auth")) return authHandler(req, res);
		html(res, "provider");
	});

	return {
		auth,
		origin,
		/** Loopback `http` redirect URIs are accepted for native clients. */
		async registerClient(rpOrigin: string) {
			const created = await auth.api.adminCreateOAuthClient({
				headers: adminHeaders,
				body: {
					application_type: "native",
					redirect_uris: [`${rpOrigin}/api/auth/callback/provider`],
					post_logout_redirect_uris: [`${rpOrigin}/signed-out`],
					frontchannel_logout_uri: `${rpOrigin}/logout/frontchannel`,
					token_endpoint_auth_method: "client_secret_post",
					skip_consent: true,
					enable_end_session: true,
				},
			});
			return {
				clientId: created.client_id,
				clientSecret: created.client_secret!,
			};
		},
		stop: http.stop,
	};
}

type Provider = Awaited<ReturnType<typeof startProvider>>;

interface FrontchannelRequest {
	iss: string | null;
	sid: string | null;
	/** Whether the RP session cookie reached the RP inside the iframe. */
	hadSession: boolean;
	loggedOut: boolean;
}

/**
 * A relying party that signs in through the provider with `genericOAuth` and
 * logs out with core `/sign-out`, which returns the provider's end-session URL.
 * Its `/logout/frontchannel` route is a minimal Front-Channel Logout receiver:
 * it ends the local session only when `iss` and `sid` match the stored ID
 * Token.
 */
async function startRelyingParty(
	provider: Provider,
	name: string,
	options: {
		host?: "localhost" | "127.0.0.1";
		hangOnFrontchannel?: boolean;
	} = {},
) {
	const http = await listen();
	const origin = `http://${options.host ?? "localhost"}:${http.port}`;
	const { clientId, clientSecret } = await provider.registerClient(origin);
	const auth = betterAuth({
		database: new DatabaseSync(":memory:"),
		baseURL: origin,
		secret: SECRET,
		trustedOrigins: [origin],
		advanced: { cookiePrefix: name },
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: "provider",
						clientId,
						clientSecret,
						discoveryUrl: `${provider.origin}/api/auth/.well-known/openid-configuration`,
						authentication: "post",
						scopes: SCOPES,
						pkce: true,
					},
				],
			}),
		],
	});
	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();

	const frontchannelRequests: FrontchannelRequest[] = [];
	const authHandler = toNodeHandler(auth);
	http.setHandler(async (req, res) => {
		const url = new URL(req.url ?? "/", origin);
		if (url.pathname.startsWith("/api/auth")) return authHandler(req, res);
		if (url.pathname === "/signed-out") return html(res, "signed out");
		if (url.pathname !== "/logout/frontchannel") return html(res, name);

		const iss = url.searchParams.get("iss");
		const sid = url.searchParams.get("sid");
		const headers = fromNodeHeaders(req.headers);
		const session = await auth.api.getSession({ headers });
		const request: FrontchannelRequest = {
			iss,
			sid,
			hadSession: Boolean(session),
			loggedOut: false,
		};
		frontchannelRequests.push(request);
		if (options.hangOnFrontchannel) return;

		if (session) {
			const ctx = await auth.$context;
			const account = (
				await ctx.internalAdapter.findAccounts(session.user.id)
			).find((candidate) => candidate.providerId === "provider");
			const claims = account?.idToken ? decodeJwt(account.idToken) : null;
			if (claims && claims.iss === iss && claims.sid === sid) {
				const signOut = await auth.api.signOut({
					headers,
					body: { disableRedirect: true },
					asResponse: true,
				});
				for (const cookie of signOut.headers.getSetCookie()) {
					res.appendHeader("set-cookie", cookie);
				}
				request.loggedOut = true;
			}
		}
		res.setHeader("cache-control", "no-store");
		res.end();
	});

	return {
		origin,
		frontchannelRequests,
		async activeSessions() {
			const ctx = await auth.$context;
			return ctx.adapter.count({ model: "session" });
		},
		stop: http.stop,
	};
}

type RelyingParty = Awaited<ReturnType<typeof startRelyingParty>>;

async function postJson<T>(page: Page, path: string, body: unknown) {
	return page.evaluate(
		async ({ path, body }) => {
			const response = await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			const text = await response.text();
			if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
			return JSON.parse(text) as T;
		},
		{ path, body },
	);
}

async function signInToProvider(page: Page, provider: Provider) {
	await page.goto(`${provider.origin}/`);
	await postJson(page, "/api/auth/sign-in/email", {
		email: USER.email,
		password: USER.password,
	});
}

async function signInToRelyingParty(page: Page, rp: RelyingParty) {
	await page.goto(`${rp.origin}/`);
	const { url } = await postJson<{ url: string }>(
		page,
		"/api/auth/sign-in/social",
		{ provider: "provider", callbackURL: "/" },
	);
	await page.goto(url);
	await page.waitForURL(`${rp.origin}/`);
	expect(await rp.activeSessions()).toBe(1);
}

/** Signs out of the RP and returns the provider end-session URL it hands back. */
async function signOutOfRelyingParty(page: Page, rp: RelyingParty) {
	await page.goto(`${rp.origin}/`);
	const { url } = await postJson<{ url: string }>(page, "/api/auth/sign-out", {
		callbackURL: "/signed-out",
		disableRedirect: true,
	});
	expect(url).toContain("/oauth2/end-session");
	return url;
}

/** The session the browser holds at `origin`, as that app reports it. */
async function browserSession(page: Page, origin: string) {
	await page.goto(`${origin}/`);
	return page.evaluate(() =>
		fetch("/api/auth/get-session").then((response) => response.json()),
	);
}

function collectCspViolations(page: Page) {
	const violations: string[] = [];
	page.on("console", (message) => {
		const text = message.text();
		// Firefox's own favicon loader is blocked by `default-src 'none'`.
		if (/content[- ]security[- ]policy/i.test(text) && !/favicon/i.test(text)) {
			violations.push(text);
		}
	});
	return violations;
}

test.describe("front-channel logout across separate apps", () => {
	const servers: Array<{ stop: () => Promise<void> }> = [];
	test.afterEach(async () => {
		await Promise.all(servers.splice(0).map((server) => server.stop()));
	});

	async function start<T extends { stop: () => Promise<void> }>(server: T) {
		servers.push(server);
		return server;
	}

	test("logs out same-site apps through the browser, but not an app on another site", async ({
		page,
	}) => {
		const provider = await start(await startProvider());
		const appA = await start(await startRelyingParty(provider, "app-a"));
		const appB = await start(await startRelyingParty(provider, "app-b"));
		const otherSite = await start(
			await startRelyingParty(provider, "other-site", { host: "127.0.0.1" }),
		);
		const cspViolations = collectCspViolations(page);

		await signInToProvider(page, provider);
		for (const rp of [appA, appB, otherSite]) {
			await signInToRelyingParty(page, rp);
		}

		const endSessionUrl = await signOutOfRelyingParty(page, appA);
		await page.goto(endSessionUrl);
		await page.waitForURL(`${appA.origin}/signed-out`);

		expect(cspViolations).toEqual([]);
		expect(await browserSession(page, provider.origin)).toBeNull();

		// App B shares the provider's site, so its cookie reached the iframe.
		expect(appB.frontchannelRequests).toEqual([
			expect.objectContaining({ hadSession: true, loggedOut: true }),
		]);
		expect(appB.frontchannelRequests[0]!.iss).toBe(
			`${provider.origin}/api/auth`,
		);
		expect(await appB.activeSessions()).toBe(0);

		// The other site received the request, but its SameSite=Lax cookie was
		// not sent to a cross-site iframe, so it stays signed in. Back-channel
		// logout is the documented option for this case.
		expect(otherSite.frontchannelRequests).toEqual([
			expect.objectContaining({ hadSession: false, loggedOut: false }),
		]);
		expect(await otherSite.activeSessions()).toBe(1);
	});

	test("notifies apps after the user confirms logout at the provider", async ({
		page,
	}) => {
		const provider = await start(await startProvider());
		const app = await start(await startRelyingParty(provider, "app-a"));

		await signInToProvider(page, provider);
		await signInToRelyingParty(page, app);

		await page.goto(`${provider.origin}/api/auth/oauth2/end-session`);
		await page.getByRole("button", { name: "Confirm logout" }).click();
		await expect(
			page.locator('[data-oidc-logout-state="logged-out"]'),
		).toHaveText("Logged out.");

		expect(app.frontchannelRequests).toEqual([
			expect.objectContaining({ hadSession: true, loggedOut: true }),
		]);
		expect(await app.activeSessions()).toBe(0);
		expect(await browserSession(page, provider.origin)).toBeNull();
	});

	test("still notifies apps and redirects with JavaScript disabled", async ({
		browser,
		page,
	}) => {
		const provider = await start(await startProvider());
		const appA = await start(await startRelyingParty(provider, "app-a"));
		const appB = await start(await startRelyingParty(provider, "app-b"));

		await signInToProvider(page, provider);
		await signInToRelyingParty(page, appA);
		await signInToRelyingParty(page, appB);
		const endSessionUrl = await signOutOfRelyingParty(page, appA);

		const noScript = await browser.newContext({
			javaScriptEnabled: false,
			storageState: await page.context().storageState(),
		});
		try {
			const noScriptPage = await noScript.newPage();
			await noScriptPage.goto(endSessionUrl);
			// The meta refresh inside <noscript> performs the redirect.
			await noScriptPage.waitForURL(`${appA.origin}/signed-out`);
		} finally {
			await noScript.close();
		}

		expect(appB.frontchannelRequests).toEqual([
			expect.objectContaining({ hadSession: true, loggedOut: true }),
		]);
		expect(await appB.activeSessions()).toBe(0);
	});

	test("redirects after the timeout when an app never responds", async ({
		page,
	}) => {
		const provider = await start(await startProvider());
		const appA = await start(await startRelyingParty(provider, "app-a"));
		const hungApp = await start(
			await startRelyingParty(provider, "app-b", {
				hangOnFrontchannel: true,
			}),
		);

		await signInToProvider(page, provider);
		await signInToRelyingParty(page, appA);
		await signInToRelyingParty(page, hungApp);
		const endSessionUrl = await signOutOfRelyingParty(page, appA);

		await page.goto(endSessionUrl);
		await page.waitForURL(`${appA.origin}/signed-out`, { timeout: 10_000 });
		expect(hungApp.frontchannelRequests).toHaveLength(1);
	});
});
