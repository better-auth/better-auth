import { fileURLToPath } from "node:url";
import { launch } from "@better-auth-test/test-utils/playwright";
import type { Page, TestInfo } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));

export async function runClient<R>(
	page: Page,
	fn: ({ client }: { client: Window["client"] }) => R,
): Promise<R> {
	const client = await page.evaluateHandle<Window["client"]>("window.client");
	return page.evaluate(fn, { client });
}

/**
 * Resolves once the app has hydrated and exposed its auth client.
 */
export async function waitForHydration(page: Page) {
	await page.waitForFunction(() => typeof window.client !== "undefined");
}

/**
 * Collects console messages and page errors that report a hydration problem.
 */
export function collectHydrationErrors(page: Page) {
	const messages: string[] = [];
	page.on("console", (message) => {
		if (/hydration|mismatch/i.test(message.text())) {
			messages.push(message.text());
		}
	});
	page.on("pageerror", (error) => {
		messages.push(error.message);
	});
	return messages;
}

export function setup() {
	let app = launch(root);
	const ref = {
		baseURL: "",
	};
	return {
		ref,
		start: async () => {
			// Each test starts its own server, so it gets its own log.
			app = launch(root);
			ref.baseURL = await app.start(["run", "dev"]);
		},
		clean: async (testInfo: TestInfo) => {
			try {
				await app.stop();
			} finally {
				await testInfo.attach("vite-dev.log", {
					body: app.output(),
					contentType: "text/plain",
				});
			}
		},
	};
}
