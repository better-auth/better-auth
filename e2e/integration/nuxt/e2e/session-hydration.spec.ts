import { fileURLToPath } from "node:url";
import { expect, test } from "@nuxt/test-utils/playwright";

test.use({
	nuxt: {
		rootDir: fileURLToPath(new URL("..", import.meta.url)),
	},
});

/**
 * @see https://github.com/better-auth/better-auth/issues/5358
 */
test("hydrates an authenticated session without mismatch or refetch", async ({
	page,
	goto,
}) => {
	await goto("/", { waitUntil: "hydration" });
	const appURL = new URL(page.url());
	const signUpResponse = await page.request.post(
		new URL("/api/auth/sign-up/email", appURL).href,
		{
			data: {
				name: "Nuxt User",
				email: "nuxt@example.com",
				password: "password123",
			},
		},
	);
	expect(signUpResponse.ok()).toBe(true);
	expect(signUpResponse.headers()["set-cookie"]).toContain(
		"better-auth.session_token",
	);
	const sessionCookie = (await page.context().cookies()).find((cookie) =>
		cookie.name.includes("session_token"),
	);
	expect(sessionCookie).toBeDefined();

	const sessionResponse = await page.request.get(
		new URL("/api/auth/get-session", appURL).href,
	);
	expect(sessionResponse.ok()).toBe(true);
	expect(await sessionResponse.json()).toMatchObject({
		user: { name: "Nuxt User" },
	});

	const ssrResponse = await page.request.get(appURL.href);
	expect(ssrResponse.ok()).toBe(true);
	const ssrHTML = await ssrResponse.text();
	expect(ssrHTML).toContain("Signed in as Nuxt User");

	const hydrationMessages: string[] = [];
	const clientSessionRequests: string[] = [];
	page.on("console", (message) => {
		if (/hydration|mismatch/i.test(message.text())) {
			hydrationMessages.push(message.text());
		}
	});
	page.on("pageerror", (error) => {
		hydrationMessages.push(error.message);
	});
	page.on("request", (request) => {
		if (new URL(request.url()).pathname === "/api/auth/get-session") {
			clientSessionRequests.push(request.url());
		}
	});

	await goto("/", { waitUntil: "hydration" });

	await expect(
		page.getByRole("heading", { name: "Signed in as Nuxt User" }),
	).toBeVisible();
	// Observe a short post-hydration window for deferred session requests.
	await page.waitForTimeout(500);
	expect({ clientSessionRequests, hydrationMessages }).toEqual({
		clientSessionRequests: [],
		hydrationMessages: [],
	});
});
