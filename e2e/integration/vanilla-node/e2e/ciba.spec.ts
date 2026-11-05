import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import type { CibaNotification } from "@better-auth/ciba";
import { CIBA_GRANT_TYPE, ciba } from "@better-auth/ciba";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Runs a CIBA sign-in the way people meet it: an agent asks to act for a
 * person, the person gets a link on their own device, approves on the
 * provider's own pages, and the agent then calls a separate API. The provider,
 * the API, and the agent are separate apps that only talk over HTTP.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
const SECRET = "ciba-e2e-secret-0123456789abcdefghij";
const USER = {
	name: "CIBA User",
	email: "ciba-user@example.com",
	password: "correct-horse-battery",
};
const OTHER_USER = {
	name: "Other User",
	email: "other-user@example.com",
	password: "correct-horse-battery",
};
const API_AUDIENCE = "https://api.example.com";

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

async function listen() {
	let handler: Handler = (_req, res) => {
		res.statusCode = 503;
		res.end();
	};
	const server: Server = createServer((req, res) => handler(req, res));
	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, () => {
			const address = server.address();
			if (address && typeof address === "object") resolve(address.port);
			else reject(new Error("Failed to get server port"));
		});
	});
	return {
		origin: `http://localhost:${port}`,
		setHandler: (next: Handler) => {
			handler = next;
		},
		stop: () =>
			new Promise<void>((resolve, reject) => {
				server.closeAllConnections();
				server.close((err) => (err ? reject(err) : resolve()));
			}),
	};
}

/**
 * The provider's pages, written the way an integrator would: each one calls
 * the documented endpoint and follows the URL it returns.
 */
const PAGES: Record<string, string> = {
	"/login": `
		<h1>Sign in</h1>
		<form id="login">
			<label>Email <input name="email" type="email"></label>
			<label>Password <input name="password" type="password"></label>
			<button>Sign in</button>
		</form>
		<script>
			document.getElementById("login").addEventListener("submit", async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const response = await fetch("/api/auth/sign-in/email", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						email: form.email.value,
						password: form.password.value,
						oauth_query: location.search.slice(1),
					}),
				});
				location.href = (await response.json()).url;
			});
		</script>`,
	"/consent": `
		<h1>Allow <span id="client"></span> to act for you?</h1>
		<p>Only allow this if <span id="client-again"></span> shows <strong id="binding-message"></strong></p>
		<ul id="scopes"></ul>
		<button id="allow">Allow</button>
		<button id="deny">Deny</button>
		<script>
			const params = new URLSearchParams(location.search);
			document.getElementById("binding-message").textContent = params.get("binding_message");
			for (const scope of (params.get("scope") ?? "").split(" ").filter(Boolean)) {
				const item = document.createElement("li");
				item.textContent = scope;
				document.getElementById("scopes").append(item);
			}
			fetch("/api/auth/oauth2/public-client?client_id=" + encodeURIComponent(params.get("client_id")))
				.then((response) => response.json())
				.then((client) => {
					document.getElementById("client").textContent = client.client_name;
					document.getElementById("client-again").textContent = client.client_name;
				});
			const answer = async (accept) => {
				const response = await fetch("/api/auth/oauth2/consent", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ accept, oauth_query: location.search.slice(1) }),
				});
				location.href = (await response.json()).url;
			};
			document.getElementById("allow").addEventListener("click", () => answer(true));
			document.getElementById("deny").addEventListener("click", () => answer(false));
		</script>`,
	"/ciba": `
		<h1>Sign-in request</h1>
		<p id="status" role="status"></p>
		<script>
			const params = new URLSearchParams(location.search);
			const messages = {
				approved: "Approved. You can return to the app that asked.",
				denied: "Request denied.",
			};
			document.getElementById("status").textContent =
				messages[params.get("status")] ?? params.get("error_description");
		</script>`,
};

