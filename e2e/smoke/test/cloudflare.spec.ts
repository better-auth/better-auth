import { describe, it } from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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

		cp.stdout.on("data", (data) => {
			console.log(data.toString());
		});

		cp.stderr.on("data", (data) => {
			console.error(data.toString());
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
