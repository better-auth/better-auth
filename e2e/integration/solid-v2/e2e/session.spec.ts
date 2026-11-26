import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
	collectHydrationErrors,
	runClient,
	setup,
	waitForHydration,
} from "./utils";

const { ref, start, clean } = setup();

async function signIn(request: APIRequestContext) {
	const response = await request.post(`${ref.baseURL}/api/auth/sign-in/email`, {
		data: { email: "test@test.com", password: "password123" },
		headers: { origin: ref.baseURL },
	});
	expect(response.ok()).toBe(true);
}

test.describe("solid-v2", () => {
	test.beforeEach(async () => start());
	test.afterEach(async ({}, testInfo) => clean(testInfo));

	test("renders the signed-out state on the server and keeps it after hydration", async ({
		page,
	}) => {
		const ssrResponse = await page.request.get(ref.baseURL);
		expect(ssrResponse.ok()).toBe(true);
		expect(await ssrResponse.text()).toContain("Sign in");

		const hydrationErrors = collectHydrationErrors(page);
		await page.goto(ref.baseURL);
		await waitForHydration(page);

		await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
		expect(hydrationErrors).toEqual([]);
	});

	test("hydrates the server session without showing the signed-out state", async ({
		page,
	}) => {
		await signIn(page.request);

		const ssrResponse = await page.request.get(ref.baseURL);
		expect(await ssrResponse.text()).toContain(
			"Signed in as <!--$-->Test User",
		);

		// Record whether the signed-out link is ever attached while the page loads.
		await page.addInitScript(() => {
			const flashes: string[] = [];
			Object.assign(window, { signedOutFlashes: flashes });
			new MutationObserver(() => {
				if (document.querySelector('a[href="/sign-in"]')) {
					flashes.push(document.body.innerHTML);
				}
			}).observe(document, { childList: true, subtree: true });
		});
		const hydrationErrors = collectHydrationErrors(page);
		// The server value is only read during server rendering, so the browser
		// must not call the server function again.
		const serverFunctionCalls: string[] = [];
		page.on("request", (request) => {
			if (new URL(request.url()).pathname.startsWith("/_server")) {
				serverFunctionCalls.push(request.url());
			}
		});
		const browserSession = page.waitForResponse((response) =>
			response.url().endsWith("/api/auth/get-session"),
		);

		await page.goto(ref.baseURL);
		await waitForHydration(page);
		// The browser follows its own request after hydration; wait for it to land.
		expect(await (await browserSession).json()).toMatchObject({
			user: { name: "Test User" },
		});

		await expect(
			page.getByRole("heading", { name: "Signed in as Test User" }),
		).toBeVisible();
		const flashes = await page.evaluate(
			() =>
				(window as Window & { signedOutFlashes?: string[] }).signedOutFlashes,
		);
		expect({ flashes, hydrationErrors, serverFunctionCalls }).toEqual({
			flashes: [],
			hydrationErrors: [],
			serverFunctionCalls: [],
		});
	});

	/**
	 * After hydration the session hook keeps the server's answer when the
	 * browser's first session request fails, instead of reaching `<Errored>`.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/13000
	 */
	test("keeps the server session when the first browser session request fails", async ({
		page,
	}) => {
		await signIn(page.request);
		// Only the browser's request fails; server rendering still reads the session.
		await page.route("**/api/auth/get-session*", (route) =>
			route.fulfill({
				status: 500,
				json: { message: "Internal Server Error" },
			}),
		);

		await page.goto(ref.baseURL);
		await waitForHydration(page);
		// Wait until the failed request has reached the session atom.
		await expect
			.poll(() =>
				runClient(
					page,
					({ client }) => client.$store.atoms.session.get().error?.status,
				),
			)
			.toBe(500);

		await expect(
			page.getByRole("heading", { name: "Signed in as Test User" }),
		).toBeVisible();
		expect(await page.getByRole("alert").count()).toBe(0);
		// The kept answer is settled, not stuck waiting on the failed request.
		await expect(page.getByTestId("session-pending")).toHaveText("Settled");
	});

	test("updates the page when the user signs in and out in the browser", async ({
		page,
	}) => {
		await page.goto(ref.baseURL);
		await waitForHydration(page);
		await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

		await runClient(page, ({ client }) =>
			client.signIn.email({
				email: "test@test.com",
				password: "password123",
			}),
		);
		await expect(
			page.getByRole("heading", { name: "Signed in as Test User" }),
		).toBeVisible();

		await runClient(page, ({ client }) => client.signOut());
		await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
	});
});