async function startProvider() {
	const http = await listen();
	const inbox: CibaNotification[] = [];
	const auth = betterAuth({
		database: new DatabaseSync(":memory:"),
		baseURL: http.origin,
		secret: SECRET,
		emailAndPassword: { enabled: true },
		trustedOrigins: [http.origin],
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "api:read"],
				resources: [API_AUDIENCE],
				enforcePerClientResources: false,
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
			ciba({
				resultPage: "/ciba",
				interval: 1,
				sendNotification: (notification) => {
					inbox.push(notification);
				},
			}),
		],
	});
	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();
	const signUp = await auth.api.signUpEmail({ body: USER });
	await auth.api.signUpEmail({ body: OTHER_USER });
	const signIn = await auth.api.signInEmail({
		body: { email: USER.email, password: USER.password },
		returnHeaders: true,
	});
	const agent = await auth.api.adminCreateOAuthClient({
		headers: new Headers({
			cookie: signIn.headers
				.getSetCookie()
				.map((cookie) => cookie.split(";")[0])
				.join("; "),
		}),
		body: {
			client_name: "Support Agent",
			grant_types: [CIBA_GRANT_TYPE],
			scope: "openid api:read",
			metadata: { backchannel_token_delivery_mode: "poll" },
		},
	});

	const authHandler = toNodeHandler(auth);
	http.setHandler((req, res) => {
		if (req.url?.startsWith("/api/auth")) return authHandler(req, res);
		const page = PAGES[new URL(req.url ?? "/", http.origin).pathname];
		if (!page) {
			res.statusCode = 404;
			res.end();
			return;
		}
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end(`<!doctype html><html><body><main>${page}</main></body></html>`);
	});
	return {
		origin: http.origin,
		authBaseURL: `${http.origin}/api/auth`,
		userId: signUp.user.id,
		agent: { id: agent.client_id, secret: agent.client_secret! },
		/** The link the person received for the latest request. */
		latestLink: () => inbox.at(-1)!.url,
		stop: http.stop,
	};
}

type Provider = Awaited<ReturnType<typeof startProvider>>;

/** A resource server that only trusts the provider's JWKS. */
async function startApi(provider: Provider) {
	const http = await listen();
	const jwks = createRemoteJWKSet(new URL(`${provider.authBaseURL}/jwks`));
	http.setHandler(async (req, res) => {
		const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
		try {
			const { payload } = await jwtVerify(token, jwks, {
				issuer: provider.authBaseURL,
				audience: API_AUDIENCE,
			});
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ user: payload.sub }));
		} catch {
			res.statusCode = 401;
			res.end();
		}
	});
	return { origin: http.origin, stop: http.stop };
}

/**
 * The agent: starts a backchannel request for the person by email, then polls
 * the token endpoint as CIBA poll mode says.
 */
async function startAgent(provider: Provider) {
	const form = (body: Record<string, string>) => ({
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			authorization: `Basic ${btoa(`${provider.agent.id}:${provider.agent.secret}`)}`,
		},
		body: new URLSearchParams(body),
	});
	const response = await fetch(
		`${provider.authBaseURL}/oauth2/bc-authorize`,
		form({
			scope: "openid api:read",
			login_hint: USER.email,
			binding_message: "Code 4821",
			resource: API_AUDIENCE,
		}),
	);
	expect(response.status).toBe(200);
	const request = (await response.json()) as {
		auth_req_id: string;
		interval: number;
	};
	const poll = async () => {
		let interval = request.interval;
		for (;;) {
			await new Promise((resolve) => setTimeout(resolve, interval * 1000));
			const token = await fetch(
				`${provider.authBaseURL}/oauth2/token`,
				form({ grant_type: CIBA_GRANT_TYPE, auth_req_id: request.auth_req_id }),
			);
			const body = (await token.json()) as {
				access_token?: string;
				error?: string;
			};
			if (body.error === "authorization_pending") continue;
			if (body.error === "slow_down") {
				interval += 5;
				continue;
			}
			return body;
		}
	};
	return { tokens: poll() };
}

