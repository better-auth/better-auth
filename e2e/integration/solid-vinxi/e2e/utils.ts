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

export function setup() {
	const app = launch(root);
	const ref = {
		clientPort: -1,
	};
	return {
		ref,
		start: async () => {
			const clientURL = await app.start(["run", "dev"]);
			ref.clientPort = Number(new URL(clientURL).port);
		},
		clean: async (testInfo: TestInfo) => {
			await app.stop();
			await testInfo.attach("vinxi-dev.log", {
				body: app.output(),
				contentType: "text/plain",
			});
		},
	};
}
