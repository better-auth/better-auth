import type { Page } from "@playwright/test";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createAuthServer } from "./app";
import { terminate } from "@better-auth/test-utils/playwright";

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
		start: async (options?: { baseURL?: string; https?: boolean }) => {
			server = await createAuthServer(options?.baseURL, options?.https);
			clientChild = spawn("pnpm", ["run", "start:client"], {
				cwd: root,
				stdio: "pipe",
				env: {
					...process.env,
					HTTPS: options?.https ? "1" : "0",
				},
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
							console.log(`Server listening on port ${ref.serverPort}`);
							resolve();
						}
					});
				}),
				new Promise<void>((resolve) => {
					clientChild.stdout.on("data", (data) => {
						const message = data.toString();
						// find: http://localhost:5173/
						if (
							message.includes("http://localhost:") ||
							message.includes("https://localhost:")
						) {
							const port: string = message
								.split("http")[1]
								.split("localhost:")[1]
								.split("/")[0];
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
