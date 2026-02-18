import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(cloudflare) simple server", () => {
	it("check repo", async (t) => {
		const cp = spawn("npm", ["run", "check"], {
			cwd: join(fixturesDir, "cloudflare"),
			stdio: "pipe",
		});

		t.after(() => {
			cp.kill("SIGINT");
		});

		const unexpectedWarnings = new Set(["node:sqlite", "node:async_hooks"]);

		cp.stdout.on("data", (data) => {
			console.log(data.toString());
			for (const str of unexpectedWarnings) {
				assert(
					!data.toString().includes(str),
					`Output should not contain "${str}"`,
				);
			}
		});

		cp.stderr.on("data", (data) => {
			console.error(data.toString());
			for (const str of unexpectedWarnings) {
				assert(
					!data.toString().includes(str),
					`Error output should not contain "${str}"`,
				);
			}
		});

		await new Promise<void>((resolve) => {
			cp.stdout.on("data", (data) => {
				if (data.toString().includes("exiting now.")) {
					resolve();
				}
			});
		});

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
