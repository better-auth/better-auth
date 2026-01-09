import * as assert from "node:assert";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(vite) client build", () => {
	it("builds client without unexpected imports", async () => {
		const viteDir = join(fixturesDir, "vite");

		// Run vite build
		const buildProcess = spawn("npx", ["vite", "build"], {
			cwd: viteDir,
			stdio: "pipe",
		});

		const unexpectedStrings = ["async_hooks"] as const;

		// Wait for build to complete
		await new Promise<void>((resolve, reject) => {
			buildProcess.on("close", (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Vite build failed with code ${code}`));
				}
			});

			buildProcess.on("error", (error) => {
				reject(error);
			});

			// Log build output for debugging
			buildProcess.stdout.on("data", (data) => {
				if (unexpectedStrings.some((str) => data.toString().includes(str))) {
					reject(
						new Error(
							`Vite build output contains unexpected string: ${data.toString()}`,
						),
					);
				}
				console.log(data.toString());
			});

			buildProcess.stderr.on("data", (data) => {
				if (unexpectedStrings.some((str) => data.toString().includes(str))) {
					reject(
						new Error(
							`Vite build error output contains unexpected string: ${data.toString()}`,
						),
					);
				}
				console.error(data.toString());
			});
		});

		const clientFile = join(viteDir, "dist", "client.js");
		const clientContent = await readFile(clientFile, "utf-8");

		assert.ok(
			!clientContent.includes("createEndpoint"),
			"Built output should not contain 'better-call' imports",
		);

		assert.ok(
			!clientContent.includes("async_hooks"),
			"Built output should not contain 'async_hooks' imports",
		);

		assert.ok(
			!clientContent.includes("AsyncLocalStorage"),
			"Built output should not contain 'AsyncLocalStorage' imports",
		);
	});
});
