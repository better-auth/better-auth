import { chromium, expect, test } from "@playwright/test";
import { runClient, setup } from "./utils";

const { ref, start, clean } = setup();
test.describe("cross domain", async () => {
	test.beforeEach(async () =>
		start({
			baseURL: "https://demo.com",
			https: true,
		}),
	);
	test.afterEach(async () => clean());

	test("should work across domains", async () => {
		const browser = await chromium.launch({
			args: [
				"--host-resolver-rules=MAP * localhost",
				"--ignore-certificate-errors",
			],
		});

		const page = await browser.newPage();

		await page.goto(
			`https://test.com:${ref.clientPort}/?port=${ref.serverPort}&https=1`,
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

		// Check that the session is set
		const cookies = await page.context().cookies();
		expect(
			cookies.find((c) => c.name === "__Secure-better-auth.session_token"),
		).toBeDefined();

		// Check that we can get the session
		await expect(
			runClient(page, async ({ client }) => client.getSession()),
		).resolves.toEqual(
			expect.objectContaining({
				data: expect.objectContaining({
					session: expect.objectContaining({}),
					user: expect.objectContaining({
						email: "test@test.com",
					}),
				}),
				error: null,
			}),
		);
	});
});
