import { once } from "node:events";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import type { DbscEvent, DbscOptions } from "@better-auth/dbsc";
import { dbsc } from "@better-auth/dbsc";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { multiSession } from "better-auth/plugins";
import { createCertificate, launch } from "./chrome";

/**
 * Drives `@better-auth/dbsc` with real Chromium: sign in, let the browser
 * register, then force refreshes and a sign-out the way a user would.
 */

// Each session gets its own bound cookie, suffixed from its token hash.
const BOUND_COOKIE = /^__Secure-better-auth\.dbsc_/;
const SESSION_COOKIE = "__Secure-better-auth.session_token";

async function startAuthServer(
	options: DbscOptions = {},
	plugins: BetterAuthPlugin[] = [],
) {
	const { cert, key, spkiHash } = createCertificate();
	const events: DbscEvent[] = [];
	const auth = betterAuth({
		database: new DatabaseSync(":memory:"),
		// Dynamic, so the plugin must work without a fixed origin.
		baseURL: {
			allowedHosts: ["localhost:*"],
			protocol: "https",
			fallback: "https://localhost",
		},
		secret: "dbsc-e2e-secret-that-is-long-enough-for-validation",
		emailAndPassword: { enabled: true },
		logger: { level: "error" },
		plugins: [
			...plugins,
			dbsc({ ...options, onEvent: (event) => void events.push(event) }),
		],
	});
	await (await getMigrations(auth.options)).runMigrations();
	await auth.api.signUpEmail({
		body: {
			name: "DBSC",
			email: "dbsc@example.com",
			password: "password123",
		},
	});

	const authHandler = toNodeHandler(auth);
	const server = createServer({ cert, key }, (request, response) => {
		if (request.url?.startsWith("/api/auth")) {
			return authHandler(request, response);
		}
		// What a server action does: sign in through auth.api and forward only
		// the cookies, so the browser never sees the registration header.
		if (request.url === "/server-login") {
			auth.api
				.signInEmail({
					body: { email: "dbsc@example.com", password: "password123" },
					returnHeaders: true,
				})
				.then(({ headers }) => {
					response.setHeader("set-cookie", headers.getSetCookie());
					response.setHeader("content-type", "text/html");
					response.end("<!doctype html><title>server login</title>");
				});
			return;
		}
		// What a server-rendered app page does: resolve the session itself.
		auth.api
			.getSession({
				headers: new Headers({ cookie: request.headers.cookie ?? "" }),
			})
			.then((session) => {
				response.setHeader("content-type", "text/html");
				response.end(
					`<!doctype html><title>${request.url}</title><p id="who">${session ? "in" : "out"}</p>`,
				);
			});
	});
	server.listen(0);
	await once(server, "listening");
	const { port } = server.address() as AddressInfo;
	return {
		auth,
		events,
		spkiHash,
		origin: `https://localhost:${port}`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

const post = (page: Page, path: string, body?: unknown) =>
	page.evaluate(
		async ([url, payload]) => {
			const response = await fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload ?? {}),
			});
			return response.status;
		},
		[`/api/auth${path}`, body] as const,
	);

const getSession = (page: Page) =>
	page.evaluate(async () => {
		const response = await fetch("/api/auth/get-session");
		return response.json();
	});

