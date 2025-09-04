import { describe, it } from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";

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

		const unexpectedStrings = new Set(["node:sqlite"]);

		cp.stdout.on("data", (data) => {
			console.log(data.toString());
			for (const str of unexpectedStrings) {
				assert(
					!data.toString().includes(str),
					`Output should not contain "${str}"`,
				);
			}
		});

		cp.stderr.on("data", (data) => {
			console.error(data.toString());
			for (const str of unexpectedStrings) {
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
	});
});
