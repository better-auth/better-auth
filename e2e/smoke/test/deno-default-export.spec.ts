import assert from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(deno) zero-config default export", () => {
	it("auto-serves auth via default export (deno serve)", async (t) => {
		const cp = spawn(
			"deno",
			[
				"serve",
				"-A",
				// `--port 0` delegates port selection to the OS
				"--port",
				"0",
				join(fixturesDir, "deno-default-export.ts"),
			],
			{ stdio: "pipe" },
		);
		t.after(() => {
			cp.kill("SIGINT");
		});
		cp.stdout.on("data", (data) => console.log(data.toString()));

		const port = await new Promise<number>((resolve, reject) => {
			let buffer = "";
			cp.stderr.on("data", (data) => {
				const chunk = data.toString();
				console.error(chunk);
				buffer += chunk;
				const m = buffer.match(/Listening on http:\/\/[^:]+:(\d+)/);
				if (m) resolve(Number(m[1]));
			});
			cp.on("exit", (code) =>
				reject(new Error(`child exited (code ${code}) before reporting port`)),
			);
		});

		const response = await fetch(
			`http://localhost:${port}/api/auth/sign-up/email`,
			{
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
			},
		);
		assert.ok(response.ok, `Expected 2xx, got ${response.status}`);
	});
});
