import { expect, test } from "@playwright/test";
import { runClient, setup } from "./utils";

const { ref, start, clean } = setup();
test.describe("vanilla-node", async () => {
	test.beforeEach(async () => start());
	test.afterEach(async () => clean());

	test("signIn with existing email and password should work", async ({
		page,
	}) => {
		await page.goto(
			`http://localhost:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		await expect(
			runClient(page, ({ client }) => typeof client !== "undefined"),
		).resolves.toBe(true);
		await expect(
			runClient(page, async ({ client }) => client.getSession()),
		).resolves.toEqual({ data: null, error: null });
		await runClient(page, ({ client }) =>
			client.signIn.email({
				email: "test@test.com",
				password: "password123",
			}),
		);

		// Check that the session is now set
		const cookies = await page.context().cookies();
		expect(
			cookies.find((c) => c.name === "better-auth.session_token"),
		).toBeDefined();
	});
});
