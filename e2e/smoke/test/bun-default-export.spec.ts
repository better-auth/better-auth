import assert from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(bun) zero-config default export", () => {
	it("auto-serves auth via default export (no Bun.serve call)", async (t) => {
		const port = 4001;
		const cp = spawn("bun", [join(fixturesDir, "bun-default-export.ts")], {
			stdio: "pipe",
			env: { ...process.env, BUN_PORT: String(port) },
		});
		t.after(() => {
			cp.kill("SIGINT");
		});
		cp.stdout.on("data", (data) => console.log(data.toString()));
		cp.stderr.on("data", (data) => console.error(data.toString()));

		const url = `http://localhost:${port}/api/auth/sign-up/email`;
		const deadline = Date.now() + 10_000;
		let response: Response | undefined;
		while (Date.now() < deadline) {
			try {
				response = await fetch(url, {
					method: "POST",
					body: JSON.stringify({
						email: "bun-default@test.com",
						password: "password",
						name: "bun-default",
					}),
					headers: {
						"content-type": "application/json",
						origin: `http://localhost:${port}`,
					},
				});
				break;
			} catch {
				await new Promise((r) => setTimeout(r, 100));
			}
		}
		assert.ok(response, "Server did not start within 10s");
		assert.ok(response.ok, `Expected 2xx, got ${response.status}`);
	});
});
