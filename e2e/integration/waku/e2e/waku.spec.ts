import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { terminate } from "@better-auth-test/test-utils/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { COOKIE_CACHE_MAX_AGE } from "../src/constants";

const root = fileURLToPath(new URL("..", import.meta.url));

const servers = {
	dev: { build: false, command: ["run", "dev"] },
	// `--host` keeps the URL on `localhost`, which `allowedHosts` accepts.
	start: { build: true, command: ["run", "start", "--host", "localhost"] },
} as const;

function spawnScript(args: readonly string[]) {
	return spawn("pnpm", args, {
		detached: process.platform !== "win32",
		cwd: root,
		stdio: "pipe",
		env: { ...process.env, NO_COLOR: "1" },
	});
}

async function build() {
	const child = spawnScript(["run", "build"]);
	let output = "";
	child.stdout.on("data", (data) => (output += data.toString()));
	child.stderr.on("data", (data) => (output += data.toString()));
	const [code] = await once(child, "close");
	if (code !== 0) {
		throw new Error(`waku build exited with code ${code}\n${output}`);
	}
}

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
	await Promise.all([
		page.waitForResponse((response) => response.request().method() === "POST"),
		page.getByRole("button", { name: "Sign up" }).click(),
	]);
}

async function getCookie(page: Page, name: string) {
	const cookies = await page.context().cookies();
	return cookies.find((cookie) => cookie.name === name);
}

for (const [mode, server] of Object.entries(servers)) {
	test.describe(`waku ${mode}`, () => {
		// Share one server instead of starting one per worker.
		test.describe.configure({ mode: "serial" });

		let child: ChildProcessWithoutNullStreams;
		let baseURL: string;

		test.beforeAll(async () => {
			test.setTimeout(120_000);
			// Static renders run during the build, outside any request.
			if (server.build) await build();
			child = spawnScript(server.command);
			child.stderr.on("data", (data) => console.error(data.toString()));
			baseURL = await new Promise<string>((resolve, reject) => {
				child.stdout.on("data", (data) => {
					const match = data.toString().match(/http:\/\/localhost:\d+/);
					if (match) resolve(match[0]);
				});
				child.on("exit", (code) =>
					reject(new Error(`waku ${mode} exited with code ${code}`)),
				);
			});
		});

		test.afterAll(async () => {
			if (child) await terminate(child);
		});

		test("forwards every cookie set inside a server action", async ({
			page,
		}) => {
			await signUp(page, baseURL, "Action User", "action@example.com");

			const sessionToken = await getCookie(page, "better-auth.session_token");
			const sessionData = await getCookie(page, "better-auth.session_data");
			expect(sessionToken).toBeDefined();
			expect(sessionData).toBeDefined();
			// Joined into one `Set-Cookie` header, `session_data`'s Max-Age would win
			// (it's set to a short value for the test, see COOKIE_CACHE_MAX_AGE)
			expect((sessionToken?.expires ?? 0) * 1000).toBeGreaterThan(
				Date.now() + 24 * 60 * 60 * 1000,
			);

			await page.goto(baseURL);
			await expect(page.getByText("Signed in as Action User")).toBeVisible();
		});

		test("refreshes the cookie cache during an RSC navigation", async ({
			page,
		}) => {
			await signUp(page, baseURL, "RSC User", "rsc@example.com");
			await page.goto(baseURL);
			await expect(page.getByText("Signed in as RSC User")).toBeVisible();

			await expect
				.poll(() => getCookie(page, "better-auth.session_data"), {
					timeout: (COOKIE_CACHE_MAX_AGE + 5) * 1000,
				})
				.toBeUndefined();

			// The layout's `getSession()` re-issues `session_data` while rendering the
			// RSC payload for a client-side navigation.
			const [response] = await Promise.all([
				page.waitForResponse((response) =>
					new URL(response.url()).pathname.startsWith("/RSC/"),
				),
				page.getByRole("link", { name: "Dashboard" }).click(),
			]);
			expect(response.ok()).toBe(true);
			await expect(
				page.getByRole("heading", { name: "Dashboard" }),
			).toBeVisible();
			await expect(page.getByText("Signed in as RSC User")).toBeVisible();

			expect(await getCookie(page, "better-auth.session_data")).toBeDefined();
		});
	});
}
