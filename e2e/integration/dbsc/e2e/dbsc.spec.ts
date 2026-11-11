import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:https";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dbsc } from "@better-auth/dbsc";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { chromium, expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

/**
 * Drives a real Chrome against a Better Auth server over HTTPS. Chrome only
 * processes Device Bound Session Credentials headers on connections with valid
 * TLS, so the server uses a throwaway certificate that Chrome trusts by its
 * public key hash. Chrome's developer flags turn the feature on with software
 * keys, so the test needs no TPM or Secure Enclave.
 *
 * Set `DBSC_BROWSER_CHANNEL=chrome` to run it against an installed Chrome.
 */
const CHANNEL = process.env.DBSC_BROWSER_CHANNEL ?? "chromium";
const FEATURES = [
	"DeviceBoundSessions:RequireOriginTrialTokens/false/RefreshQuota/false",
	"EnableBoundSessionCredentialsSoftwareKeysForManualTesting",
];
const PASSWORD = "correct-horse-battery-staple";

type LoggedRequest = { path: string; status: number };

let server: Server;
let origin: string;
let browser: Browser;
let certDir: string;
const requests: LoggedRequest[] = [];

function createCertificate() {
	certDir = mkdtempSync(join(tmpdir(), "dbsc-e2e-"));
	const key = join(certDir, "key.pem");
	const cert = join(certDir, "cert.pem");
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			// RSA: LibreSSL, the default on macOS, writes EC certificates that
			// Node's TLS cannot use.
			"rsa:2048",
			"-nodes",
			"-days",
			"1",
			"-subj",
			"/CN=localhost",
			"-addext",
			"subjectAltName=DNS:localhost",
			"-keyout",
			key,
			"-out",
			cert,
		],
		{ stdio: "ignore" },
	);
	const certPem = readFileSync(cert);
	const spkiHash = createHash("sha256")
		.update(
			new X509Certificate(certPem).publicKey.export({
				format: "der",
				type: "spki",
			}),
		)
		.digest("base64");
	return { cert: certPem, key: readFileSync(key), spkiHash };
}

test.beforeAll(async () => {
	const tls = createCertificate();
	server = createServer({ cert: tls.cert, key: tls.key });
	server.listen(0);
	await once(server, "listening");
	origin = `https://localhost:${(server.address() as AddressInfo).port}`;

	const options = {
		baseURL: origin,
		secret: "dbsc-e2e-secret-that-is-long-enough-for-tests",
		database: new DatabaseSync(":memory:"),
		emailAndPassword: { enabled: true },
		logger: { level: "error" as const },
		plugins: [dbsc()],
	};
	await (await getMigrations(options)).runMigrations();
	const auth = betterAuth(options);
	await auth.api.signUpEmail({
		body: { email: "server@example.com", password: PASSWORD, name: "Server" },
	});
	const handler = toNodeHandler(auth);

	server.on("request", async (request, response) => {
		const path = request.url ?? "/";
		response.on("finish", () =>
			requests.push({ path, status: response.statusCode }),
		);
		if (path.startsWith("/api/auth")) return handler(request, response);
		if (path === "/server-sign-in") {
			// A sign-in that runs on the server, like a server action.
			const signedIn = await auth.api.signInEmail({
				body: { email: "server@example.com", password: PASSWORD },
				headers: fromNodeHeaders(request.headers),
				asResponse: true,
			});
			response.setHeader("set-cookie", signedIn.headers.getSetCookie());
		}
		response.setHeader("content-type", "text/html");
		response.end("<!doctype html><title>dbsc</title><p>ok</p>");
	});

	browser = await chromium.launch({
		channel: CHANNEL,
		args: [
			`--enable-features=${FEATURES.join(",")}`,
			`--ignore-certificate-errors-spki-list=${tls.spkiHash}`,
		],
	});
});

test.afterAll(async () => {
	await browser?.close();
	server?.close();
	if (certDir) rmSync(certDir, { recursive: true, force: true });
});

function callAuth(page: Page, path: string, body?: unknown) {
	return page.evaluate(
		async ([url, payload]) => {
			const response = await fetch(url, {
				method: payload ? "POST" : "GET",
				headers: payload ? { "content-type": "application/json" } : {},
				body: payload ? JSON.stringify(payload) : undefined,
			});
			return { status: response.status, body: await response.json() };
		},
		[`/api/auth${path}`, body] as const,
	);
}

async function waitForRequest(path: string, status: number) {
	await expect
		.poll(() => requests.some((r) => r.path === path && r.status === status), {
			timeout: 15_000,
		})
		.toBe(true);
}

async function boundCookie(context: BrowserContext) {
	return (await context.cookies()).find((cookie) =>
		cookie.name.startsWith("__Secure-better-auth.dbsc_"),
	);
}

test.describe("device-bound sessions in Chrome", () => {
	test.beforeEach(() => {
		requests.length = 0;
	});

	test("binds a session, refreshes it with the device key, and refuses a copied cookie", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(origin);

		const signUp = await callAuth(page, "/sign-up/email", {
			email: "user@example.com",
			password: PASSWORD,
			name: "User",
		});
		expect(signUp.status).toBe(200);

		await waitForRequest("/api/auth/dbsc/register", 200);
		const bound = await boundCookie(context);
		expect(bound).toBeDefined();
		expect((await callAuth(page, "/get-session")).body?.user.email).toBe(
			"user@example.com",
		);

		// Without the bound cookie, Chrome holds the request and refreshes first.
		await context.clearCookies({ name: bound!.name });
		const refreshed = await callAuth(page, "/get-session");
		expect(refreshed.body?.user.email).toBe("user@example.com");
		expect(
			requests
				.filter((r) => r.path === "/api/auth/dbsc/refresh")
				.map((r) => r.status),
		).toEqual([200]);
		expect((await boundCookie(context))?.value).not.toBe(bound!.value);

		// Another profile holding only the session cookie gets no session.
		const sessionCookie = (await context.cookies()).find(
			(cookie) => cookie.name === "__Secure-better-auth.session_token",
		)!;
		const thief = await browser.newContext();
		await thief.addCookies([sessionCookie]);
		const thiefPage = await thief.newPage();
		await thiefPage.goto(origin);
		expect((await callAuth(thiefPage, "/get-session")).body).toBeNull();

		// Signing out from there only clears the thief's cookies.
		expect((await callAuth(thiefPage, "/sign-out", {})).status).toBe(200);
		expect((await callAuth(page, "/get-session")).body?.user.email).toBe(
			"user@example.com",
		);
		await thief.close();
		await context.close();
	});

	test("binds a session signed in on the server on the next browser request", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto(`${origin}/server-sign-in`);
		expect(requests.some((r) => r.path === "/api/auth/dbsc/register")).toBe(
			false,
		);

		await callAuth(page, "/get-session");
		await waitForRequest("/api/auth/dbsc/register", 200);
		expect(await boundCookie(context)).toBeDefined();
		await context.close();
	});
});
