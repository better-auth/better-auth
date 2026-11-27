import { once } from "node:events";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { launch } from "@better-auth-test/test-utils/playwright";
import type { Page, TestInfo } from "@playwright/test";
import type { BetterAuthOptions } from "better-auth";
import { createAuthServer } from "./app";

type ServerExtras = Parameters<typeof createAuthServer>[2];

async function listen(server: Server, hostname: string) {
	server.listen(0, hostname);
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to get server port");
	}
	return address.port;
}

/**
 * Spins up the auth server (no Vite client) on an ephemeral port.
 * Use for API-only E2E assertions that don't need a browser.
 */
export async function setupServer(
	overrides?: Partial<BetterAuthOptions>,
	extras?: ServerExtras,
) {
	const server = await createAuthServer(undefined, overrides, extras);
	const port = await listen(server, "127.0.0.1");
	return {
		port,
		stop: () =>
			new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			}),
	};
}

const root = fileURLToPath(new URL("../", import.meta.url));

export async function runClient<R>(
	page: Page,
	fn: ({ client }: { client: Window["client"] }) => R,
): Promise<R> {
	const client = await page.evaluateHandle<Window["client"]>("window.client");
	return page.evaluate(fn, { client });
}

export function setup(overrides?: Partial<BetterAuthOptions>) {
	let app = launch(root);
	let server: Server;
	const ref = {
		clientPort: -1,
		serverPort: -1,
	};
	return {
		ref,
		start: async () => {
			// Each test starts its own server, so it gets its own log.
			app = launch(root);
			server = await createAuthServer(undefined, overrides);
			const [serverPort, clientURL] = await Promise.all([
				listen(server, "0.0.0.0"),
				app.start(["run", "start:client"]),
			]);
			ref.serverPort = serverPort;
			ref.clientPort = Number(new URL(clientURL).port);
		},
		clean: async (testInfo: TestInfo) => {
			server.close();
			try {
				await app.stop();
			} finally {
				await testInfo.attach("vite-client.log", {
					body: app.output(),
					contentType: "text/plain",
				});
			}
		},
	};
}
