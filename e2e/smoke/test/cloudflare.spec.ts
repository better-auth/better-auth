import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));
const repoDir = fileURLToPath(new URL("../../..", import.meta.url));

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
	it("check repo", async (t) => {
		const cp = spawn("pnpm", ["run", "check"], {
			cwd: join(fixturesDir, "cloudflare"),
			stdio: "pipe",
		});
		let stdout = "";
		let stderr = "";

		t.after(() => {
			if (cp.exitCode === null) {
				cp.kill("SIGINT");
			}
		});

		const unexpectedWarnings = new Set(["node:sqlite", "node:async_hooks"]);
		const exitMarker = "exiting now.";

		cp.stdout.on("data", (data) => {
			const text = data.toString();
			stdout += text;
			console.log(text);
			assertContentDoesNotInclude("stdout", stdout, unexpectedWarnings);
		});

		cp.stderr.on("data", (data) => {
			const text = data.toString();
			stderr += text;
			console.error(text);
			assertContentDoesNotInclude("stderr", stderr, unexpectedWarnings);
		});

		const exitCode = await new Promise<number | null>((resolve, reject) => {
			cp.on("error", reject);
			cp.on("close", resolve);
		});
		assert.equal(
			exitCode,
			0,
			`Cloudflare fixture check failed.\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
		);
		assert(
			stdout.includes(exitMarker),
			`Cloudflare fixture check exited before Wrangler completed.\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
		);

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
