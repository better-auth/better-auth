import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { setup } from "./utils";

type SessionResponse = {
	session: {
		expiresAt: string;
	};
	user: {
		email: string;
	};
};

const app = setup();

async function getSessionExpiry(request: APIRequestContext, baseURL: string) {
	const response = await request.get(
		`${baseURL}/api/auth/get-session?disableRefresh=true`,
	);
	if (!response.ok()) {
		throw new Error(
			`${response.status()} ${await response.text()}\n${app.output}`,
		);
	}
	const session = (await response.json()) as SessionResponse | null;
	expect(session).not.toBeNull();
	const sessionExpiry = new Date(session!.session.expiresAt).getTime();
	expect(Number.isNaN(sessionExpiry)).toBe(false);
	return sessionExpiry;
}

test.describe("Next.js session refresh", () => {
	test.beforeEach(async () => {
		await app.start();
	});

	test.afterEach(async () => {
		await app.clean();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9776
	 */
	test("does not refresh the session during an RSC render", async ({
		context,
		page,
	}) => {
		const email = "next-js-rsc@example.com";
		const signUpResponse = await context.request.post(
			`${app.baseURL}/api/auth/sign-up/email`,
			{
				data: {
					email,
					name: "Next.js RSC",
					password: "password123",
				},
			},
		);
		expect(
			signUpResponse.ok(),
			`${signUpResponse.status()} ${await signUpResponse.text()}\n${app.output}`,
		).toBe(true);

		await page.goto(app.baseURL);

		const sessionCookieBefore = (await context.cookies(app.baseURL)).find(
			(cookie) => cookie.name === "better-auth.session_token",
		);
		expect(sessionCookieBefore).toBeDefined();
		const sessionExpiryBefore = await getSessionExpiry(
			context.request,
			app.baseURL,
		);

		await page.evaluate(() => {
			Reflect.set(window, "__betterAuthE2ENavigationMarker", true);
		});
		const [navigationResponse] = await Promise.all([
			page.waitForResponse((response) => {
				const url = new URL(response.url());
				return (
					url.pathname === "/session" && response.request().method() === "GET"
				);
			}),
			page.getByRole("link", { name: "Read session" }).click(),
		]);
		await expect(page.getByTestId("session-email")).toHaveText(email);
		expect(navigationResponse.ok()).toBe(true);
		expect(await navigationResponse.headerValue("set-cookie")).toBeNull();
		expect(
			await page.evaluate(() =>
				Reflect.get(window, "__betterAuthE2ENavigationMarker"),
			),
		).toBe(true);

		const sessionCookieAfter = (await context.cookies(app.baseURL)).find(
			(cookie) => cookie.name === "better-auth.session_token",
		);
		expect(sessionCookieAfter).toBeDefined();
		expect(sessionCookieAfter).toEqual(sessionCookieBefore);
		const sessionExpiryAfter = await getSessionExpiry(
			context.request,
			app.baseURL,
		);
		expect(sessionExpiryAfter).toBe(sessionExpiryBefore);
	});
});
