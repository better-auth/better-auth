import assert from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("(deno) simple server", () => {
	it("run server", async (t) => {
		const cp = spawn("deno", ["-A", join(fixturesDir, "deno-simple.ts")], {
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
		const port = await new Promise<number>((resolve) => {
			cp.stdout.once("data", (data) => {
				const port = +data.toString().split(":")[2].split("/")[0];
				assert.ok(port > 0);
				assert.ok(!isNaN(port));
				assert.ok(isFinite(port));
				resolve(port);
			});
		});
		const response = await fetch(
			`http://localhost:${port}/api/auth/sign-up/email`,
			{
				method: "POST",
				body: JSON.stringify({
					email: "test-2@test.com",
					password: "password",
					name: "test-2",
				}),
				headers: {
					"content-type": "application/json",
				},
			},
		);
		assert.ok(response.ok);
	});
});