/** Records the provider pages a person sees, ignoring API redirects. */
function trackPages(page: Page) {
	const seen: string[] = [];
	page.on("framenavigated", (frame) => {
		if (frame !== page.mainFrame()) return;
		const { pathname } = new URL(frame.url());
		if (!pathname.startsWith("/api/")) seen.push(pathname);
	});
	return seen;
}

async function signIn(page: Page, user: { email: string; password: string }) {
	await page.waitForURL(/\/login\?/);
	await page.getByLabel("Email").fill(user.email);
	await page.getByLabel("Password").fill(user.password);
	await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("CIBA approval from a link", () => {
	let provider: Provider;
	let api: Awaited<ReturnType<typeof startApi>>;

	test.beforeEach(async () => {
		provider = await startProvider();
		api = await startApi(provider);
	});

	test.afterEach(async () => {
		await api.stop();
		await provider.stop();
	});

	test("lets the person approve an agent that then calls the API as them", async ({
		page,
	}, testInfo) => {
		const agent = await startAgent(provider);
		const pages = trackPages(page);

		// The person taps the link in the notification on their own device.
		await page.goto(provider.latestLink());
		await signIn(page, USER);

		await page.waitForURL(/\/consent\?/);
		await expect(page.getByRole("heading")).toHaveText(
			"Allow Support Agent to act for you?",
		);
		await expect(page.locator("#binding-message")).toHaveText("Code 4821");
		await expect(page.locator("#scopes li")).toHaveText(["openid", "api:read"]);
		await testInfo.attach("consent page", {
			body: await page.screenshot(),
			contentType: "image/png",
		});
		await page.getByRole("button", { name: "Allow" }).click();

		await page.waitForURL(/\/ciba\?.*status=approved/);
		await expect(page.getByRole("status")).toHaveText(
			"Approved. You can return to the app that asked.",
		);
		expect(pages).toEqual(["/login", "/consent", "/ciba"]);

		const tokens = await agent.tokens;
		expect(tokens.access_token).toEqual(expect.any(String));
		const me = await fetch(`${api.origin}/me`, {
			headers: { authorization: `Bearer ${tokens.access_token}` },
		});
		expect(await me.json()).toEqual({ user: provider.userId });
	});

	test("stops the agent when the signed-in person denies", async ({ page }) => {
		const first = await startAgent(provider);
		await page.goto(provider.latestLink());
		await signIn(page, USER);
		await page.getByRole("button", { name: "Allow" }).click();
		await page.waitForURL(/status=approved/);
		await first.tokens;

		// A second request: the session carries over, and consent is asked again.
		const second = await startAgent(provider);
		const pages = trackPages(page);
		await page.goto(provider.latestLink());
		await page.waitForURL(/\/consent\?/);
		await page.getByRole("button", { name: "Deny" }).click();

		await page.waitForURL(/\/ciba\?.*status=denied/);
		await expect(page.getByRole("status")).toHaveText("Request denied.");
		expect(pages).toEqual(["/consent", "/ciba"]);
		expect(await second.tokens).toMatchObject({ error: "access_denied" });
	});

	test("refuses the link to another account, and the right person can still approve", async ({
		browser,
	}) => {
		const agent = await startAgent(provider);
		const link = provider.latestLink();

		const otherDevice = await browser.newPage();
		await otherDevice.goto(link);
		await signIn(otherDevice, OTHER_USER);
		await otherDevice.waitForURL(/\/ciba\?.*error=/);
		await expect(otherDevice.getByRole("status")).toHaveText(
			"This sign-in request is invalid, has expired, or was sent to another account",
		);

		const ownDevice = await browser.newPage();
		await ownDevice.goto(link);
		await signIn(ownDevice, USER);
		await ownDevice.getByRole("button", { name: "Allow" }).click();
		await ownDevice.waitForURL(/status=approved/);
		expect((await agent.tokens).access_token).toEqual(expect.any(String));
	});
});
