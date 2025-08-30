import { test, expect } from "@playwright/test";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
test.describe("vanilla-node", async () => {
	let serverChild: ChildProcessWithoutNullStreams;
	let clientChild: ChildProcessWithoutNullStreams;
	let clientPort: number;
	test.beforeEach(async () => {
		serverChild = spawn("pnpm", ["run", "start:server"], {
			cwd: root,
			stdio: "pipe",
		});
		clientChild = spawn("pnpm", ["run", "start:client"], {
			cwd: root,
			stdio: "pipe",
		});
		serverChild.stdout.on("data", (data) => {
			const message = data.toString();
			console.log(message);
		});
		clientChild.stdout.on("data", (data) => {
			const message = data.toString();
			console.log(message);
		});

		return new Promise<void>((resolve) => {
			clientChild.stdout.on("data", (data) => {
				const message = data.toString();
				// find: http://localhost:5173/
				if (message.includes("http://localhost:")) {
					const port: string = message
						.split("http://localhost:")[1]
						.split("/")[0]
						.trim();
					clientPort = Number(port.replace(/\x1b\[[0-9;]*m/g, ""));
					resolve();
				}
			});
		});
	});

	test.afterEach(async () => {
		clientChild.kill("SIGTERM");
		serverChild.kill("SIGTERM");
	});

	test("signIn with existing email and password should work", async ({
		page,
	}) => {
		await page.goto(`http://localhost:${clientPort}/`);
		await page.locator("text=Ready").waitFor();
		await expect(
			page.evaluate(() => {
				// @ts-expect-error We don't declare this in the types
				return typeof window.client !== "undefined";
			}),
		).resolves.toBe(true);
	});
});
