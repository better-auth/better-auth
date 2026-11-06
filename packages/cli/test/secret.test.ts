import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { cliPath } from "./utils";

const execFileAsync = promisify(execFile);

describe("secret", () => {
	it("prints only the env line on stdout", async () => {
		const { stdout, stderr } = await execFileAsync(process.execPath, [
			cliPath,
			"secret",
		]);

		expect(stdout).toMatch(/^BETTER_AUTH_SECRET=[0-9a-f]{64}\n$/);
		expect(stderr).toContain(".env");
	});
});
