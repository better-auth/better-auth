import assert from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(deno) zero-config default export", () => {
	it("auto-serves auth via default export (deno serve)", async (t) => {
		const port = 4002;
		const cp = spawn(
			"deno",
			[
				"serve",
				"-A",
				"--port",
				String(port),
				join(fixturesDir, "deno-default-export.ts"),
			],
			{ stdio: "pipe" },
		);
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
						email: "deno-default@test.com",
						password: "password",
						name: "deno-default",
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
