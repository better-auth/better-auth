import assert from "node:assert";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

it("build minimal without unexpected imports", async () => {
	const esbuildDir = join(fixturesDir, "esbuild");
	const buildProcess = spawn(
		"npx",
		["esbuild", "src/minimal.ts", "--bundle", "--outfile=dist/minimal.js"],
		{
			cwd: esbuildDir,
			stdio: "pipe",
		},
	);
	await new Promise<void>((resolve, reject) => {
		buildProcess.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Vite build failed with code ${code}`));
			}
		});
	});
	const outputFile = join(esbuildDir, "dist", "minimal.js");
	const outputContent = await readFile(outputFile, "utf-8");
	assert.ok(
		!outputContent.includes("class Kysely"),
		"Built output should not contain 'kysely' imports",
	);
});
