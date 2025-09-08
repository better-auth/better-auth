import type { Page } from "@playwright/test";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { terminate } from '@better-auth/test-utils/playwright'

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
		serverPort: number;
	} = {
		clientPort: -1,
		serverPort: -1,
	};
	return {
		ref,
		start: async () => {
			clientChild = spawn("pnpm", ["run", "dev"], {
				cwd: root,
				stdio: "pipe",
			});
			clientChild.stderr.on("data", (data) => {
				const message = data.toString();
				console.log(message);
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
						if (
							message.includes("Local:") &&
							message.includes("http://localhost:")
						) {
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
