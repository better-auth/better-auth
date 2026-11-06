import { fileURLToPath } from "node:url";
import { launch } from "@better-auth-test/test-utils/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * `load` fires before the client hydrates, and a click before hydration races
 * the form navigation with SvelteKit's startup `replaceState`.
 *
 * @see https://github.com/sveltejs/kit/blob/2ec690e0c7ccebdb2fcf1838da35ffbacbf950d8/packages/kit/test/utils.js#L113-L145
 */
async function goto(page: Page, url: string) {
	await page.goto(url);
	await page.locator("body.started").waitFor();
}

const app = launch(root);
let baseURL: string;

test.beforeAll(async () => {
	baseURL = await app.start(["run", "dev"]);
});

// Runs even when `beforeAll` times out, unlike `afterEach`.
test.afterAll(async ({}, testInfo) => {
	try {
		await app.stop();
	} finally {
		await testInfo.attach("vite-dev.log", {
			body: app.output(),
			contentType: "text/plain",
		});
	}
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10928
 */
test("signs up through a SvelteKit 3 form action and reads the session", async ({
	page,
}) => {
	await goto(page, baseURL);
	await page.getByLabel("Name").fill("Kit User");
	await page.getByLabel("Email").fill("kit@example.com");
	await page.getByLabel("Password").fill("password123");
	await Promise.all([
		page.waitForResponse((response) => response.request().method() === "POST"),
		page.getByRole("button", { name: "Sign up" }).click(),
	]);

	// `sveltekitCookies` forwards the session cookie set inside the action.
	const cookies = await page.context().cookies();
	expect(
		cookies.find((cookie) => cookie.name === "better-auth.session_token"),
	).toBeDefined();

	// `getSession` in `hooks.server.ts` reads it on the next request.
	await goto(page, baseURL);
	await expect(
		page.getByRole("heading", { name: "Signed in as Kit User" }),
	).toBeVisible();

	// `svelteKitHandler` routes auth endpoints to Better Auth.
	const sessionResponse = await page.request.get(
		`${baseURL}/api/auth/get-session`,
	);
	expect(await sessionResponse.json()).toMatchObject({
		user: { name: "Kit User" },
	});
});
