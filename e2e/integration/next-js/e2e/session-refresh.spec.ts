import type { APIRequestContext, BrowserContext } from "@playwright/test";
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

async function signUp(context: BrowserContext, email: string) {
	const response = await context.request.post(
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
		response.ok(),
		`${response.status()} ${await response.text()}\n${app.output}`,
	).toBe(true);
}

async function getSessionCookie(context: BrowserContext) {
	const sessionCookie = (await context.cookies(app.baseURL)).find(
		(cookie) => cookie.name === "better-auth.session_token",
	);
	expect(sessionCookie).toBeDefined();
	return sessionCookie!;
}

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
	test.describe.configure({ mode: "serial" });

	test.beforeEach(async () => {
		await app.start();
	});

	test.afterEach(async () => {
		await app.clean();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9776
	 */
	test("keeps RSC reads side-effect free when Next.js proxy strips routing headers", async ({
		context,
		page,
	}) => {
		const email = "next-js-rsc@example.com";
		await signUp(context, email);

		await page.goto(app.baseURL);

		const sessionCookieBefore = await getSessionCookie(context);
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

		const sessionCookieAfter = await getSessionCookie(context);
		expect(sessionCookieAfter).toEqual(sessionCookieBefore);
		const sessionExpiryAfter = await getSessionExpiry(
			context.request,
			app.baseURL,
		);
		expect(sessionExpiryAfter).toBe(sessionExpiryBefore);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10588
	 */
	test("refreshes the database session and browser cookie through POST", async ({
		context,
		page,
	}) => {
		const email = "next-js-client@example.com";
		await signUp(context, email);

		const sessionCookieBefore = await getSessionCookie(context);
		const sessionExpiryBefore = await getSessionExpiry(
			context.request,
			app.baseURL,
		);
		await page.waitForTimeout(1100);

		const [refreshResponse] = await Promise.all([
			page.waitForResponse((response) => {
				const url = new URL(response.url());
				return (
					url.pathname === "/api/auth/refresh-session" &&
					response.request().method() === "POST"
				);
			}),
			page.goto(`${app.baseURL}/client-session`),
		]);

		const refreshBody = await refreshResponse.text();
		expect(
			refreshResponse.ok(),
			`${refreshResponse.status()} ${refreshBody}\n${app.output}`,
		).toBe(true);
		const refreshedSession = JSON.parse(refreshBody) as SessionResponse | null;
		expect(refreshedSession?.user.email).toBe(email);
		expect(await refreshResponse.headerValue("set-cookie")).toContain(
			"better-auth.session_token=",
		);
		await expect(page.getByTestId("session-email")).toHaveText(email);

		const sessionCookieAfter = await getSessionCookie(context);
		const sessionExpiryAfter = await getSessionExpiry(
			context.request,
			app.baseURL,
		);
		expect(sessionCookieAfter.expires).toBeGreaterThan(
			sessionCookieBefore.expires,
		);
		expect(sessionExpiryAfter).toBeGreaterThan(sessionExpiryBefore);
	});
});
