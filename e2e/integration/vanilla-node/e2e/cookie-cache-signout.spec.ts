import { expect, test } from "@playwright/test";
import { runClient, setup } from "./utils";

/**
 * @see https://github.com/better-auth/better-auth/issues/8273
 */
const { ref, start, clean } = setup({
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 60,
			strategy: "compact",
		},
	},
});

test.describe("sign-out with cookieCache", () => {
	test.beforeEach(async () => start());
	test.afterEach(async () => clean());

	test("should clear both session_token and session_data cookies on sign-out", async ({
		page,
	}) => {
		await page.goto(
			`http://localhost:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		// Sign in
		await runClient(page, ({ client }) =>
			client.signIn.email({
				email: "test@test.com",
				password: "password123",
			}),
		);

		// Verify both cookies are set
		let cookies = await page.context().cookies();
		expect(
			cookies.find((c) => c.name === "better-auth.session_token"),
		).toBeDefined();
		expect(
			cookies.find((c) => c.name === "better-auth.session_data"),
		).toBeDefined();

		// Verify session is valid
		const session = await runClient(page, ({ client }) => client.getSession());
		expect(session.data?.user.email).toBe("test@test.com");

		// Sign out
		await runClient(page, ({ client }) => client.signOut());

		// Verify both cookies are cleared by the browser
		cookies = await page.context().cookies();
		expect(
			cookies.find((c) => c.name === "better-auth.session_token"),
		).toBeUndefined();
		expect(
			cookies.find((c) => c.name === "better-auth.session_data"),
		).toBeUndefined();

		// Verify session is null
		const sessionAfter = await runClient(page, ({ client }) =>
			client.getSession(),
		);
		expect(sessionAfter.data).toBeNull();
	});
});
