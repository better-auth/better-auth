import { test, expect } from "@playwright/test";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const terminate = createRequire(import.meta.url)(
	// use terminate instead of cp.kill,
	//  because cp.kill will not kill the child process of the child process
	//  to avoid the zombie process
	"terminate/promise",
) as (pid: number) => Promise<void>;

const root = fileURLToPath(new URL("../", import.meta.url));
test.describe("vanilla-node", async () => {
	let serverChild: ChildProcessWithoutNullStreams;
	let clientChild: ChildProcessWithoutNullStreams;
	let clientPort: number;
	let serverPort: number;
	test.beforeEach(async () => {
		serverChild = spawn("pnpm", ["run", "start:server"], {
			cwd: root,
			stdio: "pipe",
		});
		clientChild = spawn("pnpm", ["run", "start:client"], {
			cwd: root,
			stdio: "pipe",
		});
		serverChild.stderr.on("data", (data) => {
			const message = data.toString();
			console.log(message);
		});
		serverChild.stdout.on("data", (data) => {
			const message = data.toString();
			console.log(message);
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
			}),
			new Promise<void>((resolve) => {
				serverChild.stdout.on("data", (data) => {
					const message = data.toString();
					// find: http://localhost:3000
					if (message.includes("http://localhost:")) {
						const port: string = message
							.split("http://localhost:")[1]
							.split("/")[0]
							.trim();
						serverPort = Number(port.replace(/\x1b\[[0-9;]*m/g, ""));
						resolve();
					}
				});
			}),
		]);
	});

	test.afterEach(async () => {
		await Promise.all([
			terminate(clientChild.pid!),
			terminate(serverChild.pid!),
		]);
	});

	test("signIn with existing email and password should work", async ({
		page,
	}) => {
		await page.goto(`http://localhost:${clientPort}/`);
		await page.locator("text=Ready").waitFor();
		await expect(
			page.evaluate(() => {
				return typeof window.client !== "undefined";
			}),
		).resolves.toBe(true);
		await page.pause();
		await expect(
			page.evaluate(async () => window.client.getSession()),
		).resolves.toEqual({ data: null, error: null });
		await page.evaluate(() =>
			window.client.signIn.email({
				email: "test@test.com",
				password: "password123",
			}),
		);

		// Check that the session is now set
		const cookies = await page.context().cookies();
		expect(
			cookies.find((c) => c.name === "better-auth.session_token"),
		).toBeDefined();
	});
});