test.describe("@better-auth/dbsc in Chromium", () => {
	test("binds a session that was signed in on the server", async () => {
		const server = await startAuthServer();
		const browser = await launch(server.spkiHash);
		const page = await (await browser.newContext()).newPage();
		const types = () => server.events.map((event) => event.type);

		try {
			await page.goto(`${server.origin}/server-login`);
			expect(types()).not.toContain("registered");
			// The browser's next request to the auth server carries the offer.
			expect(await getSession(page)).not.toBeNull();
			await expect.poll(types, { timeout: 15_000 }).toContain("registered");
		} finally {
			await browser.close();
			await server.close();
		}
	});

	test("enforce: two sessions in one browser both stay bound", async () => {
		test.setTimeout(60_000);
		const server = await startAuthServer({ enforce: true }, [multiSession()]);
		const browser = await launch(server.spkiHash);
		const context = await browser.newContext();
		const page = await context.newPage();
		const count = (type: string) =>
			server.events.filter((event) => event.type === type).length;
		const listSessions = () =>
			page.evaluate(async () => {
				const response = await fetch(
					"/api/auth/multi-session/list-device-sessions",
				);
				return (await response.json()).length;
			});

		try {
			await page.goto(`${server.origin}/`);
			await post(page, "/sign-in/email", {
				email: "dbsc@example.com",
				password: "password123",
			});
			await expect.poll(() => count("registered"), { timeout: 15_000 }).toBe(1);
			await post(page, "/sign-up/email", {
				name: "Second",
				email: "second@example.com",
				password: "password123",
			});
			await expect.poll(() => count("registered"), { timeout: 15_000 }).toBe(2);

			// Both bound cookies gone, past the registration grace: Chrome has
			// to refresh two DBSC sessions for one request.
			await page.waitForTimeout(10_500);
			await context.clearCookies({ name: BOUND_COOKIE });
			await page.goto(`${server.origin}/home`);
			await expect.poll(() => count("refreshed"), { timeout: 15_000 }).toBe(2);
			expect(await page.textContent("#who")).toBe("in");
			expect(await listSessions()).toBe(2);
		} finally {
			await browser.close();
			await server.close();
		}
	});

	test("enforce: the bound browser stays signed in, a copied cookie does not", async () => {
		test.setTimeout(60_000);
		const server = await startAuthServer({ enforce: true });
		const browser = await launch(server.spkiHash);
		const context = await browser.newContext();
		const page = await context.newPage();
		const types = () => server.events.map((event) => event.type);

		try {
			await page.goto(`${server.origin}/`);
			await post(page, "/sign-in/email", {
				email: "dbsc@example.com",
				password: "password123",
			});
			// Requests racing the registration must not look signed out.
			expect(await getSession(page)).not.toBeNull();
			await expect.poll(types, { timeout: 15_000 }).toContain("registered");

			// The thief gets the long-lived cookie but cannot sign.
			const stolen = (await context.cookies()).filter(
				({ name }) => name === SESSION_COOKIE,
			);
			const thief = await browser.newContext();
			await thief.addCookies(stolen);
			const thiefPage = await thief.newPage();
			await thiefPage.goto(`${server.origin}/`);
			// Past the grace for requests in flight at registration.
			await page.waitForTimeout(10_500);
			expect(await getSession(thiefPage)).toBeNull();
			expect(types()).toContain("blocked");

			// The real browser lost its bound cookie: Chrome refreshes first.
			await context.clearCookies({ name: BOUND_COOKIE });
			await page.goto(`${server.origin}/home`);
			expect(await page.textContent("#who")).toBe("in");
			expect(await getSession(page)).not.toBeNull();

			// Arriving from another site with the bound cookie gone: Chrome
			// refreshes first because the session allows any refresh initiator,
			// and that refresh carries no Lax session cookie.
			const crossSite = server.origin.replace("localhost", "127.0.0.1");
			await page.goto(`${crossSite}/api/auth/ok`).catch(() => undefined);
			await context.clearCookies({ name: BOUND_COOKIE });
			await page.evaluate((url) => {
				location.href = url;
			}, `${server.origin}/landing`);
			await expect(page.locator("#who")).toHaveText("in");
		} finally {
			await browser.close();
			await server.close();
		}
	});

	test("binds, refreshes and ends with the auth session", async () => {
		const server = await startAuthServer();
		const browser = await launch(server.spkiHash);
		const context = await browser.newContext();
		const page = await context.newPage();
		const types = () => server.events.map((event) => event.type);

		try {
			await page.goto(`${server.origin}/`);
			expect(
				await post(page, "/sign-in/email", {
					email: "dbsc@example.com",
					password: "password123",
				}),
			).toBe(200);
			await expect.poll(types, { timeout: 15_000 }).toContain("registered");

			// The registration response handed out a challenge, so the first
			// refresh needs no 403.
			await context.clearCookies({ name: BOUND_COOKIE });
			await page.goto(`${server.origin}/protected`);
			await expect.poll(types, { timeout: 15_000 }).toContain("refreshed");

			const headers = new Headers({
				cookie: (await context.cookies())
					.filter(
						({ name }) => name === SESSION_COOKIE || BOUND_COOKIE.test(name),
					)
					.map(({ name, value }) => `${name}=${value}`)
					.join("; "),
			});
			expect(await server.auth.api.getDbscState({ headers })).toEqual({
				status: "bound",
			});

			expect(await post(page, "/sign-out")).toBe(200);
			await context.clearCookies({ name: BOUND_COOKIE });
			await page.goto(`${server.origin}/after`);
			await expect.poll(types, { timeout: 15_000 }).toContain("ended");
			expect(types()).not.toContain("rejected");
		} finally {
			await browser.close();
			await server.close();
		}
	});
});
