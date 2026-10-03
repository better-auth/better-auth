import assert from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(bun) zero-config default export", () => {
	it("auto-serves auth via default export (no Bun.serve call)", async (t) => {
		const cp = spawn("bun", [join(fixturesDir, "bun-default-export.ts")], {
			stdio: "pipe",
			// `BUN_PORT=0` delegates port selection to the OS
			env: { ...process.env, BUN_PORT: "0" },
		});
		t.after(() => {
			cp.kill("SIGINT");
		});
		cp.stderr.on("data", (data) => console.error(data.toString()));

		const port = await new Promise<number>((resolve, reject) => {
			let buffer = "";
			cp.stdout.on("data", (data) => {
				const chunk = data.toString();
				console.log(chunk);
				buffer += chunk;
				const m = buffer.match(/http:\/\/localhost:(\d+)/);
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
					email: "bun-default@test.com",
					password: "password",
					name: "bun-default",
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
