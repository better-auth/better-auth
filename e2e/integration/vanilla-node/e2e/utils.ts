import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { terminate } from "@better-auth/test-utils/playwright";
import type { Page } from "@playwright/test";
import { createAuthServer } from "./app";

const root = fileURLToPath(new URL("../", import.meta.url));

export async function runClient<R>(
	page: Page,
	fn: ({ client }: { client: Window["client"] }) => R,
): Promise<R> {
	const client = await page.evaluateHandle<Window["client"]>("window.client");
	return page.evaluate(fn, { client });
}

export function setup() {
	let server: Awaited<ReturnType<typeof createAuthServer>>;
	let clientChild: ChildProcessWithoutNullStreams;
	const ref: {
		clientPort: number;
		serverPort: number;
	} = {
		clientPort: -1,
		serverPort: -1,
	};
	return {
		ref,
		start: async () => {
			server = await createAuthServer();
			clientChild = spawn("pnpm", ["run", "start:client"], {
				cwd: root,
				stdio: "pipe",
			});
			clientChild.stderr.on("data", (data) => {
				const message = data.toString();
				console.error(message);
			});
			clientChild.stdout.on("data", (data) => {
				const message = data.toString();
				console.log(message);
			});

			await Promise.all([
				new Promise<void>((resolve) => {
					server.listen(0, "0.0.0.0", () => {
						const address = server.address();
						if (address && typeof address === "object") {
							ref.serverPort = address.port;
							resolve();
						}
					});
				}),
				new Promise<void>((resolve) => {
					clientChild.stdout.on("data", (data) => {
						const message = data.toString();
						// find: http://localhost:5173/
						if (message.includes("http://localhost:")) {
							const port: string = message
								.split("http://localhost:")[1]
								.split("/")[0]
								.trim();
							ref.clientPort = Number(port.replace(/\x1b\[[0-9;]*m/g, ""));
							resolve();
						}
					});
				}),
			]);
		},
		clean: async () => {
			await terminate(clientChild.pid!);
			server.close();
		},
	};
}
