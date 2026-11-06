import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { cliPath } from "./utils";

const execFileAsync = promisify(execFile);

beforeAll(() => {
	if (!existsSync(cliPath)) {
		throw new Error(
			`CLI binary not found at "${cliPath}". Run "pnpm --filter auth build" before running this test.`,
		);
	}
});

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
