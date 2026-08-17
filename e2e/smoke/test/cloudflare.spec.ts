import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));
const repoDir = fileURLToPath(new URL("../../..", import.meta.url));
const cloudflareSmokeTimeout = 5 * 60_000;

const assertContentDoesNotInclude = (
	fileName: string,
	content: string,
	unexpectedContents: Iterable<string>,
) => {
	for (const unexpectedContent of unexpectedContents) {
		assert(
			!content.includes(unexpectedContent),
			`${fileName} should not contain "${unexpectedContent}"`,
		);
	}
};

describe("(cloudflare) simple server", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/9983
	 */
	it("builds and runs the Worker", async (t) => {
		const cp = spawn("pnpm", ["run", "e2e:smoke"], {
			cwd: join(fixturesDir, "cloudflare"),
			stdio: "pipe",
			timeout: cloudflareSmokeTimeout,
			killSignal: "SIGKILL",
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
		assert.equal(
			exitCode,
			0,
			`Cloudflare smoke test exited with ${exitCode ?? cp.signalCode}.\n${output}`,
		);
		assertContentDoesNotInclude("output", output, unexpectedWarnings);

		const indexJs = await fs.readFile(
			join(fixturesDir, "cloudflare", "dist", "index.js"),
			"utf-8",
		);

		const unexpectedContents = new Set([
			"createRequire",
			"node:fs",
			"node:module",
		]);
		assertContentDoesNotInclude("index.js", indexJs, unexpectedContents);

		const rolldownRuntime = await fs.readFile(
			join(
				repoDir,
				"packages",
				"better-auth",
				"dist",
				"_virtual",
				"_rolldown",
				"runtime.mjs",
			),
			"utf-8",
		);

		assertContentDoesNotInclude(
			"better-auth rolldown runtime",
			rolldownRuntime,
			["createRequire", "node:module", "__require"],
		);
	});
});
