import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { terminate } from "@better-auth-test/test-utils/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));

const servers = {
	dev: { build: false, command: ["run", "dev"] },
	// `--host` keeps the URL on `localhost`, which `allowedHosts` accepts.
	start: { build: true, command: ["run", "start", "--host", "localhost"] },
} as const;

async function signUp(
	page: Page,
	baseURL: string,
	name: string,
	email: string,
) {
	await page.goto(baseURL);
	await page.getByLabel("Name").fill(name);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill("password123");
	const [response] = await Promise.all([
		page.waitForResponse(
			(response) =>
				new URL(response.url()).origin === new URL(baseURL).origin &&
				response.request().method() === "POST",
		),
		page.getByRole("button", { name: "Sign up" }).click(),
	]);
	expect(response.ok()).toBe(true);
}

async function getCookie(page: Page, name: string) {
	const cookies = await page.context().cookies();
	return cookies.find((cookie) => cookie.name === name);
}

for (const [mode, server] of Object.entries(servers)) {
	/**
	 * @see https://waku.gg/guides/request-context
	 */
	test.describe(`waku ${mode}`, () => {
		// Share a server while keeping failures and retries independent.
		test.describe.configure({ mode: "default" });

		const children: ChildProcessWithoutNullStreams[] = [];
		let baseURL: string;
		let output = "";

		// Build and server share one log, so a report shows both.
		function spawnScript(args: readonly string[]) {
			const child = spawn("pnpm", args, {
				detached: process.platform !== "win32",
				cwd: root,
				stdio: "pipe",
				env: { ...process.env, NO_COLOR: "1" },
			});
			children.push(child);
			child.stderr.setEncoding("utf8").on("data", (data) => (output += data));
			const lines = createInterface({ input: child.stdout });
			lines.on("line", (line) => (output += `${line}\n`));
			return { child, lines };
		}

		test.beforeAll(async () => {
			test.setTimeout(120_000);
			// Static renders run during the build, outside any request.
			if (server.build) {
				const { child } = spawnScript(["run", "build"]);
				const [code] = await once(child, "close");
				if (code !== 0) {
					throw new Error(`waku build exited with code ${code}\n${output}`);
				}
			}
			const { child, lines } = spawnScript(server.command);
			baseURL = await new Promise<string>((resolve, reject) => {
				lines.on("line", (line) => {
					const match = line.match(/http:\/\/localhost:\d+/);
					if (match) resolve(match[0]);
				});
				child.once("error", reject);
				child.once("close", (code) =>
					reject(new Error(`waku ${mode} exited with code ${code}\n${output}`)),
				);
			});
		});

		// Runs even when `beforeAll` times out, unlike `afterEach`.
		test.afterAll(async ({}, testInfo) => {
			await Promise.all(children.map(terminate));
			await testInfo.attach(`waku-${mode}.log`, {
				body: output,
				contentType: "text/plain",
			});
		});

		test("forwards session cookies set inside a server action", async ({
			page,
		}) => {
			await signUp(page, baseURL, "Action User", "action@example.com");

			const sessionToken = await getCookie(page, "better-auth.session_token");
			const sessionData = await getCookie(page, "better-auth.session_data");
			expect(sessionToken).toBeDefined();
			expect(sessionData).toBeDefined();
			// A merged Set-Cookie header can overwrite the session token's Max-Age.
			expect((sessionToken?.expires ?? 0) * 1000).toBeGreaterThan(
				Date.now() + 24 * 60 * 60 * 1000,
			);

			await page.goto(baseURL);
			await expect(page.getByText("Signed in as Action User")).toBeVisible();
		});

		test("clears session cookies on API sign-out when the cookie cache is missing", async ({
			page,
		}) => {
			await signUp(page, baseURL, "Sign Out User", "signout@example.com");
			await page.goto(baseURL);
			await expect(page.getByText("Signed in as Sign Out User")).toBeVisible();
			expect(await getCookie(page, "better-auth.session_token")).toBeDefined();
			expect(await getCookie(page, "better-auth.session_data")).toBeDefined();

			await page.context().clearCookies({ name: "better-auth.session_data" });
			const response = await page.evaluate(async () => {
				const response = await fetch("/api/auth/sign-out", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: "{}",
				});
				const body: unknown = await response.json();
				return { status: response.status, body };
			});
			expect(response).toMatchObject({ status: 200, body: { success: true } });
			expect(
				await getCookie(page, "better-auth.session_token"),
			).toBeUndefined();
			expect(await getCookie(page, "better-auth.session_data")).toBeUndefined();

			const session = await page.request.get(`${baseURL}/api/auth/get-session`);
			expect(session.ok()).toBe(true);
			expect(await session.json()).toBeNull();
			await page.goto(baseURL);
			await expect(page.getByText("Signed out", { exact: true })).toBeVisible();
		});

		test("reissues a missing cookie cache during client-side navigation", async ({
			page,
		}) => {
			await signUp(page, baseURL, "RSC User", "rsc@example.com");
			await page.goto(baseURL);
			await expect(page.getByText("Signed in as RSC User")).toBeVisible();

			await page.context().clearCookies({ name: "better-auth.session_data" });
			expect(await getCookie(page, "better-auth.session_data")).toBeUndefined();
			const documentTimeOrigin = await page.evaluate(
				() => performance.timeOrigin,
			);

			const [response] = await Promise.all([
				page.waitForResponse(
					(response) =>
						new URL(response.url()).pathname === "/RSC/R/dashboard.txt" &&
						response.request().method() === "GET",
				),
				page.getByRole("link", { name: "Dashboard" }).click(),
			]);
			expect(response.ok()).toBe(true);
			expect(await response.headerValues("set-cookie")).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/^better-auth\.session_data=/),
				]),
			);
			await expect
				.poll(() => getCookie(page, "better-auth.session_data"))
				.toBeDefined();
			await expect(page).toHaveURL(new URL("/dashboard", baseURL).href);
			await expect(
				page.getByRole("heading", { name: "Dashboard" }),
			).toBeVisible();
			await expect(page.getByText("Signed in as RSC User")).toBeVisible();

			expect(await page.evaluate(() => performance.timeOrigin)).toBe(
				documentTimeOrigin,
			);
		});
	});
}
