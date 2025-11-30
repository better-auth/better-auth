import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { terminate } from "@better-auth/test-utils/playwright";
import type { Page } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));

export async function runClient<R>(
	page: Page,
	fn: ({ client }: { client: Window["client"] }) => R,
): Promise<R> {
	const client = await page.evaluateHandle<Window["client"]>("window.client");
	return page.evaluate(fn, { client });
}

export function setup() {
	let clientChild: ChildProcessWithoutNullStreams;
	const ref: {
		clientPort: number;
	} = {
		clientPort: -1,
	};
	return {
		ref,
		start: async () => {
			clientChild = spawn("pnpm", ["run", "dev"], {
				cwd: root,
				stdio: "pipe",
				env: {
					...process.env,
					NO_COLOR: "1",
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
					clientChild.stdout.on("data", (data) => {
						const message = data.toString();
						// find: http://localhost:XXXX/ for vinxi dev server
						if (message.includes("http://localhost:")) {
							const match = message.match(/http:\/\/localhost:(\d+)/);
							if (match) {
								ref.clientPort = Number(match[1]);
								resolve();
							}
						}
					});
				}),
			]);
		},
		clean: async () => {
			await terminate(clientChild.pid!);
		},
	};
}
