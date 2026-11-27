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
	let app = launch(root);
	const ref = {
		clientPort: -1,
	};
	return {
		ref,
		start: async () => {
			// Each test starts its own server, so it gets its own log.
			app = launch(root);
			const clientURL = await app.start(["run", "dev"]);
			ref.clientPort = Number(new URL(clientURL).port);
		},
		clean: async (testInfo: TestInfo) => {
			try {
				await app.stop();
			} finally {
				await testInfo.attach("vinxi-dev.log", {
					body: app.output(),
					contentType: "text/plain",
				});
			}
		},
	};
}
