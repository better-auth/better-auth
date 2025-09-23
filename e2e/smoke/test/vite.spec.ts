import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as assert from "node:assert";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(vite) client build", () => {
	it("builds client without better-call imports", async () => {
		const viteDir = join(fixturesDir, "vite");

		// Run vite build
		const buildProcess = spawn("npx", ["vite", "build"], {
			cwd: viteDir,
			stdio: "pipe",
		});

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
				console.log(data.toString());
			});

			buildProcess.stderr.on("data", (data) => {
				console.error(data.toString());
			});
		});

		const clientFile = join(viteDir, "dist", "client.js");
		const clientContent = await readFile(clientFile, "utf-8");

		assert.ok(
			!clientContent.includes("createEndpoint"),
			"Built output should not contain 'better-call' imports",
		);
	});
});
