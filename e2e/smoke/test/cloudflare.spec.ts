import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { terminate } from "@better-auth-test/test-utils/playwright";

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
		});

		const stopProcessTree = async () => {
			if (
				cp.pid === undefined ||
				cp.exitCode !== null ||
				cp.signalCode !== null
			) {
				return;
			}
			await terminate(cp.pid);
		};
		t.after(stopProcessTree);

		const unexpectedWarnings = new Set(["node:sqlite", "node:async_hooks"]);
		let output = "";

		const exitCode = await new Promise<number | null>((resolve, reject) => {
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const clearTimer = () => {
				if (timer !== undefined) clearTimeout(timer);
			};
			const fail = (error: Error) => {
				if (settled) return;
				settled = true;
				clearTimer();
				void stopProcessTree().then(() => reject(error), reject);
			};
			const recordOutput = (data: Buffer, write: (chunk: string) => void) => {
				const chunk = data.toString();
				output += chunk;
				write(chunk);
				const unexpectedWarning = [...unexpectedWarnings].find((warning) =>
					output.includes(warning),
				);
				if (unexpectedWarning) {
					fail(
						new Error(
							`Cloudflare smoke test emitted unexpected warning "${unexpectedWarning}".\n${output}`,
						),
					);
				}
			};

			cp.stdout.on("data", (data: Buffer) => recordOutput(data, console.log));
			cp.stderr.on("data", (data: Buffer) => recordOutput(data, console.error));
			timer = setTimeout(
				() =>
					fail(
						new Error(
							`Cloudflare smoke test timed out after ${cloudflareSmokeTimeout}ms.\n${output}`,
						),
					),
				cloudflareSmokeTimeout,
			);
			cp.once("error", fail);
			cp.once("close", (code) => {
				if (settled) return;
				settled = true;
				clearTimer();
				resolve(code);
			});
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
