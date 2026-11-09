import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
	DEVICE_CODE_GRANT_TYPE,
	oauthDeviceAuthorization,
	oauthProvider,
} from "@better-auth/oauth-provider";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { jwt, organization } from "better-auth/plugins";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Runs an OAuth device approval the way people meet it: a device shows a code,
 * a person approves it in a browser on the provider's own pages, and the device
 * then calls a separate API. The provider, the API, and the device client are
 * separate apps that only talk over HTTP.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628
 */
const SECRET = "device-approval-e2e-secret-0123456789";
const USER = {
	name: "Device User",
	email: "device-user@example.com",
	password: "correct-horse-battery",
};
const API_AUDIENCE = "https://api.example.com";
const ORGANIZATION_CLAIM = "https://example.com/organization";

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
	"/device": `
		<h1>Connect a device</h1>
		<p id="status" role="status"></p>
		<form id="code-form">
			<label>Code shown on your device <input name="user_code" autocomplete="off"></label>
			<button>Continue</button>
		</form>
		<script>
			const params = new URLSearchParams(location.search);
			const form = document.getElementById("code-form");
			const messages = {
				approved: "Device connected. You can return to your device.",
				denied: "Device request denied.",
			};
			const continueURL = (code) =>
				"/api/auth/oauth2/authorize?user_code=" + encodeURIComponent(code);
			if (params.has("user_code") && !params.has("status") && !params.has("error")) {
				location.replace(continueURL(params.get("user_code")));
			}
			form.user_code.value = params.get("user_code") ?? "";
			if (messages[params.get("status")]) {
				document.getElementById("status").textContent = messages[params.get("status")];
				form.hidden = true;
			} else if (params.has("error")) {
				document.getElementById("status").textContent = params.get("error_description");
			}
			form.addEventListener("submit", (event) => {
				event.preventDefault();
				location.href = continueURL(form.user_code.value);
			});
		</script>`,
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
	"/select-organization": `
		<h1>Choose an organization</h1>
		<ul id="organizations"></ul>
		<script>
			(async () => {
				const organizations = await (await fetch("/api/auth/organization/list")).json();
				for (const organization of organizations) {
					const button = document.createElement("button");
					button.textContent = organization.name;
					button.addEventListener("click", async () => {
						await fetch("/api/auth/organization/set-active", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ organizationId: organization.id }),
						});
						const response = await fetch("/api/auth/oauth2/continue", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ postLogin: true, oauth_query: location.search.slice(1) }),
						});
						location.href = (await response.json()).url;
					});
					const item = document.createElement("li");
					item.append(button);
					document.getElementById("organizations").append(item);
				}
			})();
		</script>`,
	"/consent": `
		<h1>Allow <span id="client"></span> to access <span id="organization"></span>?</h1>
		<p>Only allow this if the code on your device is <strong id="user-code"></strong></p>
		<ul id="scopes"></ul>
		<button id="allow">Allow</button>
		<button id="deny">Deny</button>
		<script>
			const params = new URLSearchParams(location.search);
			document.getElementById("user-code").textContent = params.get("user_code");
			for (const scope of (params.get("scope") ?? "").split(" ").filter(Boolean)) {
				const item = document.createElement("li");
				item.textContent = scope;
				document.getElementById("scopes").append(item);
			}
			fetch("/api/auth/oauth2/public-client?client_id=" + encodeURIComponent(params.get("client_id")))
				.then((response) => response.json())
				.then((client) => {
					document.getElementById("client").textContent = client.client_name;
				});
			fetch("/api/auth/organization/get-full-organization")
				.then((response) => response.json())
				.then((organization) => {
					document.getElementById("organization").textContent = organization.name;
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
};

async function startProvider() {
	const http = await listen();
	const auth = betterAuth({
		database: new DatabaseSync(":memory:"),
		baseURL: http.origin,
		secret: SECRET,
		emailAndPassword: { enabled: true },
		trustedOrigins: [http.origin],
		plugins: [
			jwt(),
			organization(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "api:read"],
				resources: [API_AUDIENCE],
				enforcePerClientResources: false,
				postLogin: {
					page: "/select-organization",
					shouldRedirect: ({ session }) => !session.activeOrganizationId,
					consentReferenceId: ({ session }) => {
						const organizationId = session.activeOrganizationId as
							| string
							| undefined;
						if (!organizationId) {
							throw new APIError("BAD_REQUEST", {
								error: "set_organization",
								error_description: "Select an organization",
							});
						}
						return organizationId;
					},
				},
				customAccessTokenClaims: ({ referenceId }) => ({
					[ORGANIZATION_CLAIM]: referenceId,
				}),
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
			oauthDeviceAuthorization({ interval: "1s" }),
		],
	});
	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();
	await auth.api.signUpEmail({ body: USER });
	const signIn = await auth.api.signInEmail({
		body: { email: USER.email, password: USER.password },
		returnHeaders: true,
	});
	const headers = new Headers({
		cookie: signIn.headers
			.getSetCookie()
			.map((cookie) => cookie.split(";")[0])
			.join("; "),
	});
	const acme = await auth.api.createOrganization({
		headers,
		body: { name: "Acme", slug: "acme" },
	});
	const research = await auth.api.createOrganization({
		headers,
		body: { name: "Research", slug: "research" },
	});
	const cli = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			client_name: "Acme CLI",
			token_endpoint_auth_method: "none",
			application_type: "native",
			grant_types: [DEVICE_CODE_GRANT_TYPE],
			scope: "openid api:read",
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
		userId: signIn.response.user.id,
		organizations: { acme: acme!.id, research: research!.id },
		clientId: cli.client_id,
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
			res.end(
				JSON.stringify({
					user: payload.sub,
					organization: payload[ORGANIZATION_CLAIM],
				}),
			);
		} catch {
			res.statusCode = 401;
			res.end();
		}
	});
	return { origin: http.origin, stop: http.stop };
}

/** The device: requests a code, then polls the token endpoint as RFC 8628 says. */
async function startDevice(provider: Provider) {
	const form = (body: Record<string, string>) => ({
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body),
	});
	const response = await fetch(
		`${provider.authBaseURL}/device/code`,
		form({
			client_id: provider.clientId,
			scope: "openid api:read",
			resource: API_AUDIENCE,
		}),
	);
	const authorization = (await response.json()) as {
		device_code: string;
		user_code: string;
		verification_uri_complete: string;
		interval: number;
	};
	const poll = async () => {
		let interval = authorization.interval;
		for (;;) {
			await new Promise((resolve) => setTimeout(resolve, interval * 1000));
			const token = await fetch(
				`${provider.authBaseURL}/oauth2/token`,
				form({
					grant_type: DEVICE_CODE_GRANT_TYPE,
					device_code: authorization.device_code,
					client_id: provider.clientId,
				}),
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
	return { ...authorization, tokens: poll() };
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

test.describe("OAuth device approval in the browser", () => {
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

	test("connects a device for the organization the person picks", async ({
		page,
	}, testInfo) => {
		const device = await startDevice(provider);
		const pages = trackPages(page);

		// The person scans the device's QR code: the code is in the link, so the
		// verification page continues without asking them to type or confirm it.
		await page.goto(device.verification_uri_complete);

		await page.waitForURL(/\/login\?/);
		await page.getByLabel("Email").fill(USER.email);
		await page.getByLabel("Password").fill(USER.password);
		await page.getByRole("button", { name: "Sign in" }).click();

		await page.waitForURL(/\/select-organization\?/);
		await page.getByRole("button", { name: "Research" }).click();

		await page.waitForURL(/\/consent\?/);
		await expect(page.getByRole("heading")).toHaveText(
			"Allow Acme CLI to access Research?",
		);
		await expect(page.locator("#user-code")).toHaveText(device.user_code);
		await expect(page.locator("#scopes li")).toHaveText(["openid", "api:read"]);
		await testInfo.attach("consent page", {
			body: await page.screenshot(),
			contentType: "image/png",
		});
		await page.getByRole("button", { name: "Allow" }).click();

		await page.waitForURL(/\/device\?.*status=approved/);
		await expect(page.getByRole("status")).toHaveText(
			"Device connected. You can return to your device.",
		);
		expect(pages).toEqual([
			"/device",
			"/login",
			"/select-organization",
			"/consent",
			"/device",
		]);

		const tokens = await device.tokens;
		expect(tokens.access_token).toEqual(expect.any(String));
		const me = await fetch(`${api.origin}/me`, {
			headers: { authorization: `Bearer ${tokens.access_token}` },
		});
		expect(await me.json()).toEqual({
			user: provider.userId,
			organization: provider.organizations.research,
		});
	});

	test("brings a mistyped code back to the device page so the person can fix it", async ({
		page,
	}) => {
		const device = await startDevice(provider);
		await page.goto(`${provider.origin}/device`);
		await page.getByLabel("Code shown on your device").fill("WRONGCODE");
		await page.getByRole("button", { name: "Continue" }).click();

		// Signing in comes first, so a signed-out visitor learns nothing about codes.
		await page.waitForURL(/\/login\?/);
		await page.getByLabel("Email").fill(USER.email);
		await page.getByLabel("Password").fill(USER.password);
		await page.getByRole("button", { name: "Sign in" }).click();

		await page.waitForURL(/\/device\?.*error=/);
		await expect(page.getByRole("status")).toHaveText("Invalid user code");
		await expect(page.getByLabel("Code shown on your device")).toHaveValue(
			"WRONGCODE",
		);

		await page.getByLabel("Code shown on your device").fill(device.user_code);
		await page.getByRole("button", { name: "Continue" }).click();
		await page.getByRole("button", { name: "Acme" }).click();
		await page.getByRole("button", { name: "Allow" }).click();
		await page.waitForURL(/status=approved/);
		expect((await device.tokens).access_token).toEqual(expect.any(String));
	});

	test("goes straight to consent for a signed-in person and stops the device on deny", async ({
		page,
	}) => {
		const first = await startDevice(provider);
		await page.goto(first.verification_uri_complete);
		await page.getByLabel("Email").fill(USER.email);
		await page.getByLabel("Password").fill(USER.password);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.getByRole("button", { name: "Acme" }).click();
		await page.getByRole("button", { name: "Allow" }).click();
		await page.waitForURL(/status=approved/);
		await first.tokens;

		// A second device: the session and organization carry over, and the
		// device still needs explicit consent.
		const second = await startDevice(provider);
		const pages = trackPages(page);
		await page.goto(second.verification_uri_complete);
		await page.waitForURL(/\/consent\?/);
		await expect(page.getByRole("heading")).toHaveText(
			"Allow Acme CLI to access Acme?",
		);
		await expect(page.locator("#user-code")).toHaveText(second.user_code);
		await page.getByRole("button", { name: "Deny" }).click();

		await page.waitForURL(/\/device\?.*status=denied/);
		await expect(page.getByRole("status")).toHaveText("Device request denied.");
		expect(pages).toEqual(["/device", "/consent", "/device"]);
		expect(await second.tokens).toMatchObject({ error: "access_denied" });
	});
});
