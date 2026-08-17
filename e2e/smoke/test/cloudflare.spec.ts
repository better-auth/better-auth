import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(cloudflare) simple server", () => {
	it("builds and runs the Worker", async (t) => {
		const cp = spawn("pnpm", ["run", "e2e:smoke"], {
			cwd: join(fixturesDir, "cloudflare"),
			stdio: "pipe",
		});

		t.after(() => {
			if (cp.exitCode === null) {
				cp.kill("SIGINT");
			}
		});

		const unexpectedWarnings = new Set(["node:sqlite", "node:async_hooks"]);
		let output = "";

		cp.stdout.on("data", (data) => {
			const chunk = data.toString();
			output += chunk;
			console.log(chunk);
		});

		cp.stderr.on("data", (data) => {
			const chunk = data.toString();
			output += chunk;
			console.error(chunk);
		});

		const exitCode = await new Promise<number | null>((resolve, reject) => {
			cp.once("error", reject);
			cp.once("close", resolve);
		});
		assert.equal(exitCode, 0, output);

		for (const warning of unexpectedWarnings) {
			assert(
				!output.includes(warning),
				`Output should not contain "${warning}"`,
			);
		}

		const indexJs = await fs.readFile(
			join(fixturesDir, "cloudflare", "dist", "index.js"),
			"utf-8",
		);

		const unexpectedContents = new Set([
			"createRequire",
			"node:fs",
			"node:module",
		]);
		for (const content of unexpectedContents) {
			assert(
				!indexJs.includes(content),
				`index.js should not contain "${content}"`,
			);
		}
	});
});
